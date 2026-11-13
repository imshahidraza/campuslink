"use server";

import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { guard } from "@/lib/actionResult";
import { checkRateLimit } from "@/lib/rateLimit";
import { finalizeVideoAttempt, settleVideoApplication } from "@/lib/videoAttempt";
import { rawRun } from "@/lib/videoStore";
import {
  ANSWER_GRACE_MS,
  END_REASONS,
  HEARTBEAT_STALE_MS,
  MAX_CHUNKS,
  UPLOAD_GRACE_MS,
  VIDEO_MINUTES,
  VIDEO_QUESTION_COUNT,
  checkAnswerWindow,
  isSupportedRecordingMime,
  type EndReason,
  type VideoStage,
} from "@/lib/video";

/* The student's side of the video interview. Every action checks that the caller is a student, that the
 * application is their own, and that the interview is in the right state, on the server. The deadline is the
 * server's, the order of the questions is the server's, and the student never receives the marking guide. */

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
      videoAttempt: { select: { id: true, status: true, startedAt: true, deadlineAt: true, lastChunkAt: true } },
      drive: { select: { id: true, status: true, videoStatus: true } },
    },
  });
  if (!application || application.stage === "WITHDRAWN") throw new Error("Apply to this drive first.");
  if (application.drive.videoStatus !== "PUBLISHED") throw new Error("This drive has no video interview.");
  return { session, application };
}

/*
 * These actions deliberately do NOT call revalidatePath. The student's page keeps the recording in memory, and a
 * revalidation would redraw the page from the server in the middle of the interview and discard it. The page asks
 * for a fresh copy itself (router.refresh) once the interview is over.
 */

/* ---------- Start ---------- */

async function runStart(input: unknown) {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const { session, application } = await loadMine(raw.driveId);
  if (raw.consent !== true) throw new Error("Please tick the consent box before you start.");
  if (!isSupportedRecordingMime(raw.mimeType)) {
    throw new Error("This browser cannot record in the supported format. Please use Google Chrome or Microsoft Edge on a computer.");
  }
  if (!checkRateLimit(`video-start:${session.userId}`, 10, 10 * 60_000).allowed) throw new Error("Please wait a moment and try again.");
  if (application.videoAttempt) throw new Error("You have already started this interview. Please refresh the page.");
  if (!TAKING_STAGES.includes(application.stage)) throw new Error("You can't take this interview for this application.");
  if (!["OPEN", "IN_PROGRESS"].includes(application.drive.status)) throw new Error("This drive is not open right now.");

  const questions = await prisma.videoQuestion.findMany({ where: { driveId: application.drive.id }, orderBy: { position: "asc" } });
  if (questions.length !== VIDEO_QUESTION_COUNT) throw new Error("This interview is not ready yet. Please try again later.");

  const now = new Date();
  const deadlineAt = new Date(now.getTime() + VIDEO_MINUTES * 60_000);
  let attemptId: string;
  try {
    // The attempt and its five answer rows are created together, with the server's clock. The question text is copied,
    // so it can never change under the student.
    const created = await prisma.videoAttempt.create({
      data: {
        applicationId: application.id,
        consentAt: now,
        startedAt: now,
        deadlineAt,
        mimeType: raw.mimeType,
        answers: { create: questions.map((q) => ({ position: q.position, prompt: q.prompt, expected: q.expected })) },
      },
      select: { id: true },
    });
    attemptId = created.id;
  } catch (err) {
    // Two clicks at once: the unique application id means only one attempt can ever exist.
    if ((err as { code?: string }).code === "P2002") throw new Error("You have already started this interview. Please refresh the page.");
    throw err;
  }
  return {
    attemptId,
    deadlineAtMs: deadlineAt.getTime(),
    serverNowMs: Date.now(),
    questions: questions.map((q) => ({ position: q.position, prompt: q.prompt })),
  };
}

/* ---------- Answer / skip ---------- */

async function pendingState(attemptId: string) {
  const rows = await prisma.videoAnswer.findMany({ where: { attemptId }, orderBy: { position: "asc" }, select: { position: true, status: true, startSec: true, endSec: true } });
  const next = rows.find((r) => r.status === "PENDING") ?? null;
  return { rows, next, remaining: rows.filter((r) => r.status === "PENDING").length };
}

