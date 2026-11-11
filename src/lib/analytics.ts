/**
 * Numbers for the placement cell's command dashboard. Plain counting and averaging on data that is
 * already in the database; no AI and no estimates. Each function takes plain values, so it can be
 * tested without a database (see scripts/selftest.ts).
 */

import { effectiveCtcLpa } from "./offerRules";

/** The offer reached the student (it may be open, accepted, declined or already joined). */
export const OFFERED_STAGES = ["OFFER_SENT", "OFFER_ACCEPTED", "OFFER_DECLINED", "JOINED"] as const;
export const ACCEPTED_STAGES = ["OFFER_ACCEPTED", "JOINED"] as const;
/** A person reviewed the candidate and moved them forward. */
export const ADVANCED_STAGE_LIST = ["SHORTLISTED", "INTERVIEW", "SELECTED", "OFFER_REQUESTED", "OFFER_SENT", "OFFER_ACCEPTED", "OFFER_DECLINED", "JOINED"] as const;

export interface AnalyticsApp {
  studentId: string;
  driveId: string;
  recruiterId: string;
  companyName: string;
  stage: string;
  offerType: string;
  offerCtcLpa: number | null;
  offerStipend: number | null;
  offerPackage: string | null;
  offerSentAt: Date | null;
  documentsVerified: boolean;
  documentsDueAt: Date | null;
  joiningDate: Date | null;
  deferralStatus: string | null;
  convertedFromInternship: boolean;
}

export interface AnalyticsStudent {
  id: string;
  branch: string;
  placementStatus: string;
}

export interface AnalyticsDrive {
  id: string;
  recruiterId: string;
  companyName: string;
  createdAt: Date;
}

