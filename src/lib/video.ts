/**
 * The recorded video interview: the rules and the pure checks. No database code here, so pages and the
 * recording screen can use it too.
 *
 * Five spoken questions, 15 minutes in all, one continuous recording. The AI only drafts the questions and
 * gives advice on the answers. Every number below is also enforced again on the server.
 */

import { plainText } from "./screening";

export const VIDEO_QUESTION_COUNT = 5;
export const VIDEO_MINUTES = 15;

/** A press on the microphone button shorter than this is treated as an accident and ignored. */
export const MIN_HOLD_SECONDS = 1;
/** The server is a little more forgiving than the screen, to allow for timing differences. */
export const SERVER_MIN_ANSWER_SECONDS = 0.8;

export const CHUNK_MS = 5000; // the browser hands over a piece of the recording this often
export const MAX_CHUNK_BYTES = 3 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 220 * 1024 * 1024; // far above a normal 15 minutes (about 60 MB)
export const MAX_CHUNKS = 600;
export const FINAL_SEGMENT_BYTES = 1024 * 1024; // the finished recording is stored in pieces of this size

export const ANSWER_GRACE_MS = 10_000; // slack for a slow network on the last click
export const UPLOAD_GRACE_MS = 90_000; // time allowed after the deadline for the last pieces to arrive
export const FINISH_GRACE_MS = 5 * 60_000; // after this, an attempt nobody finished is closed as interrupted
export const HEARTBEAT_STALE_MS = 15_000; // a re-opened page treats "no new piece for this long" as: the first page is gone
export const SWEEP_STALE_MS = 60_000; // anyone else looking at the attempt waits this long before calling it interrupted
export const CLOCK_SLACK_SEC = 8; // the recording starts a moment before the server records the start

export const RETAIN_DAYS = 30;

/** Marks for one answer, out of 100. */
export const RUBRIC = { technical: 40, relevance: 25, completeness: 20, clarity: 15 } as const;
export const MAX_SCORE_PER_QUESTION = 100;
export const MAX_TOTAL_SCORE = MAX_SCORE_PER_QUESTION * VIDEO_QUESTION_COUNT;

export interface DraftVideoQuestion {
  prompt: string;
  expected: string | null;
}

/** Keeps only usable questions from the AI's reply. A draft needs exactly five. */
export function cleanVideoDraft(raw: unknown): DraftVideoQuestion[] {
  const obj = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(raw) ? raw : (["questions", "items", "interview"].map((k) => obj[k]).find(Array.isArray) as unknown[] | undefined) ?? [];
  const out: DraftVideoQuestion[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (out.length >= VIDEO_QUESTION_COUNT) break;
    const it = typeof item === "string" ? { question: item } : (typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {});
    const prompt = plainText(it.question ?? it.prompt, 15, 250);
    if (!prompt) continue;
    const key = prompt.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const expected = plainText(it.expected ?? it.lookFor ?? it.keyPoints, 10, 400) || null;
    out.push({ prompt, expected });
  }
  return out;
}

export function cleanVideoQuestionEdit(input: { prompt?: unknown; expected?: unknown }):
  | { ok: true; question: DraftVideoQuestion }
  | { ok: false; message: string } {
  const prompt = plainText(input.prompt, 15, 250);
  if (!prompt) return { ok: false, message: "The question must be 15 to 250 characters, with no links or markup." };
  const raw = typeof input.expected === "string" ? input.expected.trim() : "";
  const expected = raw ? plainText(raw, 10, 400) : "";
  if (raw && !expected) return { ok: false, message: "'A good answer covers' must be 10 to 400 characters, with no links or markup." };
  return { ok: true, question: { prompt, expected: expected || null } };
}

/* ---------- The recording itself ---------- */

export function isAllowedVideoMime(mime: unknown): mime is string {
  return typeof mime === "string" && mime.length <= 100 && /^video\/(webm|mp4)(;[a-z0-9=.,\- ]+)?$/i.test(mime);
}

export function mimeFamily(mime: string): "webm" | "mp4" {
  return /^video\/mp4/i.test(mime) ? "mp4" : "webm";
}

/** Only WebM is accepted: that is what Chrome and Edge record, and what the processing step expects. */
export function isSupportedRecordingMime(mime: unknown): mime is string {
  return isAllowedVideoMime(mime) && mimeFamily(mime) === "webm";
}

/** What kind of video file this really is, from its first bytes (not from what the browser claims). */
export function sniffVideoContainer(b: Uint8Array): "webm" | "mp4" | null {
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm";
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "mp4"; // "ftyp"
  return null;
}

