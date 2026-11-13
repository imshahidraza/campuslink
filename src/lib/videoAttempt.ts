import { prisma } from "./prisma";
import { OllamaError } from "./ollama";
import { evaluateVideoAnswer } from "./ai";
import { assemble, deleteRecordingData, rawRun, recordingIndex, replaceWithFinal } from "./videoStore";
import { remuxRecording, transcribeWindows, WhisperError } from "./whisperClient";
import { CHUNK_MS, MIN_WORDS_TO_MARK, RETAIN_DAYS, SWEEP_STALE_MS, UPLOAD_GRACE_MS, wordCount, type EndReason } from "./video";
import type { Prisma } from "@prisma/client";

/**
 * Server helpers for a student's video interview. The deadline is kept here on the server. An attempt whose time
 * ran out, or whose page disappeared, is closed the next time anyone looks at it. When an attempt is closed, it is
 * processed in the background: the recording is made searchable, the answers are turned into text, and the AI
 * writes its advice. Everything the AI says is advice for the recruiter. Nothing here decides anything.
 */

const PROCESS_STALE_MS = 45 * 60_000; // a processing run older than this is treated as dead (the server restarted)

type Ending = "SUBMITTED" | "TIMED_OUT" | "INTERRUPTED";

/** Closes an attempt that is still IN_PROGRESS. Only the first call wins, so double calls and races change nothing. */
export async function finalizeVideoAttempt(
  attemptId: string,
  status: Ending,
  reason: EndReason,
  opts: { endedAt?: Date; claimedChunks?: number } = {}
): Promise<boolean> {
  const open = await prisma.videoAttempt.findFirst({ where: { id: attemptId, status: "IN_PROGRESS" }, select: { id: true } });
  if (!open) return false;
  const run = await rawRun(attemptId);
  const notes: string[] = [];
  if (run.received > run.count) notes.push(`${run.received - run.count} piece(s) of the recording arrived after a gap and could not be used.`);
  if (opts.claimedChunks !== undefined && opts.claimedChunks > run.count) {
    notes.push(`The browser recorded ${opts.claimedChunks} pieces, but only the first ${run.count} reached the server, so the end of the recording is missing.`);
  }
  const now = new Date();
  const won = await prisma.videoAttempt.updateMany({
    where: { id: attemptId, status: "IN_PROGRESS" },
    data: {
      status,
      endReason: reason,
      endedAt: opts.endedAt ?? now,
      chunkCount: run.count,
      byteSize: run.bytes,
      gapNote: notes.length ? notes.join(" ") : null,
      retainUntil: new Date(now.getTime() + RETAIN_DAYS * 86_400_000),
    },
  });
  if (won.count !== 1) return false;
  await prisma.videoAnswer.updateMany({ where: { attemptId, status: "PENDING" }, data: { status: "UNANSWERED" } });
  kickProcessing(attemptId);
  return true;
}

/**
 * Closes every attempt (matching `where`) that is over: the 15 minutes plus a little upload time have passed, or
 * nothing has arrived from the page for `staleMs`. The page may be gone (closed, refreshed, computer asleep).
 */
export async function settleVideoWhere(where: Prisma.VideoAttemptWhereInput = {}, staleMs: number = SWEEP_STALE_MS) {
  const open = await prisma.videoAttempt.findMany({
    where: { ...where, status: "IN_PROGRESS" },
    select: { id: true, startedAt: true, deadlineAt: true, lastChunkAt: true },
    take: 200,
  });
  const now = Date.now();
  for (const a of open) {
    const lastSeen = (a.lastChunkAt ?? a.startedAt).getTime();
    const deadline = a.deadlineAt.getTime();
    if (now > deadline + UPLOAD_GRACE_MS) {
      const aliveAtEnd = lastSeen >= deadline - 3 * CHUNK_MS;
      if (aliveAtEnd) await finalizeVideoAttempt(a.id, "TIMED_OUT", "TIME_UP", { endedAt: a.deadlineAt });
      else await finalizeVideoAttempt(a.id, "INTERRUPTED", "LEFT_PAGE", { endedAt: new Date(lastSeen) });
    } else if (now - lastSeen > staleMs) {
      await finalizeVideoAttempt(a.id, "INTERRUPTED", "LEFT_PAGE", { endedAt: new Date(lastSeen) });
    }
  }
  // Every page that looks at interviews also keeps the retention promise (it is throttled, so this is cheap).
  await purgeExpiredRecordings().catch((err) => console.error("video retention purge failed:", err instanceof Error ? err.message : "unknown error"));
}

