"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { checkSchedulingConflicts } from "@/lib/rules";

async function requireTpo() {
  const session = await getSession();
  assertRole(session, "TPO");
  return session;
}

export async function scheduleInterviewAction(formData: FormData) {
  await requireTpo();

  const applicationId = String(formData.get("applicationId"));
  const driveId = String(formData.get("driveId"));
  const stage = String(formData.get("stage") || "Interview");
  const scheduledAt = new Date(String(formData.get("scheduledAt")));
  const durationMins = Math.min(240, Math.max(10, Number(formData.get("durationMins")) || 30));
  const venue = String(formData.get("venue") || "") || null;
  const panel = String(formData.get("panel") || "") || null;

  const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });

  const dayStart = new Date(scheduledAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(scheduledAt);
  dayEnd.setHours(23, 59, 59, 999);

  const existing = await prisma.interview.findMany({
    where: { scheduledAt: { gte: dayStart, lte: dayEnd } },
    include: { application: true },
  });

  const conflict = checkSchedulingConflicts(
    {
      studentId: application.studentId,
      venue,
      panel,
      scheduledAt,
      durationMins,
    },
    existing.map((e) => ({
      id: e.id,
      studentId: e.application.studentId,
      venue: e.venue,
      panel: e.panel,
      scheduledAt: e.scheduledAt,
      durationMins: e.durationMins,
    }))
  );

  const interview = await prisma.interview.create({
    data: {
      driveId,
      applicationId,
      stage,
      scheduledAt,
      durationMins,
      venue,
      panel,
      hasConflict: conflict.hasConflict,
      conflictNote: conflict.notes.join("; ") || null,
    },
  });

  await prisma.application.update({ where: { id: applicationId }, data: { stage: "INTERVIEW" } });

  await prisma.notification.create({
    data: {
      studentId: application.studentId,
      type: "INTERVIEW_SCHEDULE",
      title: `Interview scheduled: ${stage}`,
      message: `Your ${stage} is scheduled for ${scheduledAt.toLocaleString()}${venue ? ` at ${venue}` : ""}.`,
    },
  });

  revalidatePath("/tpo/scheduling");
  revalidatePath(`/tpo/drives/${driveId}`);
  revalidatePath("/student/journey");
  return { interview, conflict };
}

/* ======================= Offer pipeline =======================
 * SELECTED → (recruiter) OFFER_REQUESTED → (TPO) OFFER_SENT →
 *   (student) OFFER_ACCEPTED or OFFER_DECLINED → (TPO) documentsVerified → JOINED
 * A decline only affects THIS application — it never marks the student
 * unplaced overall, since they may still be active on other drives.
 * ================================================================= */

/** Recruiter requests an offer for a candidate they've already marked Selected. Package is fixed here — the TPO forwards it as-is, doesn't edit it. */
export async function requestOfferAction(applicationId: string, formData: FormData) {
  const session = await getSession();
  assertRole(session, "RECRUITER");

  const offerPackage = String(formData.get("offerPackage") || "").trim();
  if (!offerPackage) throw new Error("Please enter the package you're offering.");

  const recruiter = await prisma.recruiter.findUniqueOrThrow({ where: { userId: session.userId } });
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { drive: true, student: { include: { user: true } } },
  });

  if (application.drive.recruiterId !== recruiter.id) {
    throw new Error("You can only request offers for your own drives.");
  }
  if (application.stage !== "SELECTED") {
    throw new Error('This candidate must be marked "Selected" before you can request an offer.');
  }

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { stage: "OFFER_REQUESTED", offerPackage, offerRequestedAt: new Date() },
  });

  await prisma.tpoNotification.create({
    data: {
      type: "OFFER_UPDATE",
      title: "Offer request awaiting review",
      message: `${application.drive.companyName} wants to offer ${application.student.rollNo} (${application.student.user.name}) ${offerPackage} for ${application.drive.jobRole}.`,
    },
  });

  revalidatePath(`/recruiter/drives/${application.driveId}`);
  revalidatePath("/tpo/offers");
  revalidatePath("/tpo/notifications");
  revalidatePath(`/tpo/drives/${application.driveId}`);
  return updated;
}

