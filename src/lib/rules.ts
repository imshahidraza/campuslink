/**
 * Deterministic business rules — the "RULES" half of CampusLink's hybrid
 * AI + rule-based design. Nothing here calls the model. Anything that
 * must be exact (CGPA, branch, backlogs, graduation year, scheduling
 * conflicts, offer/document status) lives here.
 */

export interface EligibilityInput {
  cgpa: number;
  backlogs: number;
  branch: string;
  graduationYear: number;
}

export interface EligibilityRule {
  minCgpa: number | null;
  maxBacklogs: number | null;
  eligibleBranches: string[]; // empty array = all specializations eligible
  eligibleGradYears: number[]; // empty array = all years eligible
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[]; // failed checks, empty if eligible
}

export function checkEligibility(
  student: EligibilityInput,
  rule: EligibilityRule
): EligibilityResult {
  const reasons: string[] = [];

  if (rule.minCgpa !== null && student.cgpa < rule.minCgpa) {
    reasons.push(`CGPA ${student.cgpa} is below required minimum ${rule.minCgpa}`);
  }
  if (rule.maxBacklogs !== null && student.backlogs > rule.maxBacklogs) {
    reasons.push(`${student.backlogs} backlog(s) exceed allowed maximum of ${rule.maxBacklogs}`);
  }
  if (rule.eligibleBranches.length > 0 && !rule.eligibleBranches.map((b) => b.toUpperCase()).includes(student.branch.toUpperCase())) {
    reasons.push(`Specialization "${student.branch}" is not in eligible specializations (${rule.eligibleBranches.join(", ")})`);
  }
  if (rule.eligibleGradYears.length > 0 && !rule.eligibleGradYears.includes(student.graduationYear)) {
    reasons.push(
      `Graduation year ${student.graduationYear} is not in eligible years (${rule.eligibleGradYears.join(", ")})`
    );
  }

  return { eligible: reasons.length === 0, reasons };
}

/* ---------- Conflict-aware scheduling ---------- */

export interface ScheduledSlot {
  id: string;
  studentId: string;
  venue: string | null;
  panel: string | null;
  scheduledAt: Date;
  durationMins: number;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  notes: string[];
}

function overlaps(aStart: Date, aMins: number, bStart: Date, bMins: number): boolean {
  const aEnd = aStart.getTime() + aMins * 60_000;
  const bEnd = bStart.getTime() + bMins * 60_000;
  return aStart.getTime() < bEnd && bStart.getTime() < aEnd;
}

/**
 * Checks a candidate new slot against a list of already-scheduled slots and
 * flags: the same student double-booked, the same venue double-booked, or
 * the same interview panel double-booked.
 */
export function checkSchedulingConflicts(
  candidate: Omit<ScheduledSlot, "id">,
  existing: ScheduledSlot[]
): ConflictCheckResult {
  const notes: string[] = [];

  for (const slot of existing) {
    if (!overlaps(candidate.scheduledAt, candidate.durationMins, slot.scheduledAt, slot.durationMins)) {
      continue;
    }
    if (slot.studentId === candidate.studentId) {
      notes.push(`Student already has an overlapping interview at ${slot.scheduledAt.toLocaleString()}`);
    }
    if (candidate.venue && slot.venue && candidate.venue === slot.venue) {
      notes.push(`Venue "${candidate.venue}" is already booked at that time`);
    }
    if (candidate.panel && slot.panel && candidate.panel === slot.panel) {
      notes.push(`Panel "${candidate.panel}" is already booked at that time`);
    }
  }

  return { hasConflict: notes.length > 0, notes };
}

/* ---------- Placement journey stage ordering (for progress display) ---------- */

export const APPLICATION_STAGES = [
  "ELIGIBLE",
  "SHORTLISTED",
  "INTERVIEW",
  "SELECTED",
  "OFFER",
] as const;

export function stageIndex(stage: string): number {
  return APPLICATION_STAGES.indexOf(stage as (typeof APPLICATION_STAGES)[number]);
}