function openAttempt(application: Awaited<ReturnType<typeof loadMine>>["application"]) {
  const attempt = application.videoAttempt;
  if (!attempt || attempt.status !== "IN_PROGRESS") throw new Error("This interview is not in progress.");
  if (Date.now() > attempt.deadlineAt.getTime() + ANSWER_GRACE_MS) throw new Error("The time is up.");
  return attempt;
}

function questionNumber(v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= VIDEO_QUESTION_COUNT) throw new Error("That question is not available.");
  return v;
}

/** The student released the microphone button: the held time is the answer. Saved once; the next question follows. */
async function runAnswer(driveId: unknown, position: unknown, startSec: unknown, endSec: unknown) {
  const { session, application } = await loadMine(driveId);
  if (!checkRateLimit(`video-answer:${session.userId}`, 60, 10 * 60_000).allowed) throw new Error("Too many requests. Please slow down.");
  const attempt = openAttempt(application);
  const n = questionNumber(position);
  const state = await pendingState(attempt.id);

  // The same answer sent twice (a double release, a retry after a slow network) is accepted once and acknowledged again.
  const existing = state.rows.find((r) => r.position === n);
  if (existing?.status === "ANSWERED" && typeof startSec === "number" && typeof endSec === "number" && Math.abs((existing.startSec ?? -9) - startSec) < 0.05) {
    return { remaining: state.remaining };
  }
  if (!state.next || state.next.position !== n) throw new Error("That question is not available.");

  const previousEnd = Math.max(0, ...state.rows.filter((r) => r.status === "ANSWERED").map((r) => r.endSec ?? 0));
  const elapsedSec = (Date.now() - attempt.startedAt.getTime()) / 1000;
  const w = checkAnswerWindow({ startSec, endSec, elapsedSec, previousEndSec: previousEnd });
  if (!w.ok) throw new Error(w.message);

  const saved = await prisma.videoAnswer.updateMany({
    where: { attemptId: attempt.id, position: n, status: "PENDING" },
    data: { status: "ANSWERED", startSec: w.startSec, endSec: w.endSec },
  });
  if (saved.count === 0) throw new Error("That question is not available.");
  return { remaining: state.remaining - 1 };
}

/** The student skipped for good. The question is never offered again and gets 0 marks. */
async function runSkip(driveId: unknown, position: unknown) {
  const { session, application } = await loadMine(driveId);
  if (!checkRateLimit(`video-answer:${session.userId}`, 60, 10 * 60_000).allowed) throw new Error("Too many requests. Please slow down.");
  const attempt = openAttempt(application);
  const n = questionNumber(position);
  const state = await pendingState(attempt.id);
  if (state.rows.find((r) => r.position === n)?.status === "SKIPPED") return { remaining: state.remaining };
  if (!state.next || state.next.position !== n) throw new Error("That question is not available.");
  const saved = await prisma.videoAnswer.updateMany({ where: { attemptId: attempt.id, position: n, status: "PENDING" }, data: { status: "SKIPPED" } });
  if (saved.count === 0) throw new Error("That question is not available.");
  return { remaining: state.remaining - 1 };
}

/* ---------- Finish ---------- */

type FinishResult = { done: true; stage: VideoStage } | { done: false; missing: number[] };

/**
 * The page has stopped recording and uploaded every piece, and says how many pieces there are. The server checks that
 * they all arrived. If some did not, it says which, so the page can send them again, until the upload time ends.
 */