export const settleVideoDrive = (driveId: string) => settleVideoWhere({ application: { driveId } });
export const settleVideoApplication = (applicationId: string, staleMs?: number) => settleVideoWhere({ applicationId }, staleMs);
export const settleVideoRecruiter = (recruiterId: string) => settleVideoWhere({ application: { drive: { recruiterId } } });

/* ---------- Retention ---------- */

const gp = globalThis as unknown as { __videoPurgeAt?: number };

/** Deletes recordings whose keep-until date has passed. The transcripts, marks and access log are kept. At most once every 10 minutes. */
export async function purgeExpiredRecordings() {
  const now = Date.now();
  if (gp.__videoPurgeAt && now - gp.__videoPurgeAt < 600_000) return;
  gp.__videoPurgeAt = now;
  const old = await prisma.videoAttempt.findMany({
    where: { status: { not: "IN_PROGRESS" }, recordingDeletedAt: null, retainUntil: { lt: new Date(now) } },
    select: { id: true },
    take: 50,
  });
  for (const a of old) {
    await deleteRecordingData(a.id);
    await prisma.videoAccessLog.create({ data: { attemptId: a.id, userId: "system", role: "SYSTEM", action: "DELETE_EXPIRED" } });
  }
}

/* ---------- Processing: make searchable → speech to text → AI advice ---------- */

const g = globalThis as unknown as { __videoRunning?: Set<string> };
const running = (g.__videoRunning ??= new Set<string>());

export function kickProcessing(attemptId: string) {
  void processVideoAttempt(attemptId).catch((err) => {
    console.error("video processing stopped:", attemptId, err instanceof Error ? err.message : "unknown error");
  });
}

/** Starts processing again if an attempt is closed but its work never finished (for example the server was restarted). */
export function ensureProcessing(a: { id: string; status: string; remuxStatus: string; transcriptionStatus: string; evaluationStatus: string; recordingDeletedAt: Date | null; processingStartedAt: Date | null }) {
  if (a.status === "IN_PROGRESS" || a.recordingDeletedAt) return;
  const waiting = [a.remuxStatus, a.transcriptionStatus, a.evaluationStatus].some((s) => s === "PENDING" || s === "PROCESSING");
  if (!waiting) return;
  const live = a.processingStartedAt && Date.now() - a.processingStartedAt.getTime() < PROCESS_STALE_MS;
  if (!live && !running.has(a.id)) kickProcessing(a.id);
}

async function lock(attemptId: string): Promise<boolean> {
  const stale = new Date(Date.now() - PROCESS_STALE_MS);
  const got = await prisma.videoAttempt.updateMany({
    where: {
      id: attemptId,
      status: { not: "IN_PROGRESS" },
      recordingDeletedAt: null,
      OR: [{ processingStartedAt: null }, { processingStartedAt: { lt: stale } }],
    },
    data: { processingStartedAt: new Date() },
  });
  return got.count === 1;
}

async function loadRecording(attemptId: string): Promise<Buffer | null> {
  const index = await recordingIndex(attemptId);
  if (!index) return null;
  return assemble(attemptId, index.kind, index.rows.length);
}

