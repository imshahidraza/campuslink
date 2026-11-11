"use server";

import { guard } from "@/lib/actionResult";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { announceDrive } from "@/lib/announce";
import { runChecks, type SweepResult } from "@/lib/automation";
import { checkRateLimit } from "@/lib/rateLimit";

async function requireTpo() {
  const session = await getSession();
  assertRole(session, "TPO");
  return session;
}

function cleanText(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/**
 * Placement cell only: announce a drive to the students who meet its rules, or remind the ones who have not
 * applied yet. The drive must be open. It can't be repeated within 10 minutes, so a double click can't flood students.
 */
async function runAnnounceDriveAction(driveId: string, mode: "ANNOUNCE" | "REMIND", note: string) {
  const session = await requireTpo();
  if (mode !== "ANNOUNCE" && mode !== "REMIND") throw new Error("Please choose announce or remind.");
  const limit = checkRateLimit(`announce:${session.userId}`, 10, 10 * 60_000);
  if (!limit.allowed) throw new Error("You are sending announcements very quickly. Please wait a few minutes.");

  const drive = await prisma.drive.findUniqueOrThrow({ where: { id: driveId } });
  if (drive.status !== "OPEN") throw new Error("Only an open drive can be announced. Set it to Open first.");
  if (drive.announcedAt && Date.now() - drive.announcedAt.getTime() < 10 * 60_000) {
    throw new Error("This drive was announced a few minutes ago. Please wait before sending another message.");
  }

  const sent = await announceDrive(drive, { onlyNotApplied: mode === "REMIND", note: cleanText(note, 300) || null });
  revalidatePath(`/tpo/drives/${driveId}`);
  revalidatePath("/student/notifications");
  revalidatePath("/student");
  return { sent };
}


/** Placement cell only: run the reminder and support-list checks right now instead of waiting for the next automatic run. */
async function runRunChecksNowAction(): Promise<SweepResult> {
  const session = await requireTpo();
  const limit = checkRateLimit(`checks:${session.userId}`, 6, 60_000);
  if (!limit.allowed) throw new Error("Please wait a minute before running the checks again.");
  const result = await runChecks();
  for (const p of ["/tpo", "/tpo/support", "/tpo/notifications", "/tpo/offers"]) revalidatePath(p);
  return result;
}

/** Placement cell only: put a mentor in charge of a student on the support list. The student is told. */
async function runAssignMentorAction(escalationId: string, mentorName: string, note: string) {
  await requireTpo();
  const mentor = cleanText(mentorName, 80);
  if (mentor.length < 2) throw new Error("Please enter the mentor's name.");
  const cleanNote = cleanText(note, 500);

  const row = await prisma.escalation.findUniqueOrThrow({ where: { id: escalationId }, include: { student: true } });
  const updated = await prisma.escalation.update({
    where: { id: escalationId },
    data: { mentorName: mentor, note: cleanNote || null, status: "ASSIGNED", assignedAt: new Date(), resolvedAt: null },
  });
  await prisma.notification.create({
    data: {
      studentId: row.studentId,
      type: "GENERAL",
      title: "A mentor will support your placement preparation",
      message: `${mentor} from the placement cell team has been assigned to help you get ready. Please reach out to them.${cleanNote ? `\n\nNote: ${cleanNote}` : ""}`,
    },
  });
  revalidatePath("/tpo/support");
  revalidatePath("/student/notifications");
  return updated.status;
}

async function runResolveEscalationAction(escalationId: string) {
  await requireTpo();
  await prisma.escalation.update({ where: { id: escalationId }, data: { status: "RESOLVED", resolvedAt: new Date() } });
  revalidatePath("/tpo/support");
}

async function runReopenEscalationAction(escalationId: string) {
  await requireTpo();
  const row = await prisma.escalation.findUniqueOrThrow({ where: { id: escalationId } });
  await prisma.escalation.update({
    where: { id: escalationId },
    data: { status: row.mentorName ? "ASSIGNED" : "OPEN", resolvedAt: null },
  });
  revalidatePath("/tpo/support");
}

/* Public actions: the same work, returned as { ok } so the screen can show what went wrong. */
export async function announceDriveAction(driveId: string, mode: "ANNOUNCE" | "REMIND", note: string) {
  return guard(() => runAnnounceDriveAction(driveId, mode, note));
}

export async function runChecksNowAction() {
  return guard(() => runRunChecksNowAction());
}

export async function assignMentorAction(escalationId: string, mentorName: string, note: string) {
  return guard(() => runAssignMentorAction(escalationId, mentorName, note));
}

export async function resolveEscalationAction(escalationId: string) {
  return guard(() => runResolveEscalationAction(escalationId));
}

export async function reopenEscalationAction(escalationId: string) {
  return guard(() => runReopenEscalationAction(escalationId));
}
