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

export async function recordOfferAction(applicationId: string, formData: FormData) {
  await requireTpo();
  const offerPackage = String(formData.get("offerPackage") || "");

  const app = await prisma.application.update({
    where: { id: applicationId },
    data: { stage: "OFFER", offerPackage, offerStatus: "Offer Received" },
  });

  await prisma.student.update({ where: { id: app.studentId }, data: { placementStatus: "OFFER_RECEIVED" } });

  await prisma.notification.create({
    data: {
      studentId: app.studentId,
      type: "OFFER_UPDATE",
      title: "You've received an offer!",
      message: `Package: ${offerPackage || "details shared by placement cell"}.`,
    },
  });

  revalidatePath("/tpo/offers");
  revalidatePath("/student/journey");
}

export async function updateOfferStatusAction(
  applicationId: string,
  offerStatus: "Offer Accepted" | "Offer Declined",
  documentsVerified?: boolean
) {
  await requireTpo();
  const app = await prisma.application.update({
    where: { id: applicationId },
    data: {
      offerStatus,
      documentsVerified: documentsVerified ?? undefined,
      joined: offerStatus === "Offer Accepted" && documentsVerified ? true : undefined,
    },
  });

  await prisma.student.update({
    where: { id: app.studentId },
    data: {
      placementStatus:
        offerStatus === "Offer Accepted"
          ? "OFFER_ACCEPTED"
          : offerStatus === "Offer Declined"
          ? "OFFER_DECLINED"
          : undefined,
    },
  });

  revalidatePath("/tpo/offers");
  revalidatePath("/student/journey");
}
