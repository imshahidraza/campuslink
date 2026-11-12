import { prisma } from "./prisma";
import { cleanAnswers, scoreMcq } from "./screening";
import type { Prisma } from "@prisma/client";

/**
 * Server helpers for a student's screening attempt. The score is counted here, by code, from the answers that were
 * saved. An attempt whose time ran out is finished with the answers saved so far, the next time anyone looks at it.
 */

/** A few seconds of slack for a slow network, so a click made right at the deadline still counts. */
export const GRACE_MS = 10_000;

/** Finishes one attempt: counts the multiple-choice score and locks the answers. Safe to call twice. */
export async function finalizeAttempt(attemptId: string, opts: { auto: boolean; at?: Date; answers?: unknown }) {
  const attempt = await prisma.screeningAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      submittedAt: true,
      answers: true,
      application: { select: { drive: { select: { screeningQuestions: { select: { id: true, kind: true, options: true, correctIndex: true } } } } } },
    },
  });
  if (!attempt || attempt.submittedAt) return false;
  const questions = attempt.application.drive.screeningQuestions;
  const answers = cleanAnswers(opts.answers ?? attempt.answers, questions);
  const score = scoreMcq(questions, answers);
  // Only the first finish wins (submittedAt must still be empty), so a double click or a race changes nothing.
  const done = await prisma.screeningAttempt.updateMany({
    where: { id: attempt.id, submittedAt: null },
    data: {
      submittedAt: opts.at ?? new Date(),
      autoSubmitted: opts.auto,
      answers: answers as Prisma.InputJsonValue,
      mcqCorrect: score.correct,
      mcqTotal: score.total,
    },
  });
  return done.count === 1;
}

/** Finishes every attempt (matching `where`) whose time is up. */
export async function settleExpired(where: Prisma.ScreeningAttemptWhereInput = {}) {
  const late = await prisma.screeningAttempt.findMany({
    where: { ...where, submittedAt: null, deadlineAt: { lt: new Date(Date.now() - GRACE_MS) } },
    select: { id: true, deadlineAt: true },
    take: 500,
  });
  for (const a of late) await finalizeAttempt(a.id, { auto: true, at: a.deadlineAt });
}

export const settleDrive = (driveId: string) => settleExpired({ application: { driveId } });
export const settleApplication = (applicationId: string) => settleExpired({ applicationId });

/** Milliseconds left until a deadline, counted on the server. Kept here so pages don't call the clock themselves. */
export const msLeft = (deadline: Date) => Math.max(0, deadline.getTime() - Date.now());
