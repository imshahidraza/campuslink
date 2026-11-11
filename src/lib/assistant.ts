/**
 * The eligibility assistant, rule half. Everything that matters in an answer (is the student eligible, why not,
 * what the drive asks for, the last date) is worked out here from the exact rules and the student's own record.
 * The local AI is used only afterwards, to put the facts into friendly words, and its wording is rejected
 * if it brings in any number or verdict that the facts do not contain.
 */

import { checkEligibility, eligibilityFixes } from "./rules";
import { fmtDate } from "./format";

export interface AssistantDrive {
  id: string;
  companyName: string;
  jobRole: string;
  status: string;
  minCgpa: number | null;
  maxBacklogs: number | null;
  eligibleBranches: string[];
  eligibleGradYears: number[];
  applyDeadline: Date | null;
}

export interface AssistantStudent {
  cgpa: number;
  backlogs: number;
  branch: string;
  graduationYear: number;
  placementStatus: string;
}

export interface DriveFacts {
  driveId: string;
  company: string;
  role: string;
  open: boolean;
  eligible: boolean;
  specialConsideration: boolean;
  reasons: string[];
  fixes: { problem: string; fix: string }[];
  requirements: string[];
  deadline: string | null; // "20 Nov 2026"
  daysLeft: number | null;
  deadlinePassed: boolean;
  applicationStage: string | null;
  canApply: boolean;
  applyBlockedBecause: string | null;
}

export type Intent = "LIST" | "WHY_NOT" | "DEADLINE" | "REQUIREMENTS" | "VERDICT";

/* ---------- Understanding the question (keywords only, no AI) ---------- */

const GENERIC_WORDS = new Set([
  "ltd", "limited", "pvt", "private", "technologies", "technology", "solutions", "services", "systems", "inc", "corp",
  "corporation", "india", "the", "and", "company", "co", "software", "group", "labs", "global",
]);

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function companyTokens(name: string): string[] {
  return norm(name)
    .split(" ")
    .filter((t) => t.length >= 2 && !GENERIC_WORDS.has(t));
}

/** Drives the question talks about, by company name (and role, to narrow down when one company has several drives). */
export function findDrivesMentioned(question: string, drives: AssistantDrive[]): AssistantDrive[] {
  const q = ` ${norm(question)} `;
  const qWords = new Set(q.trim().split(" "));
  const byCompany = drives.filter((d) => {
    const full = norm(d.companyName);
    if (full && q.includes(` ${full} `)) return true;
    // Initials also count: "TCS" for Tata Consultancy Services.
    const initials = full.split(" ").map((w) => w[0]).join("");
    if (initials.length >= 3 && qWords.has(initials)) return true;
    const tokens = companyTokens(d.companyName);
    return tokens.length > 0 && tokens.every((t) => qWords.has(t));
  });
  if (byCompany.length <= 1) return byCompany;
  const byRole = byCompany.filter((d) => {
    const role = norm(d.jobRole);
    return role && q.includes(` ${role} `);
  });
  return byRole.length > 0 ? byRole : byCompany;
}

export function detectIntent(question: string, mentioned: number): Intent {
  const q = norm(question);
  const has = (...words: string[]) => words.some((w) => q.includes(w));
  if (mentioned === 0) return "LIST";
  if (has("why") && has("not", "cant", "cannot", "ineligible", "can t")) return "WHY_NOT";
  if (has("deadline", "last date", "apply by", "due", "when")) return "DEADLINE";
  if (has("requirement", "criteria", "rules", "minimum", "need", "what does", "cutoff")) return "REQUIREMENTS";
  return "VERDICT";
}

/* ---------- The facts ---------- */

export function describeRequirements(d: Pick<AssistantDrive, "minCgpa" | "maxBacklogs" | "eligibleBranches" | "eligibleGradYears">): string[] {
  const out: string[] = [];
  if (d.minCgpa !== null) out.push(`Minimum CGPA ${d.minCgpa}`);
  if (d.maxBacklogs !== null) out.push(d.maxBacklogs === 0 ? "No backlogs allowed" : `At most ${d.maxBacklogs} backlog${d.maxBacklogs === 1 ? "" : "s"}`);
  const branches = d.eligibleBranches.filter((b) => b.trim().toLowerCase() !== "all");
  if (branches.length > 0) out.push(`Specializations: ${branches.join(", ")}`);
  if (d.eligibleGradYears.length > 0) out.push(`Graduation year: ${d.eligibleGradYears.join(", ")}`);
  if (out.length === 0) out.push("Open to every specialization, with no CGPA or backlog limit");
  return out;
}

export function buildFacts(
  drive: AssistantDrive,
  student: AssistantStudent,
  application: { stage: string; specialConsideration: boolean } | null,
  now: Date
): DriveFacts {
  const rule = {
    minCgpa: drive.minCgpa,
    maxBacklogs: drive.maxBacklogs,
    eligibleBranches: drive.eligibleBranches,
    eligibleGradYears: drive.eligibleGradYears,
  };
  const check = checkEligibility(student, rule);
  const special = Boolean(application?.specialConsideration);
  const open = drive.status === "OPEN";
  const deadlinePassed = drive.applyDeadline ? drive.applyDeadline.getTime() < now.getTime() : false;
  const daysLeft = drive.applyDeadline && !deadlinePassed ? Math.ceil((drive.applyDeadline.getTime() - now.getTime()) / 86_400_000) : null;
  const applied = application !== null && application.stage !== "WITHDRAWN";

  let blocked: string | null = null;
  if (student.placementStatus === "JOINED") blocked = "you have already joined a company";
  else if (applied) blocked = "you have already applied to this drive";
  else if (!open) blocked = "this drive is not open for applications right now";
  else if (deadlinePassed) blocked = "the last date to apply has passed";
  else if (!check.eligible && !special) blocked = "you do not meet the eligibility rules";

  return {
    driveId: drive.id,
    company: drive.companyName,
    role: drive.jobRole,
    open,
    eligible: check.eligible || special,
    specialConsideration: special,
    reasons: check.eligible ? [] : check.reasons,
    fixes: check.eligible ? [] : eligibilityFixes(student, rule),
    requirements: describeRequirements(drive),
    deadline: drive.applyDeadline ? fmtDate(drive.applyDeadline) : null,
    daysLeft,
    deadlinePassed,
    applicationStage: application?.stage ?? null,
    canApply: blocked === null,
    applyBlockedBecause: blocked,
  };
}

