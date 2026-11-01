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

/**
 * Plain-language "what would change this" for each failed eligibility check. Deterministic — no AI.
 * Honest about what a student can and can't change.
 */
export function eligibilityFixes(student: EligibilityInput, rule: EligibilityRule): { problem: string; fix: string }[] {
  const out: { problem: string; fix: string }[] = [];
  if (rule.minCgpa !== null && student.cgpa < rule.minCgpa) {
    const gap = (rule.minCgpa - student.cgpa).toFixed(2);
    out.push({
      problem: `CGPA ${student.cgpa} is ${gap} below the ${rule.minCgpa} this drive asks for`,
      fix: "CGPA can't be changed before the drive. If you have a strong profile, ask your placement cell about a Special Consideration recommendation.",
    });
  }
  if (rule.maxBacklogs !== null && student.backlogs > rule.maxBacklogs) {
    const n = student.backlogs - rule.maxBacklogs;
    out.push({
      problem: `${student.backlogs} backlog(s), but at most ${rule.maxBacklogs} allowed`,
      fix: `Clearing ${n} backlog${n === 1 ? "" : "s"} would make you eligible for drives like this next time.`,
    });
  }
  if (rule.eligibleBranches.length > 0 && !rule.eligibleBranches.map((b) => b.toUpperCase()).includes(student.branch.toUpperCase())) {
    out.push({
      problem: `This drive is open to ${rule.eligibleBranches.join(", ")}; you are in ${student.branch}`,
      fix: "Specialization is fixed by your record. If you think the recruiter would still want you, ask your placement cell to raise it.",
    });
  }
  if (rule.eligibleGradYears.length > 0 && !rule.eligibleGradYears.includes(student.graduationYear)) {
    out.push({
      problem: `This drive is for the ${rule.eligibleGradYears.join(", ")} batch; yours is ${student.graduationYear}`,
      fix: "Keep an eye out — drives for your batch will appear here.",
    });
  }
  return out;
}

/**
 * Which skills the student is missing most often across the drives they could actually apply to?
 * Counts how many of those drives list each skill (case-insensitive) that the student doesn't have.
 */
export function rankSkillGaps(
  studentSkills: string[],
  drives: { jobRole: string; requiredSkills: string[] }[]
): { skill: string; drives: number; roles: string[] }[] {
  const have = new Set(studentSkills.map((s) => s.trim().toLowerCase()));
  const map = new Map<string, { skill: string; roles: Set<string> }>();
  for (const d of drives) {
    for (const raw of d.requiredSkills) {
      const key = raw.trim().toLowerCase();
      if (!key || have.has(key)) continue;
      const entry = map.get(key) ?? { skill: raw.trim(), roles: new Set<string>() };
      entry.roles.add(d.jobRole);
      map.set(key, entry);
    }
  }
  return Array.from(map.values())
    .map((e) => ({ skill: e.skill, drives: e.roles.size, roles: Array.from(e.roles) }))
    .sort((a, b) => b.drives - a.drives || a.skill.localeCompare(b.skill));
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

/* ---------- Interview auto-allocation ---------- */

export interface AllocationCandidate {
  applicationId: string;
  studentId: string;
}
export interface AllocationPanel {
  name: string;
  venue: string | null;
}
export interface AllocationConfig {
  start: Date;
  end: Date;
  durationMins: number;
  gapMins: number;
  breakStart?: Date | null;
  breakEnd?: Date | null;
  panels: AllocationPanel[];
}
export interface AllocatedSlot {
  applicationId: string;
  studentId: string;
  panel: string;
  venue: string | null;
  scheduledAt: Date;
  durationMins: number;
}
export interface AllocationResult {
  slots: AllocatedSlot[];
  unscheduled: { applicationId: string; reason: string }[];
}

/**
 * Deterministic, rules-only timetable builder (no AI): walks the day in fixed steps and gives each
 * candidate the earliest (time, panel) where the same conflict rules used for manual scheduling
 * pass — student not double-booked (including against interviews on OTHER drives), panel free, venue
 * free — skipping the optional break. Candidates are taken in the order given; the caller sorts them
 * neutrally (roll number) so no one gets the best slots because of a score.
 */
export function autoAllocate(
  candidates: AllocationCandidate[],
  existing: ScheduledSlot[],
  cfg: AllocationConfig
): AllocationResult {
  const durMs = cfg.durationMins * 60_000;
  const stepMs = (cfg.durationMins + cfg.gapMins) * 60_000;

  const times: Date[] = [];
  for (let t = cfg.start.getTime(); t + durMs <= cfg.end.getTime(); t += stepMs) {
    const at = new Date(t);
    if (cfg.breakStart && cfg.breakEnd && overlaps(at, cfg.durationMins, cfg.breakStart, (cfg.breakEnd.getTime() - cfg.breakStart.getTime()) / 60_000)) {
      continue;
    }
    times.push(at);
  }

  const placed: ScheduledSlot[] = [...existing];
  const slots: AllocatedSlot[] = [];
  const unscheduled: AllocationResult["unscheduled"] = [];

  for (const cand of candidates) {
    let done = false;
    outer: for (const at of times) {
      for (const panel of cfg.panels) {
        const check = checkSchedulingConflicts(
          { studentId: cand.studentId, venue: panel.venue, panel: panel.name, scheduledAt: at, durationMins: cfg.durationMins },
          placed
        );
        if (!check.hasConflict) {
          placed.push({ id: `new-${cand.applicationId}`, studentId: cand.studentId, venue: panel.venue, panel: panel.name, scheduledAt: at, durationMins: cfg.durationMins });
          slots.push({ applicationId: cand.applicationId, studentId: cand.studentId, panel: panel.name, venue: panel.venue, scheduledAt: at, durationMins: cfg.durationMins });
          done = true;
          break outer;
        }
      }
    }
    if (!done) {
      unscheduled.push({
        applicationId: cand.applicationId,
        reason: "No free slot left in this window — add a panel, extend the end time, or pick another day.",
      });
    }
  }
  return { slots, unscheduled };
}

/* ---------- Placement journey stage ordering (for progress display) ---------- */

export const APPLICATION_STAGES = [
  "ELIGIBLE",
  "SHORTLISTED",
  "INTERVIEW",
  "SELECTED",
  "OFFER_REQUESTED",
  "OFFER_SENT",
  "OFFER_ACCEPTED",
  "JOINED",
] as const;

/** Terminal "branch" stages that fall off the forward stepper entirely. */
export const TERMINAL_STAGES = ["REJECTED", "OFFER_DECLINED"] as const;

export function stageIndex(stage: string): number {
  return APPLICATION_STAGES.indexOf(stage as (typeof APPLICATION_STAGES)[number]);
}
