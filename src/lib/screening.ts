/**
 * The text screening interview of a drive: the questions, and the checks that decide whether a question is good
 * enough to keep. No database code here, so screens can use it too.
 *
 * The AI only DRAFTS the questions. Every question is checked here (four different options, one right answer,
 * no links or markup, sensible length) and the recruiter reads and approves the set before any student sees it.
 */

export const MIN_MCQ = 4; // a draft needs at least this many good multiple-choice questions
export const MAX_MCQ = 5;
export const MAX_SHORT = 2;
export const OPTIONS_PER_MCQ = 4;
export const DEFAULT_SCREENING_MINUTES = 20;

export type QuestionKindName = "MCQ" | "SHORT";

export interface DraftQuestion {
  kind: QuestionKindName;
  prompt: string;
  options: string[]; // four for MCQ, empty for SHORT
  correctIndex: number | null; // 0-3 for MCQ, null for SHORT
  lookFor: string | null; // SHORT only: what a good answer covers (used for AI feedback, never for marks)
}

export interface StoredQuestion extends DraftQuestion {
  id: string;
  position: number;
}

/** Plain text only: no control characters, no markup, no links. Returns "" if the text is unusable. */
function plain(v: unknown, min: number, max: number): string {
  if (typeof v !== "string" && typeof v !== "number") return "";
  const t = String(v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (/https?:\/\/|www\.|<[^>]*>|`/i.test(t)) return "";
  if (t.length < min || t.length > max) return "";
  return t;
}

function indexFrom(v: unknown, options: string[]): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v >= 0 && v < options.length ? v : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (/^[0-3]$/.test(s)) return Number(s);
    if (/^[a-d]$/i.test(s)) return s.toUpperCase().charCodeAt(0) - 65;
    const byText = options.findIndex((o) => o.toLowerCase() === s.toLowerCase());
    if (byText >= 0) return byText;
  }
  return null;
}

/**
 * Shuffles the options and moves the right-answer marker with them. Small models love to put the right answer
 * first, so this is done on the server before anything is saved.
 */
export function shuffleOptions(options: string[], correctIndex: number, rand: () => number = Math.random) {
  const order = options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { options: order.map((i) => options[i]), correctIndex: order.indexOf(correctIndex) };
}

/**
 * Turns whatever the model returned into a clean list of questions. Anything that doesn't pass is dropped,
 * never repaired by guessing.
 */
export function cleanDraft(raw: unknown, rand: () => number = Math.random): DraftQuestion[] {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const out: DraftQuestion[] = [];

  for (const item of Array.isArray(obj.mcq) ? obj.mcq : []) {
    if (out.filter((q) => q.kind === "MCQ").length >= MAX_MCQ) break;
    if (typeof item !== "object" || item === null) continue;
    const it = item as Record<string, unknown>;
    const prompt = plain(it.question, 10, 300);
    const options = (Array.isArray(it.options) ? it.options : []).map((o) => plain(o, 1, 150));
    if (!prompt || options.length !== OPTIONS_PER_MCQ || options.some((o) => !o)) continue;
    if (new Set(options.map((o) => o.toLowerCase())).size !== OPTIONS_PER_MCQ) continue;
    if (options.some((o) => /^(all|none) of the above$/i.test(o))) continue;
    const correct = indexFrom(it.correctIndex ?? it.answer, options);
    if (correct === null) continue;
    const key = prompt.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const shuffled = shuffleOptions(options, correct, rand);
    out.push({ kind: "MCQ", prompt, options: shuffled.options, correctIndex: shuffled.correctIndex, lookFor: null });
  }

  for (const item of Array.isArray(obj.short) ? obj.short : []) {
    if (out.filter((q) => q.kind === "SHORT").length >= MAX_SHORT) break;
    if (typeof item !== "object" || item === null) continue;
    const it = item as Record<string, unknown>;
    const prompt = plain(it.question, 10, 300);
    if (!prompt) continue;
    const key = prompt.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: "SHORT", prompt, options: [], correctIndex: null, lookFor: plain(it.lookFor, 10, 300) || null });
  }

  return out;
}

/** Can this set of questions be published? Checked again on the server at publish time. */
export function checkPublishable(questions: DraftQuestion[]): { ok: boolean; message: string } {
  const mcq = questions.filter((q) => q.kind === "MCQ");
  if (mcq.length < MIN_MCQ) return { ok: false, message: `At least ${MIN_MCQ} multiple-choice questions are needed.` };
  for (const q of mcq) {
    const distinct = new Set(q.options.map((o) => o.trim().toLowerCase()));
    if (
      q.options.length !== OPTIONS_PER_MCQ ||
      distinct.size !== OPTIONS_PER_MCQ ||
      q.correctIndex === null ||
      q.correctIndex < 0 ||
      q.correctIndex >= OPTIONS_PER_MCQ
    ) {
      return { ok: false, message: "A multiple-choice question has a problem. Please draft the questions again." };
    }
  }
  return { ok: true, message: "" };
}

/* ---------- Settings and editing (recruiter) ---------- */

export const MIN_MINUTES = 5;
export const MAX_MINUTES = 60;
export const SHORT_ANSWER_MAX = 1500;

/** Checks a recruiter's edit of one question. Same rules as the AI's draft. Returns the clean question or a message. */
export function cleanQuestionEdit(
  kind: QuestionKindName,
  input: { prompt?: unknown; options?: unknown; correctIndex?: unknown; lookFor?: unknown }
): { ok: true; question: DraftQuestion } | { ok: false; message: string } {
  const prompt = plain(input.prompt, 10, 300);
  if (!prompt) return { ok: false, message: "The question must be 10 to 300 characters, with no links or markup." };
  if (kind === "SHORT") {
    const raw = typeof input.lookFor === "string" ? input.lookFor.trim() : "";
    const lookFor = raw ? plain(raw, 10, 300) : "";
    if (raw && !lookFor) return { ok: false, message: "'A good answer covers' must be 10 to 300 characters, with no links or markup." };
    return { ok: true, question: { kind, prompt, options: [], correctIndex: null, lookFor: lookFor || null } };
  }
  const opts = Array.isArray(input.options) ? input.options : [];
  const options = opts.map((o) => plain(o, 1, 150));
  if (options.length !== OPTIONS_PER_MCQ || options.some((o) => !o)) {
    return { ok: false, message: "Each multiple-choice question needs exactly 4 options of 1 to 150 characters, with no links or markup." };
  }
  if (new Set(options.map((o) => o.toLowerCase())).size !== OPTIONS_PER_MCQ) {
    return { ok: false, message: "The four options must all be different." };
  }
  if (options.some((o) => /^(all|none) of the above$/i.test(o))) {
    return { ok: false, message: "Please don't use 'all of the above' or 'none of the above'." };
  }
  const ci = input.correctIndex;
  if (typeof ci !== "number" || !Number.isInteger(ci) || ci < 0 || ci >= OPTIONS_PER_MCQ) {
    return { ok: false, message: "Mark which option is the correct answer." };
  }
  return { ok: true, question: { kind, prompt, options, correctIndex: ci, lookFor: null } };
}

/* ---------- The student's side: order, answers, score ---------- */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The same seed always gives the same order, so a page reload shows the student the same screen. */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** What a student is shown: no right answers. `i` is the option's stored index, which is what the student sends back. */
export interface PresentedQuestion {
  id: string;
  kind: QuestionKindName;
  prompt: string;
  options: { i: number; text: string }[];
}

/** Multiple-choice questions first, then written ones. Question order and option order are shuffled per student. */
export function presentQuestions(
  questions: { id: string; kind: QuestionKindName; prompt: string; options: string[] }[],
  seed: number
): PresentedQuestion[] {
  const mcq = seededShuffle(questions.filter((q) => q.kind === "MCQ"), seed);
  const short = seededShuffle(questions.filter((q) => q.kind === "SHORT"), seed + 1);
  return [...mcq, ...short].map((q) => ({
    id: q.id,
    kind: q.kind,
    prompt: q.prompt,
    options:
      q.kind === "MCQ"
        ? seededShuffle(q.options.map((text, i) => ({ i, text })), seed ^ hashString(q.id))
        : [],
  }));
}

export type Answers = Record<string, number | string>;

/** Keeps only answers to real questions, in the right shape and size. Anything else is dropped. */
export function cleanAnswers(raw: unknown, questions: { id: string; kind: QuestionKindName; options: string[] }[]): Answers {
  const src = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Answers = {};
  for (const q of questions) {
    const v = Object.prototype.hasOwnProperty.call(src, q.id) ? src[q.id] : undefined;
    if (q.kind === "MCQ") {
      if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < q.options.length) out[q.id] = v;
    } else if (typeof v === "string") {
      const t = v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, "").trim().slice(0, SHORT_ANSWER_MAX);
      if (t) out[q.id] = t;
    }
  }
  return out;
}

/** The multiple-choice score, counted by code: one mark for each right answer. Blank counts as wrong. */
export function scoreMcq(
  questions: { id: string; kind: QuestionKindName; correctIndex: number | null }[],
  answers: Answers
): { correct: number; total: number } {
  const mcq = questions.filter((q) => q.kind === "MCQ");
  const correct = mcq.filter((q) => q.correctIndex !== null && answers[q.id] === q.correctIndex).length;
  return { correct, total: mcq.length };
}

/** Where a student's attempt stands, from the recruiter's and the student's point of view. */
export type AttemptState = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED";
export const plainText = plain;