/* ---------- The exact answer (always shown) ---------- */

export function verdictLine(f: DriveFacts): string {
  const name = `${f.role} at ${f.company}`;
  if (f.specialConsideration && !f.reasons.length) return `You are eligible for ${name}.`;
  if (f.specialConsideration) return `The placement cell recommended you for ${name}, so you can apply even though you do not meet every rule.`;
  return f.eligible ? `You are eligible for ${name}.` : `You are not eligible for ${name}.`;
}

export function summarize(intent: Intent, facts: DriveFacts[]): string {
  if (facts.length === 0) return "There are no open drives right now. Please check back soon.";
  if (intent === "LIST") {
    const yes = facts.filter((f) => f.eligible);
    if (yes.length === 0) return `There ${facts.length === 1 ? "is 1 open drive" : `are ${facts.length} open drives`}, and you are not eligible for ${facts.length === 1 ? "it" : "any of them"} yet.`;
    return `There ${facts.length === 1 ? "is 1 open drive" : `are ${facts.length} open drives`}. You are eligible for ${yes.length}: ${yes.map((f) => `${f.role} at ${f.company}`).join("; ")}.`;
  }
  return facts
    .map((f) => {
      const parts = [verdictLine(f)];
      if (intent === "WHY_NOT" || intent === "VERDICT") {
        if (f.reasons.length) parts.push(`Reason${f.reasons.length === 1 ? "" : "s"}: ${f.reasons.join("; ")}.`);
      }
      if (intent === "REQUIREMENTS") parts.push(`The drive asks for: ${f.requirements.join("; ")}.`);
      if (intent === "DEADLINE" || intent === "VERDICT") {
        if (f.deadline) parts.push(f.deadlinePassed ? `The last date to apply was ${f.deadline}.` : `The last date to apply is ${f.deadline}${f.daysLeft !== null ? ` (${f.daysLeft} day${f.daysLeft === 1 ? "" : "s"} left)` : ""}.`);
        else if (intent === "DEADLINE") parts.push("No last date has been set for this drive.");
      }
      if (f.applyBlockedBecause && f.eligible) parts.push(`You can't apply right now because ${f.applyBlockedBecause}.`);
      else if (f.canApply) parts.push("You can apply from the Drives & Matching page.");
      return parts.join(" ");
    })
    .join("\n");
}

/* ---------- Putting the facts into words for the AI, and checking what it writes back ---------- */

/** The facts as plain lines for the model. Only these lines may be used in its answer. */
export function factsForModel(intent: Intent, facts: DriveFacts[]): string {
  const lines = facts.slice(0, 8).map((f) => {
    const bits = [
      `Drive: ${f.role} at ${f.company}`,
      f.eligible ? "Verdict: the student IS eligible" : "Verdict: the student is NOT eligible",
    ];
    if (f.reasons.length) bits.push(`Reasons: ${f.reasons.join("; ")}`);
    bits.push(`Requirements: ${f.requirements.join("; ")}`);
    if (f.deadline) bits.push(f.deadlinePassed ? `Last date to apply was ${f.deadline}` : `Last date to apply: ${f.deadline}`);
    if (f.applyBlockedBecause) bits.push(`Cannot apply because ${f.applyBlockedBecause}`);
    return bits.join(". ");
  });
  return `${summarize(intent, facts)}\n\n${lines.join("\n")}`;
}

function numbersIn(text: string): Set<string> {
  return new Set((text.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(parseFloat(n))));
}

const SAYS_ELIGIBLE = /\byou(?:'re| are)\s+(?:fully\s+|also\s+)?eligible\b|\byou\s+(?:can|may)\s+apply\b|\byou\s+qualify\b/i;
const SAYS_NOT_ELIGIBLE = /\bnot\s+eligible\b|\bineligible\b|\bdo(?:\s+not|n't)\s+(?:meet|qualify)\b|\bcan(?:not|'t)\s+apply\b/i;

/**
 * True only when the AI's wording stays inside the facts: no number that the facts lack, no verdict that
 * contradicts them, no links or markup, and a sensible length. Otherwise the exact answer is shown alone.
 */
export function isFaithful(aiText: string, factsText: string, facts: DriveFacts[]): boolean {
  const t = aiText.trim();
  if (t.length < 10 || t.length > 700) return false;
  if (/https?:\/\/|www\.|[<>`]|\[[^\]]*\]\(/.test(t)) return false;
  const allowed = numbersIn(factsText);
  for (const n of numbersIn(t)) if (!allowed.has(n)) return false;
  if (facts.length > 0 && facts.every((f) => !f.eligible) && SAYS_ELIGIBLE.test(t) && !SAYS_NOT_ELIGIBLE.test(t)) return false;
  if (facts.length > 0 && facts.every((f) => f.eligible) && SAYS_NOT_ELIGIBLE.test(t)) return false;
  return true;
}
