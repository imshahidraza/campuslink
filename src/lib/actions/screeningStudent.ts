"use server";

import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { guard } from "@/lib/actionResult";
import { checkRateLimit } from "@/lib/rateLimit";
import { cleanAnswers } from "@/lib/screening";
import { GRACE_MS, finalizeAttempt } from "@/lib/screeningAttempt";
import type { Prisma } from "@prisma/client";

/* The student's side of the screening interview. Every action checks that the caller is a student, that the
 * application is their own, and that the interview is in the right state, on the server. The student never
 * receives the right answers, and the time limit is counted on the server. */

const TAKING_STAGES = ["ELIGIBLE", "SHORTLISTED", "INTERVIEW"];

async function loadMine(driveId: unknown) {
  const session = await getSession();
  assertRole(session, "STUDENT");
  if (typeof driveId !== "string" || !driveId) throw new Error("Drive not found.");
  const student = await prisma.student.findUnique({ where: { userId: session.userId }, select: { id: true } });
  if (!student) throw new Error("Student profile not found.");
  const application = await prisma.application.findUnique({
    where: { studentId_driveId: { studentId: student.id, driveId } },
    select: {
      id: true,
      stage: true,
      screeningAttempt: { select: { id: true, deadlineAt: true, submittedAt: true } },
      drive: { select: { id: true, status: true, screeningStatus: true, screeningMinutes: true } },
    },
  });
  if (!application || application.stage === "WITHDRAWN") throw new Error("Apply to this drive first.");
  if (application.drive.screeningStatus !== "PUBLISHED") throw new Error("This drive has no screening interview.");
  return { session, application };
}

function refresh(driveId: string) {
  revalidatePath(`/student/screening/${driveId}`);
  revalidatePath("/student/drives");
  revalidatePath(`/recruiter/drives/${driveId}`);
  revalidatePath(`/tpo/drives/${driveId}`);
}

async function runStart(driveId: string) {
  const { session, application } = await loadMine(driveId);
  if (!checkRateLimit(`screening-start:${session.userId}`, 10, 10 * 60_000).allowed) throw new Error("Please wait a moment and try again.");
  if (application.screeningAttempt) return; // already started: the page shows where they are
  if (!TAKING_STAGES.includes(application.stage)) throw new Error("You can't take this interview for this application.");
  if (!["OPEN", "IN_PROGRESS"].includes(application.drive.status)) throw new Error("This drive is not open right now.");
  const now = Date.now();
  try {
    await prisma.screeningAttempt.create({
      data: {
        applicationId: application.id,
        deadlineAt: new Date(now + application.drive.screeningMinutes * 60_000),
        seed: randomInt(1, 2_000_000_000),
        answers: {},
      },
    });
  } catch (err) {
    // Two clicks at once: the unique application id means only one attempt can ever exist.
    if ((err as { code?: string }).code !== "P2002") throw err;
  }
  refresh(driveId);
}

/** Saves the answers so far (the page does this as the student answers). Refused after the time is up. */
async function runSave(driveId: string, rawAnswers: unknown) {
  const { session, application } = await loadMine(driveId);
  if (!checkRateLimit(`screening-save:${session.userId}`, 240, 10 * 60_000).allowed) throw new Error("Saving too fast. Please slow down.");
  const attempt = application.screeningAttempt;
  if (!attempt || attempt.submittedAt) throw new Error("This interview is not in progress.");
  if (Date.now() > attempt.deadlineAt.getTime() + GRACE_MS) throw new Error("The time is up.");
  const questions = await prisma.screeningQuestion.findMany({ where: { driveId }, select: { id: true, kind: true, options: true } });
  const answers = cleanAnswers(rawAnswers, questions);
  await prisma.screeningAttempt.updateMany({
    where: { id: attempt.id, submittedAt: null },
    data: { answers: answers as Prisma.InputJsonValue },
  });
}

/** The student presses Submit (or the timer ends). Returns whether the time had already run out. */
async function runSubmit(driveId: string, rawAnswers: unknown) {
  const { application } = await loadMine(driveId);
  const attempt = application.screeningAttempt;
  if (!attempt) throw new Error("Start the interview first.");
  if (attempt.submittedAt) return { late: false };
  const late = Date.now() > attempt.deadlineAt.getTime() + GRACE_MS;
  // After the deadline only the answers already saved count; nothing new is accepted.
  await finalizeAttempt(attempt.id, late ? { auto: true, at: attempt.deadlineAt } : { auto: Date.now() > attempt.deadlineAt.getTime(), answers: rawAnswers });
  refresh(driveId);
  return { late };
}

export async function startScreeningAction(driveId: string) {
  return guard(() => runStart(driveId));
}
export async function saveScreeningAnswersAction(driveId: string, answers: unknown) {
  return guard(() => runSave(driveId, answers));
}
export async function submitScreeningAction(driveId: string, answers: unknown) {
  return guard(() => runSubmit(driveId, answers));
}
