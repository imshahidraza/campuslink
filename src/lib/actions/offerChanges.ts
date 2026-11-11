"use server";

import { guard } from "@/lib/actionResult";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { requireApprovedRecruiter } from "@/lib/access";
import { refreshPlacementStatus } from "@/lib/placement";
import { readOfferTerms, checkDeferralRequest, fmtJoining, parseYmd, todayYmd, addMonthsYmd } from "@/lib/offerRules";
import { termsData } from "@/lib/offerState";
import { fmtDate } from "@/lib/format";

/* Convert-to-full-time, joining-date deferral and document deadlines.
 * Every action checks who is asking (role), that the record is theirs (ownership), and that the offer is
 * in the right stage, on the server, so a crafted request from outside the screens can't skip a step. */

function refreshOfferScreens(driveId: string) {
  revalidatePath("/tpo/offers");
  revalidatePath("/tpo");
  revalidatePath("/tpo/notifications");
  revalidatePath("/student/journey");
  revalidatePath("/student/notifications");
  revalidatePath("/recruiter/notifications");
  revalidatePath(`/recruiter/drives/${driveId}`);
  revalidatePath(`/tpo/drives/${driveId}`);
}

function cleanMessage(formData: FormData): string | null {
  const raw = String(formData.get("offerMessage") || "").replace(/\r\n/g, "\n").trim().slice(0, 2000);
  return raw || null;
}

/**
 * The recruiter offers a full-time job to a student whose internship offer was accepted. It goes through the
 * same steps as any offer (placement cell forwards it, student accepts or declines). Documents that were
 * already verified for the internship stay verified.
 */
async function runConvertToFullTimeAction(applicationId: string, formData: FormData) {
  const session = await getSession();
  assertRole(session, "RECRUITER");
  const recruiter = await requireApprovedRecruiter(session.userId);

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { drive: true, student: { include: { user: { select: { name: true } } } } },
  });
  if (application.drive.recruiterId !== recruiter.id) throw new Error("You can only do this for your own drives.");
  if (application.offerType !== "INTERNSHIP") throw new Error("Only an internship offer can be converted to full-time.");
  if (application.stage !== "OFFER_ACCEPTED" && application.stage !== "JOINED") {
    throw new Error("The student has to accept the internship offer before it can be converted to full-time.");
  }

  const terms = readOfferTerms(formData, { forceType: "FULL_TIME" });
  const now = new Date();
  const changed = await prisma.application.updateMany({
    where: { id: applicationId, offerType: "INTERNSHIP", stage: { in: ["OFFER_ACCEPTED", "JOINED"] } },
    data: {
      stage: "OFFER_REQUESTED",
      ...termsData(terms),
      offerMessage: cleanMessage(formData),
      convertedFromInternship: true,
      convertedAt: now,
      offerRequestedAt: now,
      offerSentAt: null,
      offerRespondedAt: null,
      joined: false,
      joinedByRole: null,
      offerWithdrawnAt: null,
      offerWithdrawnNote: null,
      deferralStatus: null,
      deferralReason: null,
      deferralRequestedDate: null,
      deferralRequestedAt: null,
      deferralDecidedAt: null,
      deferralNote: null,
      previousJoiningDate: null,
      documentsDueAt: null,
      docReminderSentAt: null,
      docOverdueSentAt: null,
      offerFollowUpAt: null,
      offerFollowUpCount: 0,
    },
  });
  if (changed.count === 0) throw new Error("This internship has already been changed. Please refresh the page.");

  await refreshPlacementStatus(application.studentId);
  await prisma.tpoNotification.create({
    data: {
      type: "OFFER_UPDATE",
      title: "Internship converted: full-time offer awaiting review",
      message: `${application.drive.companyName} wants to convert ${application.student.rollNo} (${application.student.user.name}) from intern to a full-time ${application.drive.jobRole} at ${terms.offerCtcLpa} LPA.`,
    },
  });
  refreshOfferScreens(application.driveId);
}

/** The student asks to move the joining date of an offer they accepted. The placement cell decides. */
async function runRequestDeferralAction(applicationId: string, input: { reason: string; newDate: string }) {
  const session = await getSession();
  assertRole(session, "STUDENT");
  if (typeof input?.reason !== "string" || typeof input?.newDate !== "string") throw new Error("Please fill in both boxes.");

  const student = await prisma.student.findUniqueOrThrow({ where: { userId: session.userId } });
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { drive: true },
  });
  if (application.studentId !== student.id) throw new Error("This isn't your offer.");
  if (application.stage !== "OFFER_ACCEPTED") throw new Error("You can ask to move the joining date after you accept an offer and before you join.");
  if (application.deferralStatus === "PENDING") throw new Error("You already have a request waiting for the placement cell.");

  const check = checkDeferralRequest(input, { joiningDate: application.joiningDate });
  if (!check.ok || !check.newDate || !check.reason) throw new Error(check.message || "Please check the date and the reason.");

  const changed = await prisma.application.updateMany({
    where: {
      id: applicationId,
      studentId: student.id,
      stage: "OFFER_ACCEPTED",
      OR: [{ deferralStatus: null }, { deferralStatus: { in: ["APPROVED", "DECLINED"] } }],
    },
    data: {
      deferralStatus: "PENDING",
      deferralReason: check.reason,
      deferralRequestedDate: check.newDate,
      deferralRequestedAt: new Date(),
      deferralDecidedAt: null,
      deferralNote: null,
    },
  });
  if (changed.count === 0) throw new Error("You already have a request waiting for the placement cell.");

  await prisma.tpoNotification.create({
    data: {
      type: "OFFER_UPDATE",
      title: "Joining date change requested",
      message: `${student.rollNo} (${session.name}) asks to move the ${application.drive.companyName} joining date${
        application.joiningDate ? ` from ${fmtJoining(application.joiningDate)}` : ""
      } to ${fmtJoining(check.newDate)}. Reason: ${check.reason}`,
    },
  });
  refreshOfferScreens(application.driveId);
}

