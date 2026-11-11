/**
 * Who is at risk of finishing the placement season without a job? Plain rules, no AI.
 * The rules only FLAG a student; the placement cell chooses the mentor and decides what to do.
 * The reasons are written in plain words so the cell can see exactly why a student was flagged.
 */

import { checkEligibility } from "./rules";

export const RISK_RULES = {
  /** A drive must have been open this many days before "has not applied" counts, so a new season doesn't flag everyone. */
  noApplicationAfterDays: 7,
  /** Not selected this many times, with nothing still in progress. */
  rejectionsWithNothingActive: 2,
};

export interface RiskStudent {
  readinessLevel: string | null;
  placementStatus: string;
  cgpa: number;
  backlogs: number;
  branch: string;
  graduationYear: number;
  applicationStages: string[];
}

export interface OpenDrive {
  createdAt: Date;
  minCgpa: number | null;
  maxBacklogs: number | null;
  eligibleBranches: string[];
  eligibleGradYears: number[];
}

const PLACED_OR_HOLDING_OFFER = ["OFFER_RECEIVED", "OFFER_ACCEPTED", "JOINED"];
const FINISHED_STAGES = ["REJECTED", "WITHDRAWN", "OFFER_DECLINED"];

/** The plain-words reasons a student is flagged. An empty list means not at risk. */
export function riskReasons(s: RiskStudent, openDrives: OpenDrive[], now: Date): string[] {
  if (PLACED_OR_HOLDING_OFFER.includes(s.placementStatus)) return [];
  const reasons: string[] = [];

  if (s.readinessLevel === "NOT_READY") reasons.push('Readiness analysis says "Not ready"');

  const rejected = s.applicationStages.filter((st) => st === "REJECTED").length;
  const active = s.applicationStages.filter((st) => !FINISHED_STAGES.includes(st)).length;
  if (rejected >= RISK_RULES.rejectionsWithNothingActive && active === 0) {
    reasons.push(`Not selected in ${rejected} drives and has nothing in progress`);
  }

  if (s.applicationStages.length === 0) {
    const cutoff = now.getTime() - RISK_RULES.noApplicationAfterDays * 86_400_000;
    const waiting = openDrives.filter(
      (d) => d.createdAt.getTime() <= cutoff && checkEligibility(s, d).eligible
    ).length;
    if (waiting > 0) {
      reasons.push(`Has not applied to any of the ${waiting} open drive${waiting === 1 ? "" : "s"} they are eligible for`);
    }
  }
  return reasons;
}