/** TPO forwards a recruiter's requested offer to the student, exactly as proposed. */
export async function sendOfferToStudentAction(applicationId: string) {
  await requireTpo();

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { drive: true },
  });
  if (application.stage !== "OFFER_REQUESTED") {
    throw new Error("This offer isn't awaiting TPO review.");
  }

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { stage: "OFFER_SENT", offerSentAt: new Date() },
  });

  await prisma.student.update({ where: { id: application.studentId }, data: { placementStatus: "OFFER_RECEIVED" } });

  await prisma.notification.create({
    data: {
      studentId: application.studentId,
      type: "OFFER_UPDATE",
      title: `You've received an offer from ${application.drive.companyName}!`,
      message: `Package: ${application.offerPackage}. Visit your Placement Journey to accept or decline.`,
    },
  });

  revalidatePath("/tpo/offers");
  revalidatePath("/student/journey");
  revalidatePath("/student/notifications");
  return updated;
}

/** Student accepts or declines an offer sent to them. */
export async function studentRespondToOfferAction(applicationId: string, response: "ACCEPT" | "DECLINE") {
  const session = await getSession();
  assertRole(session, "STUDENT");

  const student = await prisma.student.findUniqueOrThrow({ where: { userId: session.userId } });
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { drive: { include: { recruiter: true } } },
  });

  if (application.studentId !== student.id) {
    throw new Error("This isn't your offer to respond to.");
  }
  if (application.stage !== "OFFER_SENT") {
    throw new Error("This offer isn't awaiting your response.");
  }

  const accepted = response === "ACCEPT";
  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { stage: accepted ? "OFFER_ACCEPTED" : "OFFER_DECLINED", offerRespondedAt: new Date() },
  });

  // A decline is scoped to this one drive only — never overwrite the student's
  // overall status, since they may still be in the running elsewhere.
  if (accepted) {
    await prisma.student.update({ where: { id: student.id }, data: { placementStatus: "OFFER_ACCEPTED" } });
  }

  await Promise.all([
    prisma.recruiterNotification.create({
      data: {
        recruiterId: application.drive.recruiterId,
        type: "OFFER_RESPONSE",
        title: accepted ? "Offer accepted!" : "Offer declined",
        message: `${student.rollNo} has ${accepted ? "accepted" : "declined"} your offer for ${application.drive.jobRole}.`,
      },
    }),
    prisma.tpoNotification.create({
      data: {
        type: "OFFER_RESPONSE",
        title: accepted ? "Student accepted an offer" : "Student declined an offer",
        message: `${student.rollNo} (${session.name}) ${accepted ? "accepted" : "declined"} the ${application.drive.companyName} offer for ${application.drive.jobRole}.`,
      },
    }),
  ]);

  revalidatePath("/student/journey");
  revalidatePath("/tpo/offers");
  revalidatePath("/tpo/notifications");
  revalidatePath(`/recruiter/drives/${application.driveId}`);
  return updated;
}

/** TPO confirms the student's documents are verified — the step between acceptance and joining. */
export async function verifyDocumentsAction(applicationId: string) {
  await requireTpo();
  const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  if (application.stage !== "OFFER_ACCEPTED") {
    throw new Error("Documents can only be verified after the student has accepted the offer.");
  }
  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { documentsVerified: true },
  });
  revalidatePath("/tpo/offers");
  revalidatePath("/student/journey");
  return updated;
}

/** TPO marks the student as joined — the final step, only available after documents are verified. */
export async function markJoinedAction(applicationId: string) {
  await requireTpo();
  const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  if (!application.documentsVerified) {
    throw new Error("Verify documents before marking this student as joined.");
  }
  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { stage: "JOINED", joined: true },
  });
  await prisma.student.update({ where: { id: application.studentId }, data: { placementStatus: "JOINED" } });

  revalidatePath("/tpo/offers");
  revalidatePath("/student/journey");
  return updated;
}

export async function markTpoNotificationReadAction(notificationId: string) {
  await requireTpo();
  await prisma.tpoNotification.update({ where: { id: notificationId }, data: { read: true } });
  revalidatePath("/tpo/notifications");
}

export async function markRecruiterNotificationReadAction(notificationId: string) {
  const session = await getSession();
  assertRole(session, "RECRUITER");
  const recruiter = await prisma.recruiter.findUniqueOrThrow({ where: { userId: session.userId } });
  await prisma.recruiterNotification.updateMany({
    where: { id: notificationId, recruiterId: recruiter.id },
    data: { read: true },
  });
  revalidatePath("/recruiter/notifications");
}
