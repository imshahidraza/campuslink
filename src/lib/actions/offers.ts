"use server";

import { revalidatePath } from "next/cache";
import { guard } from "@/lib/actionResult";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole, assertAnyRole } from "@/lib/auth";
import { checkSchedulingConflicts, OFFER_PIPELINE_STAGES } from "@/lib/rules";
import { requireApprovedRecruiter } from "@/lib/access";
import { getDocumentsEmail } from "@/lib/college";
import { refreshPlacementStatus } from "@/lib/placement";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { normalizeSlotName } from "@/lib/normalize";
import { getAgreedWindow, TIME_RE, toMinutes } from "@/lib/schedule";
import { readOfferTerms, formatPackage, packageText, offerTypeLabel, fmtJoining } from "@/lib/offerRules";
import { termsData, FRESH_OFFER_STATE, CLEAR_OFFER, backToInternship } from "@/lib/offerState";
import { addDays, DOCUMENT_DEADLINE_DAYS } from "@/lib/automationRules";

async function requireTpo() {
  const session = await getSession();
  assertRole(session, "TPO");
  return session;
}

/**
 * Books one interview for one candidate. Only the recruiter who owns the drive can do this, and only inside
 * the dates, time window and panels that they and the placement cell agreed on (see scheduleRequest.ts).
 * If the slot clashes (same student, panel or venue), nothing is saved and the clash is returned so the
 * recruiter can pick another time.
 */
export async function scheduleInterviewAction(formData: FormData) {
  const session = await getSession();
  assertRole(session, "RECRUITER");
  const recruiter = await requireApprovedRecruiter(session.userId);

  const applicationId = String(formData.get("applicationId"));
  const driveId = String(formData.get("driveId"));
  const stage = String(formData.get("stage") || "Interview").trim().slice(0, 60) || "Interview";
  const date = String(formData.get("date") || "");
  const time = String(formData.get("time") || "");
  const durationMins = Math.min(240, Math.max(10, Number(formData.get("durationMins")) || 30));
  const panelName = normalizeSlotName(String(formData.get("panel") || ""));

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { drive: true, student: { include: { user: { select: { name: true } } } } },
  });
  if (application.drive.recruiterId !== recruiter.id) throw new Error("You can only schedule for your own drives.");
  if (application.driveId !== driveId) throw new Error("That candidate doesn't belong to this drive.");

  if (application.stage === "WITHDRAWN" || application.stage === "REJECTED") {
    throw new Error("This candidate is no longer in the process, so an interview can't be scheduled.");
  }
  if ((OFFER_PIPELINE_STAGES as readonly string[]).includes(application.stage)) {
    throw new Error("This candidate is already in the offer process, so an interview can't be scheduled.");
  }
  if (!["SHORTLISTED", "INTERVIEW"].includes(application.stage)) {
    throw new Error("Shortlist this candidate before scheduling an interview.");
  }

  const window = await getAgreedWindow(driveId);
  if (!window) throw new Error("Interview dates are not confirmed yet. Ask the placement cell to confirm them first.");
  if (!window.dates.includes(date)) throw new Error("Choose one of the confirmed interview dates.");
  if (!TIME_RE.test(time)) throw new Error("Choose a valid time.");
  if (toMinutes(time) < toMinutes(window.start) || toMinutes(time) + durationMins > toMinutes(window.end)) {
    throw new Error(`The interview must fit between ${window.start} and ${window.end}.`);
  }
  const chosenPanel = window.panels.find((p) => p.name === panelName);
  if (!chosenPanel) throw new Error("Choose one of the confirmed panels.");
  const panel = chosenPanel.name;
  const venue = chosenPanel.venue; // the panel's own room, used for the clash check
  const shownVenue = venue ?? window.venue; // what is saved and shown to the student
  const scheduledAt = new Date(`${date}T${time}:00`);
  if (Number.isNaN(scheduledAt.getTime())) throw new Error("Please choose a valid date and time.");

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

  // A clash: save nothing and hand the details back so the recruiter can choose another time.
  if (conflict.hasConflict) {
    return { saved: false as const, conflict };
  }

  const interview = await prisma.interview.create({
    data: {
      driveId,
      applicationId,
      stage,
      scheduledAt,
      durationMins,
      venue: shownVenue,
      panel,
      hasConflict: false,
      conflictNote: null,
      overridden: false,
      overrideReason: null,
      scheduledByRole: "RECRUITER",
    },
  });

  await prisma.application.update({ where: { id: applicationId }, data: { stage: "INTERVIEW" } });
  await refreshPlacementStatus(application.studentId);

  await prisma.notification.create({
    data: {
      studentId: application.studentId,
      type: "INTERVIEW_SCHEDULE",
      title: `Interview scheduled: ${stage}`,
      message: `Your ${stage} for ${application.drive.jobRole} at ${application.drive.companyName} is on ${fmtDateTime(scheduledAt)}${shownVenue ? ` at ${shownVenue}` : ""} (${panel}).`,
    },
  });
  await prisma.tpoNotification.create({
    data: {
      type: "INTERVIEW_SCHEDULE",
      title: "Interview scheduled by a recruiter",
      message: `${application.drive.companyName} scheduled ${application.student.rollNo} (${application.student.user.name}) for ${stage} on ${fmtDateTime(scheduledAt)}.`,
    },
  });

  revalidatePath("/tpo/scheduling");
  revalidatePath("/tpo/notifications");
  revalidatePath("/recruiter/notifications");
  revalidatePath(`/tpo/drives/${driveId}`);
  revalidatePath(`/recruiter/drives/${driveId}`);
  revalidatePath("/student/journey");
  revalidatePath("/student/notifications");
  return { saved: true as const, interview };
}