async function runFinish(driveId: unknown, input: unknown): Promise<FinishResult> {
  const { session, application } = await loadMine(driveId);
  if (!checkRateLimit(`video-finish:${session.userId}`, 60, 10 * 60_000).allowed) throw new Error("Too many requests. Please slow down.");
  const attempt = application.videoAttempt;
  if (!attempt) throw new Error("Start the interview first.");
  if (attempt.status !== "IN_PROGRESS") return { done: true, stage: attempt.status };

  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const chunkCount = raw.chunkCount;
  if (typeof chunkCount !== "number" || !Number.isInteger(chunkCount) || chunkCount < 0 || chunkCount > MAX_CHUNKS) throw new Error("That could not be saved. Please try again.");
  const force = raw.force === true;
  const reason: EndReason = END_REASONS.includes(raw.reason as EndReason) ? (raw.reason as EndReason) : "DEVICE";

  const now = Date.now();
  const run = await rawRun(attempt.id);
  if (run.count < chunkCount && !force && now <= attempt.deadlineAt.getTime() + UPLOAD_GRACE_MS) {
    const got = new Set((await prisma.videoChunk.findMany({ where: { attemptId: attempt.id, kind: "RAW" }, select: { seq: true } })).map((c) => c.seq));
    const missing: number[] = [];
    for (let i = 0; i < chunkCount && missing.length < 40; i++) if (!got.has(i)) missing.push(i);
    return { done: false, missing };
  }

  const state = await pendingState(attempt.id);
  let status: "SUBMITTED" | "TIMED_OUT" | "INTERRUPTED";
  let endReason: EndReason;
  if (state.remaining === 0) {
    status = "SUBMITTED";
    endReason = "ALL_DONE";
  } else if (now >= attempt.deadlineAt.getTime() - 3000) {
    status = "TIMED_OUT";
    endReason = "TIME_UP";
  } else {
    status = "INTERRUPTED";
    endReason = reason === "TIME_UP" || reason === "ALL_DONE" ? "DEVICE" : reason;
  }
  await finalizeVideoAttempt(attempt.id, status, endReason, {
    endedAt: status === "TIMED_OUT" ? attempt.deadlineAt : undefined,
    claimedChunks: chunkCount,
  });
  const after = await prisma.videoAttempt.findUnique({ where: { id: attempt.id }, select: { status: true } });
  return { done: true, stage: after?.status ?? status };
}

/* ---------- Leaving the page, re-opened page ---------- */

/** The page reports each time the student leaves it (another tab or window). Only the server's count is kept. */
async function runLeave(driveId: unknown) {
  const { session, application } = await loadMine(driveId);
  if (!checkRateLimit(`video-leave:${session.userId}`, 200, 10 * 60_000).allowed) throw new Error("Too many requests.");
  const attempt = application.videoAttempt;
  if (!attempt || attempt.status !== "IN_PROGRESS") return { count: 0 };
  await prisma.videoAttempt.updateMany({ where: { id: attempt.id, status: "IN_PROGRESS" }, data: { leaveCount: { increment: 1 } } });
  const now = await prisma.videoAttempt.findUnique({ where: { id: attempt.id }, select: { leaveCount: true } });
  return { count: now?.leaveCount ?? 0 };
}

/**
 * A page that opens on an attempt that is still marked in progress cannot be the page that is recording (the
 * recording page keeps its state in memory). It asks here until the server can tell whether the first page is still
 * sending: if nothing has arrived for a few seconds, the attempt is closed as interrupted.
 */
async function runCheckSession(driveId: unknown) {
  const { session, application } = await loadMine(driveId);
  if (!checkRateLimit(`video-check:${session.userId}`, 60, 10 * 60_000).allowed) throw new Error("Too many requests.");
  if (!application.videoAttempt) return { stage: "NOT_STARTED" as VideoStage };
  await settleVideoApplication(application.id, HEARTBEAT_STALE_MS);
  const a = await prisma.videoAttempt.findUnique({ where: { id: application.videoAttempt.id }, select: { status: true } });
  return { stage: (a?.status ?? "INTERRUPTED") as VideoStage };
}

export async function startVideoAction(input: { driveId: string; consent: boolean; mimeType: string }) {
  return guard(() => runStart(input));
}
export async function answerVideoQuestionAction(driveId: string, position: number, startSec: number, endSec: number) {
  return guard(() => runAnswer(driveId, position, startSec, endSec));
}
export async function skipVideoQuestionAction(driveId: string, position: number) {
  return guard(() => runSkip(driveId, position));
}
export async function finishVideoAction(driveId: string, input: { chunkCount: number; force?: boolean; reason?: string }) {
  return guard(() => runFinish(driveId, input));
}
export async function reportVideoLeaveAction(driveId: string) {
  return guard(() => runLeave(driveId));
}
export async function checkVideoSessionAction(driveId: string) {
  return guard(() => runCheckSession(driveId));
}
