"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole, assertAnyRole } from "@/lib/auth";
import { checkSchedulingConflicts, OFFER_PIPELINE_STAGES } from "@/lib/rules";
import { assertCanManageDrive, requireApprovedRecruiter } from "@/lib/access";
import { getDocumentsEmail } from "@/lib/college";
import { refreshPlacementStatus } from "@/lib/placement";
import { fmtDateTime } from "@/lib/format";

async function requireTpo() {
  const session = await getSession();
  assertRole(session, "TPO");
  return session;
}

/**
 * Schedules one interview. The placement cell, or the recruiter who owns the drive, can do this.
 * If the slot clashes (same student, panel or venue), nothing is saved and the clash is returned so the
 * person can pick another time. Only the placement cell can knowingly override a clash: sending
 * `override=1` (with an optional reason) saves it anyway, marked as a deliberate override.
 */
export async function scheduleInterviewAction(formData: FormData) {
  const session = await getSession();
  assertAnyRole(session, ["TPO", "RECRUITER"]);

  const applicationId = String(formData.get("applicationId"));
  const driveId = String(formData.get("driveId"));
  const stage = String(formData.get("stage") || "Interview").trim().slice(0, 60) || "Interview";
  const scheduledAt = new Date(String(formData.get("scheduledAt")));
  if (Number.isNaN(scheduledAt.getTime())) throw new Error("Please choose a valid date and time.");
  const durationMins = Math.min(240, Math.max(10, Number(formData.get("durationMins")) || 30));
  const venue = String(formData.get("venue") || "").trim() || null;
  const panel = String(formData.get("panel") || "").trim() || null;
  const override = String(formData.get("override") || "") === "1";
  const overrideReason = String(formData.get("overrideReason") || "").trim().slice(0, 300) || null;

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { drive: true, student: { include: { user: { select: { name: true } } } } },
  });
  await assertCanManageDrive(session, application.drive.recruiterId);

  if (override && session.role !== "TPO") {
    throw new Error("Only the placement cell can schedule over a clash. Please choose another time.");
  }
  if (application.stage === "WITHDRAWN" || application.stage === "REJECTED") {
    throw new Error("This candidate is no longer in the process, so an interview can't be scheduled.");
  }
  if ((OFFER_PIPELINE_STAGES as readonly string[]).includes(application.stage)) {
    throw new Error("This candidate is already in the offer process, so an interview can't be scheduled.");
  }
  if (session.role === "RECRUITER" && !["SHORTLISTED", "INTERVIEW"].includes(application.stage)) {
    throw new Error("Shortlist this candidate before scheduling an interview.");
  }
  if (application.driveId !== driveId) throw new Error("That candidate doesn't belong to this drive.");

  const dayStart = new Date(scheduledAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(scheduledAt);
  dayEnd.setHours(23, 59, 59, 999);

  const existing = await prisma.interview.findMany({
    where: { scheduledAt: { gte: dayStart, lte: dayEnd } },
    include: { application: true },
  });

  const conflict = checkSchedulingConflicts(
    { studentId: application.studentId, venue, panel, scheduledAt, durationMins },
    existing.map((e) => ({
      id: e.id,
      studentId: e.application.studentId,
      venue: e.venue,
      panel: e.panel,
      scheduledAt: e.scheduledAt,
      durationMins: e.durationMins,
    }))
  );

  // Clash and no explicit override yet: save nothing, hand the details back for the person to decide.
  if (conflict.hasConflict && !override) {
    return { saved: false as const, conflict, canOverride: session.role === "TPO" };
  }

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
      overridden: conflict.hasConflict,
      overrideReason: conflict.hasConflict ? overrideReason : null,
      scheduledByRole: session.role,
    },
  });

  await prisma.application.update({ where: { id: applicationId }, data: { stage: "INTERVIEW" } });
  await refreshPlacementStatus(application.studentId);

  await prisma.notification.create({
    data: {
      studentId: application.studentId,
      type: "INTERVIEW_SCHEDULE",
      title: `Interview scheduled: ${stage}`,
      message: `Your ${stage} for ${application.drive.jobRole} at ${application.drive.companyName} is on ${fmtDateTime(scheduledAt)}${venue ? ` at ${venue}` : ""}.`,
    },
  });
  if (session.role === "RECRUITER") {
    await prisma.tpoNotification.create({
      data: {
        type: "INTERVIEW_SCHEDULE",
        title: "Interview scheduled by a recruiter",
        message: `${application.drive.companyName} scheduled ${application.student.rollNo} (${application.student.user.name}) for ${stage} on ${fmtDateTime(scheduledAt)}.`,
      },
    });
  } else {
    await prisma.recruiterNotification.create({
      data: {
        recruiterId: application.drive.recruiterId,
        type: "INTERVIEW_SCHEDULE",
        title: "Interview scheduled by the placement cell",
        message: `${application.student.rollNo} (${application.student.user.name}) has a ${stage} on ${fmtDateTime(scheduledAt)}${venue ? ` at ${venue}` : ""}.`,
      },
    });
  }

  revalidatePath("/tpo/scheduling");
  revalidatePath("/tpo/notifications");
  revalidatePath("/recruiter/notifications");
  revalidatePath(`/tpo/drives/${driveId}`);
  revalidatePath(`/recruiter/drives/${driveId}`);
  revalidatePath("/student/journey");
  revalidatePath("/student/notifications");
  return { saved: true as const, interview, conflict, canOverride: session.role === "TPO" };
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

  const recruiter = await requireApprovedRecruiter(session.userId);
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { drive: true, student: { include: { user: true } } },
  });

  if (application.drive.recruiterId !== recruiter.id) {
    throw new Error("You can only request offers for your own drives.");
  }
  if (application.stage !== "SELECTED") {
    throw new Error("Select this candidate before you request an offer.");
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

  await refreshPlacementStatus(application.studentId);

  await prisma.notification.create({
    data: {
      studentId: application.studentId,
      type: "OFFER_UPDATE",
      title: `You've received an offer from ${application.drive.companyName}!`,
      message: `Package: ${application.offerPackage}. Open your Placement Journey to accept or decline.`,
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

  // A decline is scoped to this one drive only. The overall status is recomputed from the
  // student's other applications, so a decline never marks them unplaced if they are active elsewhere.
  await refreshPlacementStatus(student.id);

  const docsEmail = accepted ? await getDocumentsEmail() : null;

  await Promise.all([
    accepted
      ? prisma.notification.create({
          data: {
            studentId: student.id,
            type: "DOCUMENT_DEADLINE",
            title: "Next step: send your documents",
            message: docsEmail
              ? `Please email your important documents to ${docsEmail} for verification. The placement cell will update your status once they are verified.`
              : "Please send your important documents to the placement cell for verification. They will update your status once they are verified.",
          },
        })
      : Promise.resolve(),
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
  revalidatePath("/student/notifications");
  revalidatePath("/tpo/offers");
  revalidatePath("/tpo/notifications");
  revalidatePath("/recruiter/notifications");
  revalidatePath(`/recruiter/drives/${application.driveId}`);
  return updated;
}

/** TPO confirms the student's documents (checked over email) are verified: the step between acceptance and joining. */
export async function verifyDocumentsAction(applicationId: string) {
  await requireTpo();
  const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { drive: true } });
  if (application.stage !== "OFFER_ACCEPTED") {
    throw new Error("Documents can only be verified after the student has accepted the offer.");
  }
  if (application.documentsVerified) return application;
  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { documentsVerified: true },
  });
  await prisma.notification.create({
    data: {
      studentId: application.studentId,
      type: "DOCUMENT_DEADLINE",
      title: "Your documents are verified",
      message: `The placement cell verified your documents for ${application.drive.companyName}. You will be marked as joined once you report to the company.`,
    },
  });
  revalidatePath("/tpo/offers");
  revalidatePath("/student/journey");
  revalidatePath("/student/notifications");
  return updated;
}

/** TPO marks the student as joined, the final step. Only available after documents are verified. */
export async function markJoinedAction(applicationId: string) {
  await requireTpo();
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { drive: true, student: { include: { user: { select: { name: true } } } } },
  });
  if (!application.documentsVerified) {
    throw new Error("Verify the documents before marking this student as joined.");
  }
  if (application.stage === "JOINED") return application;
  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { stage: "JOINED", joined: true },
  });
  await refreshPlacementStatus(application.studentId);
  await Promise.all([
    prisma.notification.create({
      data: {
        studentId: application.studentId,
        type: "OFFER_UPDATE",
        title: `Welcome to ${application.drive.companyName}!`,
        message: "You are now marked as joined. Congratulations on your placement.",
      },
    }),
    prisma.recruiterNotification.create({
      data: {
        recruiterId: application.drive.recruiterId,
        type: "OFFER_UPDATE",
        title: "A candidate has joined",
        message: `${application.student.rollNo} (${application.student.user.name}) is now marked as joined for ${application.drive.jobRole}.`,
      },
    }),
  ]);

  revalidatePath("/tpo/offers");
  revalidatePath("/student/journey");
  revalidatePath("/student/notifications");
  revalidatePath("/recruiter/notifications");
  revalidatePath(`/recruiter/drives/${application.driveId}`);
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