/* ======================= Offer pipeline =======================
 * SELECTED → (recruiter) OFFER_REQUESTED → (TPO) OFFER_SENT →
 *   (student) OFFER_ACCEPTED or OFFER_DECLINED → (TPO) documentsVerified → JOINED
 * A decline only affects THIS application — it never marks the student
 * unplaced overall, since they may still be active on other drives.
 * ================================================================= */

/** The offer message keeps its line breaks, so the recruiter can write it in paragraphs. */
function readOfferMessage(formData: FormData): string | null {
  const raw = String(formData.get("offerMessage") || "").replace(/\r\n/g, "\n").trim().slice(0, 2000);
  return raw || null;
}

function readReason(formData: FormData | string, what: string): string {
  const raw = (typeof formData === "string" ? formData : String(formData.get("reason") || "")).replace(/\r\n/g, "\n").trim().slice(0, 1000);
  if (raw.length < 5) throw new Error(`Please write a short reason for ${what}.`);
  return raw;
}

/** Recruiter requests an offer for a candidate they've already marked Selected. Package is fixed here — the TPO forwards it as-is, doesn't edit it. */
async function runRequestOfferAction(applicationId: string, formData: FormData) {
  const session = await getSession();
  assertRole(session, "RECRUITER");

  const terms = readOfferTerms(formData);
  const offerMessage = readOfferMessage(formData);

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
    data: {
      stage: "OFFER_REQUESTED",
      ...FRESH_OFFER_STATE,
      ...termsData(terms),
      offerMessage,
      offerRequestedAt: new Date(),
      // A fresh request replaces any earlier withdrawal.
      offerWithdrawnAt: null,
      offerWithdrawnNote: null,
    },
  });

  await prisma.tpoNotification.create({
    data: {
      type: "OFFER_UPDATE",
      title: "Offer request awaiting review",
      message: `${application.drive.companyName} wants to make ${application.student.rollNo} (${application.student.user.name}) a ${offerTypeLabel(terms.offerType)} offer (${formatPackage(terms)}) for ${application.drive.jobRole}.`,
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
    data: { stage: "OFFER_SENT", offerSentAt: new Date(), offerFollowUpAt: null, offerFollowUpCount: 0 },
  });

  await refreshPlacementStatus(application.studentId);

  await prisma.notification.create({
    data: {
      studentId: application.studentId,
      type: "OFFER_UPDATE",
      title: `You've received an offer from ${application.drive.companyName}!`,
      message: `${offerTypeLabel(application.offerType)} offer. Package: ${packageText(application)}.${application.joiningDate ? ` Joining date: ${fmtJoining(application.joiningDate)}.` : ""} Open your Placement Journey to read the message from the company and to accept or decline.`,
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
  const now = new Date();
  // After accepting, the student has a week to send documents (unless they were verified already, as for a conversion).
  const dueAt = accepted && !application.documentsVerified ? addDays(now, DOCUMENT_DEADLINE_DAYS) : null;
  // updateMany with the stage in the filter makes sure a double click or two tabs can't answer the same offer twice.
  const changed = await prisma.application.updateMany({
    where: { id: applicationId, studentId: student.id, stage: "OFFER_SENT" },
    data: {
      stage: accepted ? "OFFER_ACCEPTED" : "OFFER_DECLINED",
      offerRespondedAt: now,
      ...(accepted ? { documentsDueAt: dueAt, docReminderSentAt: null, docOverdueSentAt: null } : {}),
    },
  });
  if (changed.count === 0) throw new Error("This offer isn't awaiting your response.");
  const updated = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });

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
            message:
              (docsEmail
                ? `Please email your important documents to ${docsEmail} for verification.`
                : "Please send your important documents to the placement cell for verification.") +
              (dueAt ? ` The last date is ${fmtDate(dueAt)}.` : "") +
              " The placement cell will update your status once they are verified.",
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

/**
 * Marks the student as joined, the final step. Only available after the placement cell verified the documents.
 * The placement cell or the recruiter who owns the drive can do it, and whoever presses first sets it.
 */
export async function markJoinedAction(applicationId: string) {
  const session = await getSession();
  assertAnyRole(session, ["TPO", "RECRUITER"]);
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { drive: true, student: { include: { user: { select: { name: true } } } } },
  });
  if (session.role === "RECRUITER") {
    const recruiter = await requireApprovedRecruiter(session.userId);
    if (application.drive.recruiterId !== recruiter.id) throw new Error("You can only do this for your own drives.");
  }
  if (application.stage === "JOINED") return application;
  if (application.stage !== "OFFER_ACCEPTED") throw new Error("The student has to accept the offer first.");
  if (!application.documentsVerified) {
    throw new Error("The placement cell has to verify the documents before this student can be marked as joined.");
  }
  const by = session.role === "TPO" ? "The placement cell" : application.drive.companyName;
  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { stage: "JOINED", joined: true, joinedByRole: session.role },
  });
  await refreshPlacementStatus(application.studentId);
  await Promise.all([
    prisma.notification.create({
      data: {
        studentId: application.studentId,
        type: "OFFER_UPDATE",
        title: `Welcome to ${application.drive.companyName}!`,
        message: `${by} confirmed that you have joined. Congratulations on your placement.`,
      },
    }),
    session.role === "TPO"
      ? prisma.recruiterNotification.create({
          data: {
            recruiterId: application.drive.recruiterId,
            type: "OFFER_UPDATE",
            title: "A candidate has joined",
            message: `${application.student.rollNo} (${application.student.user.name}) is now marked as joined for ${application.drive.jobRole}.`,
          },
        })
      : prisma.tpoNotification.create({
          data: {
            type: "OFFER_UPDATE",
            title: "A recruiter confirmed a joining",
            message: `${application.drive.companyName} confirmed that ${application.student.rollNo} (${application.student.user.name}) joined as ${application.drive.jobRole}.`,
          },
        }),
  ]);

  revalidateOfferPages(application.driveId);
  return updated;
}

