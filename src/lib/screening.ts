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