const inList = (list: readonly string[], v: string) => list.includes(v);

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function mean(xs: number[]): number | null {
  return xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return round2(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/* ---------- Offers made / accepted / pending, and packages ---------- */

export interface OfferStats {
  made: number;
  accepted: number;
  declined: number;
  awaitingStudent: number;
  awaitingPlacementCell: number;
  acceptanceRate: number; // accepted as a percent of offers made
  byType: { INTERNSHIP: number; PPO: number; FULL_TIME: number };
  conversions: number; // internships converted to full-time
  /** Packages of accepted Full-time and PPO offers, in lakh per annum. */
  acceptedPackage: { n: number; average: number | null; median: number | null; highest: number | null; lowest: number | null };
  /** Packages of every Full-time and PPO offer that reached a student. */
  offeredPackage: { n: number; average: number | null; highest: number | null };
  internshipStipend: { n: number; average: number | null; highest: number | null };
  /** Full-time/PPO offers whose package could not be read as a number (so they are left out of the averages). */
  withoutNumber: number;
}

export function computeOfferStats(apps: AnalyticsApp[]): OfferStats {
  const offered = apps.filter((a) => inList(OFFERED_STAGES, a.stage));
  const accepted = offered.filter((a) => inList(ACCEPTED_STAGES, a.stage));
  const jobs = offered.filter((a) => a.offerType !== "INTERNSHIP");
  const acceptedJobs = accepted.filter((a) => a.offerType !== "INTERNSHIP");

  const ctcOf = (a: AnalyticsApp) => effectiveCtcLpa(a);
  const offeredCtc = jobs.map(ctcOf).filter((n): n is number => n != null);
  const acceptedCtc = acceptedJobs.map(ctcOf).filter((n): n is number => n != null);
  const stipends = offered.filter((a) => a.offerType === "INTERNSHIP" && a.offerStipend != null).map((a) => a.offerStipend as number);

  const count = (t: string) => offered.filter((a) => a.offerType === t).length;
  return {
    made: offered.length,
    accepted: accepted.length,
    declined: offered.filter((a) => a.stage === "OFFER_DECLINED").length,
    awaitingStudent: apps.filter((a) => a.stage === "OFFER_SENT").length,
    awaitingPlacementCell: apps.filter((a) => a.stage === "OFFER_REQUESTED").length,
    acceptanceRate: pct(accepted.length, offered.length),
    byType: { INTERNSHIP: count("INTERNSHIP"), PPO: count("PPO"), FULL_TIME: count("FULL_TIME") },
    conversions: apps.filter((a) => a.convertedFromInternship).length,
    acceptedPackage: {
      n: acceptedCtc.length,
      average: mean(acceptedCtc),
      median: median(acceptedCtc),
      highest: acceptedCtc.length ? Math.max(...acceptedCtc) : null,
      lowest: acceptedCtc.length ? Math.min(...acceptedCtc) : null,
    },
    offeredPackage: { n: offeredCtc.length, average: mean(offeredCtc), highest: offeredCtc.length ? Math.max(...offeredCtc) : null },
    internshipStipend: { n: stipends.length, average: stipends.length ? Math.round(stipends.reduce((a, b) => a + b, 0) / stipends.length) : null, highest: stipends.length ? Math.max(...stipends) : null },
    withoutNumber: jobs.filter((a) => ctcOf(a) == null).length,
  };
}

/* ---------- By recruiter: pipeline, package trends, repeat hiring ---------- */

export interface RecruiterRow {
  recruiterId: string;
  company: string;
  drives: number;
  firstDriveYear: number;
  lastDriveYear: number;
  applicants: number;
  advanced: number;
  offers: number;
  accepted: number;
  joined: number;
  averageCtc: number | null; // of the Full-time/PPO offers they made
  highestCtc: number | null;
  repeat: boolean; // ran more than one drive
}

export function computeRecruiterRows(apps: AnalyticsApp[], drives: AnalyticsDrive[]): RecruiterRow[] {
  const byRecruiter = new Map<string, { company: string; drives: AnalyticsDrive[] }>();
  for (const d of drives) {
    const row = byRecruiter.get(d.recruiterId) ?? { company: d.companyName, drives: [] };
    row.drives.push(d);
    byRecruiter.set(d.recruiterId, row);
  }
  const rows: RecruiterRow[] = [];
  for (const [recruiterId, info] of byRecruiter) {
    const mine = apps.filter((a) => a.recruiterId === recruiterId && a.stage !== "WITHDRAWN");
    const offers = mine.filter((a) => inList(OFFERED_STAGES, a.stage));
    const ctcs = offers.filter((a) => a.offerType !== "INTERNSHIP").map((a) => effectiveCtcLpa(a)).filter((n): n is number => n != null);
    const years = info.drives.map((d) => d.createdAt.getUTCFullYear());
    rows.push({
      recruiterId,
      company: info.company,
      drives: info.drives.length,
      firstDriveYear: Math.min(...years),
      lastDriveYear: Math.max(...years),
      applicants: mine.length,
      advanced: mine.filter((a) => inList(ADVANCED_STAGE_LIST, a.stage)).length,
      offers: offers.length,
      accepted: offers.filter((a) => inList(ACCEPTED_STAGES, a.stage)).length,
      joined: offers.filter((a) => a.stage === "JOINED").length,
      averageCtc: mean(ctcs),
      highestCtc: ctcs.length ? Math.max(...ctcs) : null,
      repeat: info.drives.length > 1,
    });
  }
  return rows.sort((a, b) => b.offers - a.offers || b.drives - a.drives || a.company.localeCompare(b.company));
}

/* ---------- Package trend by month ---------- */

export interface MonthRow {
  month: string; // yyyy-mm, in India time
  offers: number;
  averageCtc: number | null;
}

export function computeMonthlyTrend(apps: AnalyticsApp[], maxMonths = 12): MonthRow[] {
  const buckets = new Map<string, { offers: number; ctcs: number[] }>();
  for (const a of apps) {
    if (!a.offerSentAt || !inList(OFFERED_STAGES, a.stage)) continue;
    const month = new Date(a.offerSentAt.getTime() + 330 * 60_000).toISOString().slice(0, 7);
    const b = buckets.get(month) ?? { offers: 0, ctcs: [] };
    b.offers++;
    const ctc = a.offerType === "INTERNSHIP" ? null : effectiveCtcLpa(a);
    if (ctc != null) b.ctcs.push(ctc);
    buckets.set(month, b);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-maxMonths)
    .map(([month, b]) => ({ month, offers: b.offers, averageCtc: mean(b.ctcs) }));
}

/* ---------- Branch-wise conversion ---------- */

export interface BranchRow {
  branch: string;
  students: number;
  applied: number;
  advanced: number;
  offered: number;
  placed: number; // accepted or joined a Full-time or PPO offer
  appliedPct: number; // of students
  placedOfApplied: number; // conversion: percent of those who applied
  placedOfStudents: number;
}

export function computeBranchConversion(students: AnalyticsStudent[], apps: AnalyticsApp[]): BranchRow[] {
  const byStudent = new Map<string, AnalyticsApp[]>();
  for (const a of apps) {
    const list = byStudent.get(a.studentId) ?? [];
    list.push(a);
    byStudent.set(a.studentId, list);
  }
  const rows = new Map<string, BranchRow>();
  for (const s of students) {
    const r =
      rows.get(s.branch) ??
      ({ branch: s.branch, students: 0, applied: 0, advanced: 0, offered: 0, placed: 0, appliedPct: 0, placedOfApplied: 0, placedOfStudents: 0 } as BranchRow);
    r.students++;
    const mine = (byStudent.get(s.id) ?? []).filter((a) => a.stage !== "WITHDRAWN");
    if (mine.length) r.applied++;
    if (mine.some((a) => inList(ADVANCED_STAGE_LIST, a.stage))) r.advanced++;
    if (mine.some((a) => inList(OFFERED_STAGES, a.stage))) r.offered++;
    if (mine.some((a) => inList(ACCEPTED_STAGES, a.stage) && a.offerType !== "INTERNSHIP")) r.placed++;
    rows.set(s.branch, r);
  }
  return Array.from(rows.values())
    .map((r) => ({ ...r, appliedPct: pct(r.applied, r.students), placedOfApplied: pct(r.placed, r.applied), placedOfStudents: pct(r.placed, r.students) }))
    .sort((a, b) => b.students - a.students || a.branch.localeCompare(b.branch));
}

/* ---------- Documents and joining ---------- */

export interface DocJoinSummary {
  accepted: number; // offers accepted (waiting or joined)
  documentsVerified: number;
  documentsPending: number;
  documentsOverdue: number;
  joined: number;
  awaitingJoining: number; // documents verified, not joined yet
  joiningNext30Days: number;
  noJoiningDate: number; // accepted, not joined, and no joining date recorded
  deferralsPending: number;
  deferralsApproved: number;
  deferralsDeclined: number;
}

export function computeDocJoinSummary(apps: AnalyticsApp[], now: Date): DocJoinSummary {
  const accepted = apps.filter((a) => inList(ACCEPTED_STAGES, a.stage));
  const waiting = accepted.filter((a) => a.stage === "OFFER_ACCEPTED");
  const in30 = now.getTime() + 30 * 86_400_000;
  return {
    accepted: accepted.length,
    documentsVerified: accepted.filter((a) => a.documentsVerified).length,
    documentsPending: waiting.filter((a) => !a.documentsVerified).length,
    documentsOverdue: waiting.filter((a) => !a.documentsVerified && a.documentsDueAt != null && a.documentsDueAt.getTime() < now.getTime()).length,
    joined: accepted.filter((a) => a.stage === "JOINED").length,
    awaitingJoining: waiting.filter((a) => a.documentsVerified).length,
    joiningNext30Days: waiting.filter((a) => a.joiningDate != null && a.joiningDate.getTime() >= now.getTime() - 86_400_000 && a.joiningDate.getTime() <= in30).length,
    noJoiningDate: waiting.filter((a) => a.joiningDate == null).length,
    deferralsPending: apps.filter((a) => a.deferralStatus === "PENDING").length,
    deferralsApproved: apps.filter((a) => a.deferralStatus === "APPROVED").length,
    deferralsDeclined: apps.filter((a) => a.deferralStatus === "DECLINED").length,
  };
}