/** Placement cell only: approve or decline a deferral. Approving moves the joining date shown everywhere. */
async function runDecideDeferralAction(applicationId: string, decision: "APPROVE" | "DECLINE", note: string) {
  const session = await getSession();
  assertRole(session, "TPO");
  if (decision !== "APPROVE" && decision !== "DECLINE") throw new Error("Please choose approve or decline.");
  const cleanNote = String(note ?? "").replace(/\r\n/g, "\n").trim().slice(0, 500);
  if (decision === "DECLINE" && cleanNote.length < 5) throw new Error("Please write a short reason, so the student knows why.");

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { drive: true, student: { include: { user: { select: { name: true } } } } },
  });
  if (application.deferralStatus !== "PENDING" || !application.deferralRequestedDate) {
    throw new Error("There is no pending request for this offer.");
  }
  const approve = decision === "APPROVE";
  const requested = application.deferralRequestedDate;

  const changed = await prisma.application.updateMany({
    where: { id: applicationId, deferralStatus: "PENDING", stage: "OFFER_ACCEPTED" },
    data: {
      deferralStatus: approve ? "APPROVED" : "DECLINED",
      deferralDecidedAt: new Date(),
      deferralNote: cleanNote || null,
      ...(approve ? { previousJoiningDate: application.joiningDate, joiningDate: requested } : {}),
    },
  });
  if (changed.count === 0) throw new Error("This request was already answered. Please refresh the page.");

  await prisma.notification.create({
    data: {
      studentId: application.studentId,
      type: "OFFER_UPDATE",
      title: approve ? "Your joining date was moved" : "Your joining date request was declined",
      message: approve
        ? `The placement cell approved your request. Your new joining date for ${application.drive.companyName} is ${fmtJoining(requested)}.${cleanNote ? ` Note: ${cleanNote}` : ""}`
        : `The placement cell could not approve the new date for ${application.drive.companyName}. Reason: ${cleanNote}`,
    },
  });
  if (approve) {
    await prisma.recruiterNotification.create({
      data: {
        recruiterId: application.drive.recruiterId,
        type: "OFFER_UPDATE",
        title: "Joining date moved",
        message: `${application.student.rollNo} (${application.student.user.name}) will now join for ${application.drive.jobRole} on ${fmtJoining(requested)}${
          application.joiningDate ? ` instead of ${fmtJoining(application.joiningDate)}` : ""
        }. The placement cell approved the request.`,
      },
    });
  }
  refreshOfferScreens(application.driveId);
}

/** Placement cell only: set or change the last date for a student to send documents after accepting. */
async function runSetDocumentDeadlineAction(applicationId: string, ymd: string) {
  const session = await getSession();
  assertRole(session, "TPO");
  if (typeof ymd !== "string" || !parseYmd(ymd)) throw new Error("Please pick a valid date.");
  const today = todayYmd();
  if (ymd < today) throw new Error("The deadline can't be in the past.");
  if (ymd > addMonthsYmd(today, 6)) throw new Error("The deadline can't be more than 6 months away.");

  const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { drive: true } });
  if (application.stage !== "OFFER_ACCEPTED" || application.documentsVerified) {
    throw new Error("A deadline can be set only while the student's documents are waiting to be verified.");
  }
  // The deadline is the end of that day in India.
  const dueAt = new Date(`${ymd}T23:59:00+05:30`);
  await prisma.application.update({
    where: { id: applicationId },
    data: { documentsDueAt: dueAt, docReminderSentAt: null, docOverdueSentAt: null },
  });
  await prisma.notification.create({
    data: {
      studentId: application.studentId,
      type: "DOCUMENT_DEADLINE",
      title: "Document deadline",
      message: `Please send your documents for ${application.drive.companyName} by ${fmtDate(dueAt)}. The placement cell verifies them after that.`,
    },
  });
  refreshOfferScreens(application.driveId);
}

/* Public actions: the same work, returned as { ok } so the screen can show what went wrong. */
export async function convertToFullTimeAction(applicationId: string, formData: FormData) {
  return guard(() => runConvertToFullTimeAction(applicationId, formData));
}

export async function requestDeferralAction(applicationId: string, input: { reason: string; newDate: string }) {
  return guard(() => runRequestDeferralAction(applicationId, input));
}

export async function decideDeferralAction(applicationId: string, decision: "APPROVE" | "DECLINE", note: string) {
  return guard(() => runDecideDeferralAction(applicationId, decision, note));
}

export async function setDocumentDeadlineAction(applicationId: string, ymd: string) {
  return guard(() => runSetDocumentDeadlineAction(applicationId, ymd));
}