/* ---------- Answer timing ---------- */

/**
 * Checks where a student says an answer starts and ends in the recording. The times come from the browser,
 * so the server only accepts what could really have happened: inside the time that has passed, in order,
 * and long enough to be an answer.
 */
export function checkAnswerWindow(input: {
  startSec: unknown;
  endSec: unknown;
  elapsedSec: number; // server time since the attempt started
  previousEndSec: number; // end of the latest answered question, 0 if none
}): { ok: true; startSec: number; endSec: number } | { ok: false; message: string } {
  const { startSec, endSec, elapsedSec, previousEndSec } = input;
  if (typeof startSec !== "number" || typeof endSec !== "number" || !Number.isFinite(startSec) || !Number.isFinite(endSec)) {
    return { ok: false, message: "That answer could not be saved. Please try again." };
  }
  if (startSec < 0 || endSec <= startSec) return { ok: false, message: "That answer could not be saved. Please try again." };
  if (endSec - startSec < SERVER_MIN_ANSWER_SECONDS) return { ok: false, message: "That answer was too short. Hold the button while you speak." };
  if (endSec - startSec > VIDEO_MINUTES * 60) return { ok: false, message: "That answer could not be saved. Please try again." };
  if (endSec > elapsedSec + CLOCK_SLACK_SEC) return { ok: false, message: "That answer could not be saved. Please try again." };
  if (startSec < previousEndSec - 1) return { ok: false, message: "That answer could not be saved. Please try again." };
  return { ok: true, startSec: Math.round(startSec * 100) / 100, endSec: Math.round(endSec * 100) / 100 };
}

export function clock(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return "--:--";
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/* ---------- The AI's marking ---------- */

export interface Evaluation {
  technical: number;
  relevance: number;
  completeness: number;
  clarity: number;
  score: number;
  strengths: string[];
  improvements: string[];
  feedback: string;
}

function whole(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

function notes(v: unknown, max: number): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return list.map((x) => plainText(x, 3, 200)).filter(Boolean).slice(0, max);
}

/**
 * Checks the AI's marking of one answer. Every part must be a whole number inside its range; the total is
 * worked out here as the sum of the parts, so the total can never disagree with the parts.
 */
export function validateEvaluation(raw: unknown): { ok: true; value: Evaluation } | { ok: false; reason: string } {
  const o = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!o) return { ok: false, reason: "no object" };
  const technical = whole(o.technicalCorrectness ?? o.technical);
  const relevance = whole(o.relevance);
  const completeness = whole(o.completeness);
  const clarity = whole(o.clarity);
  if (technical === null || relevance === null || completeness === null || clarity === null) return { ok: false, reason: "a mark is missing" };
  if (technical < 0 || technical > RUBRIC.technical || relevance < 0 || relevance > RUBRIC.relevance || completeness < 0 || completeness > RUBRIC.completeness || clarity < 0 || clarity > RUBRIC.clarity) {
    return { ok: false, reason: "a mark is out of range" };
  }
  const feedback = plainText(o.feedback, 5, 500);
  if (!feedback) return { ok: false, reason: "no feedback" };
  return {
    ok: true,
    value: {
      technical,
      relevance,
      completeness,
      clarity,
      score: technical + relevance + completeness + clarity,
      strengths: notes(o.strengths, 3),
      improvements: notes(o.improvements, 3),
      feedback,
    },
  };
}

/** Fewer words than this cannot be marked fairly. The answer goes to the recruiter to check by hand. */
export const MIN_WORDS_TO_MARK = 4;
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/* ---------- What a page is told about an attempt ---------- */

export type VideoStage = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "TIMED_OUT" | "INTERRUPTED";

/** The student's view of an attempt. It carries no marks, no transcript and no feedback. */
export const STUDENT_DONE_STAGES: VideoStage[] = ["SUBMITTED", "TIMED_OUT", "INTERRUPTED"];

export const END_REASONS = ["ALL_DONE", "TIME_UP", "LEFT_PAGE", "DEVICE", "UPLOAD"] as const;
export type EndReason = (typeof END_REASONS)[number];

export const END_REASON_TEXT: Record<string, string> = {
  ALL_DONE: "The student answered or skipped all five questions.",
  TIME_UP: "The 15 minutes ended.",
  LEFT_PAGE: "The page was closed, refreshed or lost its connection before the end.",
  DEVICE: "The camera or microphone stopped working.",
  UPLOAD: "The recording could not be fully uploaded.",
};

export const STATUS_TEXT: Record<string, string> = {
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  TIMED_OUT: "Submitted at 15 minutes",
  INTERRUPTED: "Interrupted",
};