/** Placement cell only: undo a joining that was marked by mistake. The stage goes back to "Documents verified". */
export async function undoJoinedAction(applicationId: string) {
  await requireTpo();
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { drive: true, student: { include: { user: { select: { name: true } } } } },
  });
  if (application.stage !== "JOINED") throw new Error("This student is not marked as joined.");
  await prisma.application.update({
    where: { id: applicationId },
    data: { stage: "OFFER_ACCEPTED", joined: false, joinedByRole: null },
  });
  await refreshPlacementStatus(application.studentId);
  await Promise.all([
    prisma.notification.create({
      data: {
        studentId: application.studentId,
        type: "OFFER_UPDATE",
        title: "Joining status corrected",
        message: `Your joining for ${application.drive.companyName} was marked by mistake and has been corrected. You will be marked as joined once it is confirmed again.`,
      },
    }),
    prisma.recruiterNotification.create({
      data: {
        recruiterId: application.drive.recruiterId,
        type: "OFFER_UPDATE",
        title: "Joining status corrected",
        message: `${application.student.rollNo} (${application.student.user.name}) was moved back from joined to documents verified for ${application.drive.jobRole}.`,
      },
    }),
  ]);
  revalidateOfferPages(application.driveId);
}

function revalidateOfferPages(driveId: string) {
  revalidatePath("/tpo/offers");
  revalidatePath("/tpo");
  revalidatePath("/tpo/notifications");
  revalidatePath("/student/journey");
  revalidatePath("/student/notifications");
  revalidatePath("/recruiter/notifications");
  revalidatePath(`/recruiter/drives/${driveId}`);
  revalidatePath(`/tpo/drives/${driveId}`);
}