async function runPipeline(attemptId: string) {
  const attempt = await prisma.videoAttempt.findUnique({
    where: { id: attemptId },
    include: {
      answers: { orderBy: { position: "asc" } },
      application: { select: { drive: { select: { jobRole: true, jdRequiredSkills: true } } } },
    },
  });
  if (!attempt) return;
  const jobRole = attempt.application.drive.jobRole;

  /* Questions that need no speech: skipped (0 marks), or never reached. */
  for (const a of attempt.answers) {
    if (a.status === "SKIPPED" && a.evalStatus !== "DONE") {
      await prisma.videoAnswer.update({
        where: { id: a.id },
        data: { score: 0, technical: 0, relevance: 0, completeness: 0, clarity: 0, transcriptStatus: "DONE", evalStatus: "DONE", feedback: "The student skipped this question.", needsReview: false, note: null },
      });
    } else if (a.status === "UNANSWERED" && a.evalStatus !== "DONE") {
      const interrupted = attempt.status === "INTERRUPTED";
      await prisma.videoAnswer.update({
        where: { id: a.id },
        data: interrupted
          ? { score: null, transcriptStatus: "DONE", evalStatus: "DONE", needsReview: true, note: "The interview was interrupted before this question was answered. No marks were given. Please decide what to do." }
          : { score: 0, technical: 0, relevance: 0, completeness: 0, clarity: 0, transcriptStatus: "DONE", evalStatus: "DONE", needsReview: false, note: "Not answered before the time ended." },
      });
    }
  }

  /* Step 1: make the recording searchable (a proper duration and seek index). */
  let bytes: Buffer | null = null;
  let durationSec = attempt.durationSec;
  if (attempt.remuxStatus !== "DONE") {
    await prisma.videoAttempt.update({ where: { id: attemptId }, data: { remuxStatus: "PROCESSING", processNote: null } });
    const run = await rawRun(attemptId);
    if (run.count === 0) {
      await prisma.videoAttempt.update({ where: { id: attemptId }, data: { remuxStatus: "FAILED", processNote: "No part of the recording reached the server." } });
    } else {
      try {
        const raw = await assemble(attemptId, "RAW", run.count);
        try {
          const r = await remuxRecording(raw);
          await replaceWithFinal(attemptId, r.bytes, r.durationSec);
          bytes = r.bytes;
          durationSec = r.durationSec;
        } catch (err) {
          bytes = raw; // the unprocessed recording can still be listened to and transcribed
          const msg = err instanceof WhisperError ? err.message : "The recording could not be prepared.";
          await prisma.videoAttempt.update({ where: { id: attemptId }, data: { remuxStatus: "FAILED", processNote: `${msg} The recording can be played, but searching inside it may not work.` } });
        }
      } catch {
        await prisma.videoAttempt.update({ where: { id: attemptId }, data: { remuxStatus: "FAILED", processNote: "The recording could not be read from the database." } });
      }
    }
  }

  /* Step 2: speech to text, one window per answered question. */
  const fresh = await prisma.videoAnswer.findMany({ where: { attemptId }, orderBy: { position: "asc" } });
  const toTranscribe = fresh.filter((a) => a.status === "ANSWERED" && a.transcriptStatus !== "DONE" && a.startSec !== null && a.endSec !== null);
  let transcriptionFailed = false;
  if (toTranscribe.length > 0) {
    await prisma.videoAttempt.update({ where: { id: attemptId }, data: { transcriptionStatus: "PROCESSING" } });
    const windows: { index: number; startSec: number; endSec: number }[] = [];
    // A little extra on each side so the first and last words are not cut, but never into a neighbouring answer:
    // where two answers are close, the gap between them is split in the middle.
    const spoken = fresh.filter((a) => a.status === "ANSWERED" && a.startSec !== null && a.endSec !== null);
    for (const a of toTranscribe) {
      const before = spoken.filter((x) => x.position < a.position).at(-1);
      const after = spoken.find((x) => x.position > a.position);
      const s0 = a.startSec ?? 0;
      const e0 = a.endSec ?? 0;
      const start = Math.max(0, before?.endSec != null ? Math.max(s0 - 0.4, (before.endSec + s0) / 2) : s0 - 0.4);
      let end = after?.startSec != null ? Math.min(e0 + 0.8, (e0 + after.startSec) / 2) : e0 + 0.8;
      if (durationSec !== null && start >= durationSec - 0.3) {
        await prisma.videoAnswer.update({
          where: { id: a.id },
          data: { transcriptStatus: "FAILED", evalStatus: "FAILED", needsReview: true, note: "The recording ends before this answer, because part of it was never uploaded. Please decide what to do." },
        });
        continue;
      }
      if (durationSec !== null) end = Math.min(end, durationSec);
      windows.push({ index: a.position, startSec: start, endSec: end });
    }
    if (windows.length > 0) {
      try {
        bytes = bytes ?? (await loadRecording(attemptId));
        if (!bytes) throw new WhisperError("The recording is not available.");
        const hint = `${jobRole}. ${attempt.application.drive.jdRequiredSkills.slice(0, 8).join(", ")}`;
        const results = await transcribeWindows(bytes, windows, hint);
        for (const w of windows) {
          const r = results.find((x) => x.index === w.index);
          const answer = toTranscribe.find((x) => x.position === w.index);
          if (!answer) continue;
          if (!r) {
            await prisma.videoAnswer.update({ where: { id: answer.id }, data: { transcriptStatus: "FAILED", evalStatus: "FAILED", needsReview: true, note: "The speech service returned nothing for this answer. Use 'Process again', or listen to it yourself." } });
            transcriptionFailed = true;
            continue;
          }
          const text = r.text.trim();
          const usable = wordCount(text) >= MIN_WORDS_TO_MARK;
          await prisma.videoAnswer.update({
            where: { id: answer.id },
            data: usable
              ? { transcript: text, transcriptStatus: "DONE" }
              : { transcript: text || null, transcriptStatus: "DONE", evalStatus: "FAILED", needsReview: true, note: "Very little or no speech was recognised in this answer, so it was not marked. Please listen to it yourself. This is not a judgement that the answer was wrong." },
          });
        }
      } catch (err) {
        transcriptionFailed = true;
        const msg = err instanceof WhisperError ? err.message : "The speech service failed.";
        await prisma.videoAnswer.updateMany({
          where: { id: { in: toTranscribe.map((a) => a.id) }, transcriptStatus: { not: "DONE" }, needsReview: false },
          data: { transcriptStatus: "FAILED", evalStatus: "FAILED", needsReview: true, note: `${msg} No marks were given. Start the speech service and press 'Process again', or listen to the answer yourself.` },
        });
      }
    }
  }
  await prisma.videoAttempt.update({ where: { id: attemptId }, data: { transcriptionStatus: transcriptionFailed ? "FAILED" : "DONE" } });

  /* Step 3: the AI's advice on each transcript. */
  const ready = await prisma.videoAnswer.findMany({
    where: { attemptId, status: "ANSWERED", transcriptStatus: "DONE", evalStatus: { not: "DONE" }, transcript: { not: null } },
    orderBy: { position: "asc" },
  });
  const evaluable = ready.filter((a) => wordCount(a.transcript ?? "") >= MIN_WORDS_TO_MARK);
  let evaluationFailed = false;
  if (evaluable.length > 0) {
    await prisma.videoAttempt.update({ where: { id: attemptId }, data: { evaluationStatus: "PROCESSING" } });
    let aiDown = false;
    for (const a of evaluable) {
      if (aiDown) {
        await prisma.videoAnswer.update({ where: { id: a.id }, data: { evalStatus: "FAILED", needsReview: true, note: "The AI was not available, so this answer was not marked. Use 'Process again' later." } });
        continue;
      }
      try {
        const ev = await evaluateVideoAnswer({ jobRole, question: a.prompt, expected: a.expected, transcript: a.transcript ?? "" });
        if (!ev) {
          evaluationFailed = true;
          await prisma.videoAnswer.update({ where: { id: a.id }, data: { evalStatus: "FAILED", needsReview: true, note: "The AI did not return usable marks for this answer. Please read the transcript and judge it yourself." } });
        } else {
          await prisma.videoAnswer.update({
            where: { id: a.id },
            data: { evalStatus: "DONE", score: ev.score, technical: ev.technical, relevance: ev.relevance, completeness: ev.completeness, clarity: ev.clarity, strengths: ev.strengths, improvements: ev.improvements, feedback: ev.feedback, needsReview: false, note: null },
          });
        }
      } catch (err) {
        evaluationFailed = true;
        if (err instanceof OllamaError) aiDown = true;
        await prisma.videoAnswer.update({ where: { id: a.id }, data: { evalStatus: "FAILED", needsReview: true, note: "The AI was not available, so this answer was not marked. Use 'Process again' later." } });
      }
    }
  }

  /* Totals. Skipped counts as 0. An answer that could not be marked adds nothing and is flagged for the recruiter. */
  const all = await prisma.videoAnswer.findMany({ where: { attemptId }, select: { score: true, needsReview: true } });
  await prisma.videoAttempt.update({
    where: { id: attemptId },
    data: {
      evaluationStatus: evaluationFailed ? "FAILED" : "DONE",
      totalScore: all.reduce((n, x) => n + (x.score ?? 0), 0),
      reviewCount: all.filter((x) => x.needsReview).length,
    },
  });
}

export async function processVideoAttempt(attemptId: string) {
  if (running.has(attemptId)) return;
  running.add(attemptId);
  try {
    if (!(await lock(attemptId))) return;
    try {
      await runPipeline(attemptId);
    } catch (err) {
      console.error("video pipeline error:", attemptId, err instanceof Error ? err.message : "unknown error");
      await prisma.videoAttempt.updateMany({
        where: { id: attemptId },
        data: { processNote: "Processing stopped because of an unexpected error. Use 'Process again'.", evaluationStatus: "FAILED" },
      });
    } finally {
      await prisma.videoAttempt.updateMany({ where: { id: attemptId }, data: { processingStartedAt: null } });
    }
  } finally {
    running.delete(attemptId);
  }
}

/**
 * The recruiter asks for the failed steps to be tried again. Only things that FAILED are repeated: finished
 * transcripts and marks are never replaced, so a second click can't change a result that was already good.
 */
export async function resetFailedSteps(attemptId: string) {
  await prisma.videoAnswer.updateMany({
    where: { attemptId, status: "ANSWERED", transcriptStatus: "FAILED" },
    data: { transcriptStatus: "PENDING", evalStatus: "PENDING", needsReview: false, note: null },
  });
  // A transcript that exists and is long enough, but was not marked (the AI was down): mark it again.
  const unmarked = await prisma.videoAnswer.findMany({
    where: { attemptId, status: "ANSWERED", transcriptStatus: "DONE", evalStatus: "FAILED", transcript: { not: null } },
    select: { id: true, transcript: true },
  });
  for (const a of unmarked) {
    if (wordCount(a.transcript ?? "") >= MIN_WORDS_TO_MARK) {
      await prisma.videoAnswer.update({ where: { id: a.id }, data: { evalStatus: "PENDING", needsReview: false, note: null } });
    }
  }
  await prisma.videoAttempt.updateMany({
    where: { id: attemptId, remuxStatus: "FAILED" },
    data: { remuxStatus: "PENDING" },
  });
  await prisma.videoAttempt.update({ where: { id: attemptId }, data: { transcriptionStatus: "PENDING", evaluationStatus: "PENDING", processNote: null, processingStartedAt: null } });
  kickProcessing(attemptId);
}