/** Recruiter fixes the package or message of an offer request the placement cell has not forwarded yet. */
async function runEditOfferRequestAction(applicationId: string, formData: FormData) {
  const session = await getSession();
  assertRole(session, "RECRUITER");
  const recruiter = await requireApprovedRecruiter(session.userId);
  const offerMessage = readOfferMessage(formData);

  const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { drive: true } });
  if (application.drive.recruiterId !== recruiter.id) throw new Error("You can only do this for your own drives.");
  if (application.stage !== "OFFER_REQUESTED") {
    throw new Error("This request has already been forwarded, so it can't be edited. You can withdraw the offer instead.");
  }
  // A conversion stays a full-time offer; its type is not a choice.
  const terms = readOfferTerms(formData, { forceType: application.convertedFromInternship ? "FULL_TIME" : undefined });
  await prisma.application.update({ where: { id: applicationId }, data: { ...termsData(terms), offerMessage } });
  revalidateOfferPages(application.driveId);
}

/** Recruiter cancels an offer request the placement cell has not forwarded yet. The candidate goes back to Selected. */
export async function cancelOfferRequestAction(applicationId: string) {
  const session = await getSession();
  assertRole(session, "RECRUITER");
  const recruiter = await requireApprovedRecruiter(session.userId);
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { drive: true, student: { include: { user: { select: { name: true } } } } },
  });
  if (application.drive.recruiterId !== recruiter.id) throw new Error("You can only do this for your own drives.");
  if (application.stage !== "OFFER_REQUESTED") throw new Error("This request has already been forwarded. Withdraw the offer instead.");
  await prisma.application.update({
    where: { id: applicationId },
    data: application.convertedFromInternship
      ? backToInternship(application.offerStipend)
      : { stage: "SELECTED", ...CLEAR_OFFER, offerRequestedAt: null },
  });
  await refreshPlacementStatus(application.studentId);
  await prisma.tpoNotification.create({
    data: {
      type: "OFFER_UPDATE",
      title: "Offer request cancelled",
      message: `${application.drive.companyName} cancelled the offer request for ${application.student.rollNo} (${application.student.user.name}).`,
    },
  });
  revalidateOfferPages(application.driveId);
}

/**
 * Recruiter withdraws an offer that was already sent, or accepted but not yet joined. A written reason is
 * required and the student sees it. The candidate goes back to Selected, so the recruiter can send a corrected
 * offer, or mark them Not selected if it was the wrong person.
 */
export async function withdrawOfferAction(applicationId: string, reason: string) {
  const session = await getSession();
  assertRole(session, "RECRUITER");
  const recruiter = await requireApprovedRecruiter(session.userId);
  const note = readReason(reason, "withdrawing this offer");

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { drive: true, student: { include: { user: { select: { name: true } } } } },
  });
  if (application.drive.recruiterId !== recruiter.id) throw new Error("You can only do this for your own drives.");
  if (application.stage !== "OFFER_SENT" && application.stage !== "OFFER_ACCEPTED") {
    throw new Error("Only an offer that was sent or accepted can be withdrawn. A joined candidate can't be withdrawn.");
  }
  const wasAccepted = application.stage === "OFFER_ACCEPTED";

  await prisma.application.update({
    where: { id: applicationId },
    data: application.convertedFromInternship
      ? { ...backToInternship(application.offerStipend), offerWithdrawnAt: new Date(), offerWithdrawnNote: note }
      : {
          stage: "SELECTED",
          ...CLEAR_OFFER,
          offerSentAt: null,
          offerRespondedAt: null,
          documentsVerified: false,
          offerWithdrawnAt: new Date(),
          offerWithdrawnNote: note,
        },
  });
  await refreshPlacementStatus(application.studentId);

  await Promise.all([
    prisma.notification.create({
      data: {
        studentId: application.studentId,
        type: "OFFER_UPDATE",
        title: `${application.drive.companyName} withdrew the offer`,
        message: `Reason from the company: ${note}`,
      },
    }),
    prisma.tpoNotification.create({
      data: {
        type: "OFFER_UPDATE",
        title: wasAccepted ? "Offer withdrawn after the student accepted" : "Offer withdrawn",
        message: `${application.drive.companyName} withdrew the offer for ${application.student.rollNo} (${application.student.user.name}), ${application.drive.jobRole}. Reason: ${note}`,
      },
    }),
  ]);
  revalidateOfferPages(application.driveId);
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

/** Same work as runRequestOfferAction, returned as { ok } so the form can show what to fix (a thrown message is hidden in production). */
export async function requestOfferAction(applicationId: string, formData: FormData) {
  return guard(() => runRequestOfferAction(applicationId, formData));
}

/** Same work as runEditOfferRequestAction, returned as { ok } so the form can show what to fix (a thrown message is hidden in production). */
export async function editOfferRequestAction(applicationId: string, formData: FormData) {
  return guard(() => runEditOfferRequestAction(applicationId, formData));
}
