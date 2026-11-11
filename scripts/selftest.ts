/**
 * Checks the exact rules added in the jury-features build, with no database and no AI.
 * Run:  npm run selftest
 * Everything here is deterministic, so a failure always means a real change in behaviour.
 */
import assert from "node:assert/strict";
import { parseOfferTerms, formatPackage, legacyLpa, effectiveCtcLpa, checkDeferralRequest, parseYmd, todayYmd, offerSummaryParts, packageText } from "../src/lib/offerRules";
import { documentReminderDue, offerFollowUpDue, addDays } from "../src/lib/automationRules";
import { riskReasons } from "../src/lib/risk";
import {
  computeOfferStats, computeRecruiterRows, computeBranchConversion, computeDocJoinSummary, computeMonthlyTrend, type AnalyticsApp,
} from "../src/lib/analytics";
import { findDrivesMentioned, detectIntent, buildFacts, summarize, isFaithful, factsForModel, type AssistantDrive } from "../src/lib/assistant";
import { mean, stdev, median, percentile, pearson, skillOverlapPercent } from "./evaluate-fit";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
const throwsMsg = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e: Error) => re.test(e.message));

const NOW = new Date("2026-11-12T06:00:00Z"); // 11:30 am in India
const TODAY = "2026-11-12";

console.log("\nOffer details");
test("full-time offer stores CTC as a number", () => {
  const t = parseOfferTerms({ offerType: "FULL_TIME", ctc: "12.5" }, { now: NOW });
  assert.equal(t.offerCtcLpa, 12.5);
  assert.equal(t.offerStipend, null);
  assert.equal(formatPackage(t), "12.5 LPA");
});
test("internship needs a stipend, zero means unpaid", () => {
  assert.equal(formatPackage(parseOfferTerms({ offerType: "INTERNSHIP", stipend: "25000" }, { now: NOW })), "₹25,000 per month");
  assert.equal(formatPackage(parseOfferTerms({ offerType: "INTERNSHIP", stipend: "0" }, { now: NOW })), "Unpaid internship");
  throwsMsg(() => parseOfferTerms({ offerType: "INTERNSHIP", stipend: "" }, { now: NOW }), /stipend/i);
});
test("bad CTC values are refused", () => {
  for (const bad of ["", "abc", "-3", "0", "201", "1e3", "12 lpa"]) {
    assert.throws(() => parseOfferTerms({ offerType: "FULL_TIME", ctc: bad }, { now: NOW }), `should refuse "${bad}"`);
  }
});
test("unknown offer type is refused (cannot be forged from the form)", () => {
  assert.throws(() => parseOfferTerms({ offerType: "CONTRACT", ctc: "10" }, { now: NOW }));
  assert.throws(() => parseOfferTerms({ ctc: "10" }, { now: NOW }));
});
test("forced type ignores what the form says", () => {
  assert.equal(parseOfferTerms({ offerType: "INTERNSHIP", ctc: "9" }, { forceType: "FULL_TIME", now: NOW }).offerType, "FULL_TIME");
});
test("bond: empty or 0 means none; too long is refused; note only kept with a bond", () => {
  assert.equal(parseOfferTerms({ offerType: "PPO", ctc: "8", bondMonths: "" }, { now: NOW }).bondMonths, null);
  const none = parseOfferTerms({ offerType: "PPO", ctc: "8", bondMonths: "0", bondNote: "ignored" }, { now: NOW });
  assert.equal(none.bondMonths, null);
  assert.equal(none.bondNote, null);
  const b = parseOfferTerms({ offerType: "PPO", ctc: "8", bondMonths: "12", bondNote: "  ₹1,00,000   if you leave " }, { now: NOW });
  assert.equal(b.bondMonths, 12);
  assert.equal(b.bondNote, "₹1,00,000 if you leave");
  throwsMsg(() => parseOfferTerms({ offerType: "PPO", ctc: "8", bondMonths: "61" }, { now: NOW }), /60 months/);
  throwsMsg(() => parseOfferTerms({ offerType: "PPO", ctc: "8", bondMonths: "1.5" }, { now: NOW }), /whole number/);
});
test("joining date must be a real day, not in the past, not more than 3 years away", () => {
  assert.ok(parseOfferTerms({ offerType: "PPO", ctc: "8", joiningDate: TODAY }, { now: NOW }).joiningDate);
  throwsMsg(() => parseOfferTerms({ offerType: "PPO", ctc: "8", joiningDate: "2026-11-11" }, { now: NOW }), /past/);
  throwsMsg(() => parseOfferTerms({ offerType: "PPO", ctc: "8", joiningDate: "2026-02-30" }, { now: NOW }), /valid/);
  throwsMsg(() => parseOfferTerms({ offerType: "PPO", ctc: "8", joiningDate: "2030-01-01" }, { now: NOW }), /years/);
});
test("today in India rolls over at 18:30 UTC", () => {
  assert.equal(todayYmd(new Date("2026-11-12T18:29:00Z")), "2026-11-12");
  assert.equal(todayYmd(new Date("2026-11-12T18:31:00Z")), "2026-11-13");
});
test("old offers (text package, no new fields) still read as Full-time with their text", () => {
  const old = { offerType: undefined, offerPackage: "12 LPA", offerCtcLpa: null, offerStipend: null };
  assert.equal(packageText(old), "12 LPA");
  assert.deepEqual(offerSummaryParts(old), ["Full-time", "12 LPA"]);
  assert.equal(effectiveCtcLpa({ offerType: "FULL_TIME", offerPackage: "12 LPA", offerCtcLpa: null }), 12);
});
test("package text from older offers is read only when it is clear", () => {
  assert.equal(legacyLpa("12 LPA"), 12);
  assert.equal(legacyLpa("₹8.5 lakhs per annum"), 8.5);
  assert.equal(legacyLpa("10-12 LPA"), null);
  assert.equal(legacyLpa("as per company norms"), null);
  assert.equal(legacyLpa(""), null);
  assert.equal(effectiveCtcLpa({ offerType: "INTERNSHIP", offerPackage: "9 LPA", offerCtcLpa: null }), null);
});

console.log("\nJoining date deferral");
test("a good request is accepted", () => {
  const r = checkDeferralRequest({ reason: "My final exams finish in January.", newDate: "2027-02-01" }, { joiningDate: parseYmd("2027-01-05") }, NOW);
  assert.equal(r.ok, true);
});
test("the new date must be later than the current joining date", () => {
  const r = checkDeferralRequest({ reason: "My final exams finish in January.", newDate: "2027-01-05" }, { joiningDate: parseYmd("2027-01-05") }, NOW);
  assert.equal(r.ok, false);
});
test("with no joining date on record the new date must be after today", () => {
  assert.equal(checkDeferralRequest({ reason: "A medical reason, a few weeks.", newDate: TODAY }, { joiningDate: null }, NOW).ok, false);
  assert.equal(checkDeferralRequest({ reason: "A medical reason, a few weeks.", newDate: "2026-12-01" }, { joiningDate: null }, NOW).ok, true);
});
test("reason is required and dates over 18 months away are refused", () => {
  assert.equal(checkDeferralRequest({ reason: "short", newDate: "2027-02-01" }, { joiningDate: null }, NOW).ok, false);
  assert.equal(checkDeferralRequest({ reason: "A long enough reason here.", newDate: "2029-01-01" }, { joiningDate: null }, NOW).ok, false);
  assert.equal(checkDeferralRequest({ reason: "A long enough reason here.", newDate: "not a date" }, { joiningDate: null }, NOW).ok, false);
});

console.log("\nReminders");
const docs = (over: Partial<Parameters<typeof documentReminderDue>[0]>) =>
  ({ stage: "OFFER_ACCEPTED", documentsVerified: false, documentsDueAt: addDays(NOW, 5), docReminderSentAt: null, docOverdueSentAt: null, ...over });
test("no document reminder while the deadline is far away", () => assert.equal(documentReminderDue(docs({}), NOW), "none"));
test("reminder inside the last 2 days, once", () => {
  assert.equal(documentReminderDue(docs({ documentsDueAt: addDays(NOW, 1.5) }), NOW), "soon");
  assert.equal(documentReminderDue(docs({ documentsDueAt: addDays(NOW, 1.5), docReminderSentAt: NOW }), NOW), "none");
});
test("overdue notice once the deadline has passed, once", () => {
  assert.equal(documentReminderDue(docs({ documentsDueAt: addDays(NOW, -1) }), NOW), "overdue");
  assert.equal(documentReminderDue(docs({ documentsDueAt: addDays(NOW, -1), docOverdueSentAt: NOW }), NOW), "none");
});
test("no reminder once documents are verified or the offer is not accepted", () => {
  assert.equal(documentReminderDue(docs({ documentsDueAt: addDays(NOW, -1), documentsVerified: true }), NOW), "none");
  assert.equal(documentReminderDue(docs({ documentsDueAt: addDays(NOW, -1), stage: "JOINED" }), NOW), "none");
  assert.equal(documentReminderDue(docs({ documentsDueAt: null }), NOW), "none");
});
const offer = (over: Partial<Parameters<typeof offerFollowUpDue>[0]>) =>
  ({ stage: "OFFER_SENT", offerSentAt: addDays(NOW, -4), offerFollowUpAt: null, offerFollowUpCount: 0, ...over });
test("offer follow-up after 3 days, then every 3 days, at most 3 times", () => {
  assert.equal(offerFollowUpDue(offer({ offerSentAt: addDays(NOW, -2) }), NOW), false);
  assert.equal(offerFollowUpDue(offer({}), NOW), true);
  assert.equal(offerFollowUpDue(offer({ offerFollowUpAt: addDays(NOW, -1), offerFollowUpCount: 1 }), NOW), false);
  assert.equal(offerFollowUpDue(offer({ offerFollowUpAt: addDays(NOW, -3.1), offerFollowUpCount: 1 }), NOW), true);
  assert.equal(offerFollowUpDue(offer({ offerFollowUpAt: addDays(NOW, -9), offerFollowUpCount: 3 }), NOW), false);
  assert.equal(offerFollowUpDue(offer({ stage: "OFFER_ACCEPTED" }), NOW), false);
});

console.log("\nSupport list rules");
const baseStudent = { readinessLevel: null as string | null, placementStatus: "UNPLACED", cgpa: 7.5, backlogs: 0, branch: "CSE", graduationYear: 2026, applicationStages: [] as string[] };
const openDrive = (daysOld: number) => ({ createdAt: addDays(NOW, -daysOld), minCgpa: 6, maxBacklogs: 1, eligibleBranches: [], eligibleGradYears: [] });
test("not ready is flagged", () => assert.equal(riskReasons({ ...baseStudent, readinessLevel: "NOT_READY" }, [], NOW).length, 1));
test("two rejections and nothing active is flagged; something active is not", () => {
  assert.equal(riskReasons({ ...baseStudent, applicationStages: ["REJECTED", "REJECTED"] }, [], NOW).length, 1);
  assert.equal(riskReasons({ ...baseStudent, applicationStages: ["REJECTED", "REJECTED", "SHORTLISTED"] }, [], NOW).length, 0);
});
test("not applying is flagged only after a drive they are eligible for has been open 7+ days", () => {
  assert.equal(riskReasons(baseStudent, [openDrive(3)], NOW).length, 0);
  assert.equal(riskReasons(baseStudent, [openDrive(8)], NOW).length, 1);
  assert.equal(riskReasons({ ...baseStudent, cgpa: 5 }, [openDrive(8)], NOW).length, 0, "not eligible, so not counted");
});
test("placed students and students holding an offer are never flagged", () => {
  for (const status of ["OFFER_RECEIVED", "OFFER_ACCEPTED", "JOINED"]) {
    assert.equal(riskReasons({ ...baseStudent, readinessLevel: "NOT_READY", placementStatus: status }, [], NOW).length, 0);
  }
});

console.log("\nCommand dashboard numbers");
const app = (over: Partial<AnalyticsApp>): AnalyticsApp => ({
  studentId: "s1", driveId: "d1", recruiterId: "r1", companyName: "Acme", stage: "OFFER_ACCEPTED", offerType: "FULL_TIME", offerCtcLpa: 10,
  offerStipend: null, offerPackage: "10 LPA", offerSentAt: new Date("2026-10-05T10:00:00Z"), documentsVerified: false, documentsDueAt: null,
  joiningDate: null, deferralStatus: null, convertedFromInternship: false, ...over,
});
const apps: AnalyticsApp[] = [
  app({ studentId: "s1", offerCtcLpa: 10 }),
  app({ studentId: "s2", stage: "JOINED", offerCtcLpa: 14, documentsVerified: true }),
  app({ studentId: "s3", stage: "OFFER_DECLINED", offerCtcLpa: 20 }),
  app({ studentId: "s4", stage: "OFFER_SENT", offerCtcLpa: 8 }),
  app({ studentId: "s5", stage: "OFFER_REQUESTED", offerCtcLpa: 9, offerSentAt: null }),
  app({ studentId: "s6", stage: "OFFER_ACCEPTED", offerType: "INTERNSHIP", offerCtcLpa: null, offerStipend: 20000, offerPackage: "₹20,000 per month" }),
  app({ studentId: "s7", stage: "OFFER_ACCEPTED", offerCtcLpa: null, offerPackage: "12 LPA" }), // older offer, text only
  app({ studentId: "s8", stage: "OFFER_ACCEPTED", offerCtcLpa: null, offerPackage: "as per norms" }), // unreadable
  app({ studentId: "s9", stage: "SHORTLISTED", offerCtcLpa: null, offerPackage: null, offerSentAt: null }),
];
test("offers made, accepted, pending", () => {
  const s = computeOfferStats(apps);
  assert.equal(s.made, 7); // s1 s2 s3 s4 s6 s7 s8
  assert.equal(s.accepted, 6 - 1 + 0); // s1 s2 s6 s7 s8 = 5
  assert.equal(s.declined, 1);
  assert.equal(s.awaitingStudent, 1);
  assert.equal(s.awaitingPlacementCell, 1);
  assert.deepEqual(s.byType, { INTERNSHIP: 1, PPO: 0, FULL_TIME: 6 });
});
test("average and highest package use accepted job offers with a readable number only", () => {
  const s = computeOfferStats(apps);
  assert.deepEqual([s.acceptedPackage.n, s.acceptedPackage.average, s.acceptedPackage.highest, s.acceptedPackage.lowest], [3, 12, 14, 10]);
  assert.equal(s.acceptedPackage.median, 12);
  assert.equal(s.offeredPackage.highest, 20);
  assert.equal(s.withoutNumber, 1);
  assert.equal(s.internshipStipend.average, 20000);
});
test("recruiter rows and repeat hiring", () => {
  const drives = [
    { id: "d1", recruiterId: "r1", companyName: "Acme", createdAt: new Date("2025-09-01") },
    { id: "d2", recruiterId: "r1", companyName: "Acme", createdAt: new Date("2026-09-01") },
    { id: "d3", recruiterId: "r2", companyName: "Zeta", createdAt: new Date("2026-09-01") },
  ];
  const rows = computeRecruiterRows(apps, drives);
  const acme = rows.find((r) => r.company === "Acme")!;
  assert.equal(acme.repeat, true);
  assert.equal(acme.drives, 2);
  assert.equal(acme.offers, 7);
  assert.equal(rows.find((r) => r.company === "Zeta")!.repeat, false);
});
test("branch conversion counts internships as offers but not as placements", () => {
  const rows = computeBranchConversion(
    [{ id: "s1", branch: "CSE", placementStatus: "OFFER_ACCEPTED" }, { id: "s6", branch: "CSE", placementStatus: "OFFER_RECEIVED" }, { id: "s9", branch: "IT", placementStatus: "SHORTLISTED" }],
    apps
  );
  const cse = rows.find((r) => r.branch === "CSE")!;
  assert.deepEqual([cse.students, cse.applied, cse.offered, cse.placed, cse.placedOfApplied], [2, 2, 2, 1, 50]);
});
test("documents and joining summary", () => {
  const d = computeDocJoinSummary(
    [
      app({ documentsVerified: true, stage: "JOINED" }),
      app({ documentsVerified: true, joiningDate: addDays(NOW, 10) }),
      app({ documentsVerified: false, documentsDueAt: addDays(NOW, -1) }),
      app({ documentsVerified: false, deferralStatus: "PENDING" }),
    ],
    NOW
  );
  assert.deepEqual([d.accepted, d.documentsVerified, d.documentsPending, d.documentsOverdue, d.joined, d.awaitingJoining, d.joiningNext30Days, d.deferralsPending], [4, 2, 2, 1, 1, 1, 1, 1]);
});
test("monthly trend groups by month in India time", () => {
  const t = computeMonthlyTrend([app({ offerSentAt: new Date("2026-10-31T19:00:00Z") }), app({ offerSentAt: new Date("2026-11-02T10:00:00Z"), offerCtcLpa: 20 })]);
  assert.deepEqual(t.map((m) => [m.month, m.offers]), [["2026-11", 2]]); // 19:00 UTC on 31 Oct is already 1 Nov in India
});

console.log("\nEligibility assistant");
const drives: AssistantDrive[] = [
  { id: "a", companyName: "Infosys Ltd", jobRole: "Systems Engineer", status: "OPEN", minCgpa: 7, maxBacklogs: 0, eligibleBranches: ["CSE", "IT"], eligibleGradYears: [2026], applyDeadline: addDays(NOW, 4) },
  { id: "b", companyName: "Tata Consultancy Services", jobRole: "Ninja", status: "OPEN", minCgpa: null, maxBacklogs: null, eligibleBranches: [], eligibleGradYears: [], applyDeadline: null },
  { id: "c", companyName: "Zoho", jobRole: "Developer", status: "OPEN", minCgpa: 9, maxBacklogs: null, eligibleBranches: [], eligibleGradYears: [], applyDeadline: addDays(NOW, -1) },
];
const stu = { cgpa: 7.5, backlogs: 1, branch: "cse", graduationYear: 2026, placementStatus: "UNPLACED" };
test("finds drives by company name, ignoring case and filler words", () => {
  assert.deepEqual(findDrivesMentioned("Am I eligible for INFOSYS?", drives).map((d) => d.id), ["a"]);
  assert.deepEqual(findDrivesMentioned("what about tcs", drives).map((d) => d.id), ["b"]); // initials count
  assert.deepEqual(findDrivesMentioned("tata consultancy services deadline", drives).map((d) => d.id), ["b"]);
  assert.deepEqual(findDrivesMentioned("which drives am i eligible for", drives).map((d) => d.id), []);
});
test("intent", () => {
  assert.equal(detectIntent("which drives can I apply to", 0), "LIST");
  assert.equal(detectIntent("why am I not eligible for infosys", 1), "WHY_NOT");
  assert.equal(detectIntent("when is the last date for infosys", 1), "DEADLINE");
  assert.equal(detectIntent("what are the requirements for infosys", 1), "REQUIREMENTS");
});
test("verdict comes from the exact rules", () => {
  const f = buildFacts(drives[0], stu, null, NOW);
  assert.equal(f.eligible, false);
  assert.match(f.reasons[0], /backlog/);
  assert.equal(f.canApply, false);
  assert.equal(f.daysLeft, 4);
  assert.equal(buildFacts(drives[1], stu, null, NOW).eligible, true);
  assert.equal(buildFacts(drives[1], stu, null, NOW).canApply, true);
});
test("a passed deadline or an existing application blocks applying", () => {
  assert.match(buildFacts(drives[2], { ...stu, cgpa: 9.5 }, null, NOW).applyBlockedBecause ?? "", /last date/);
  assert.match(buildFacts(drives[1], stu, { stage: "SHORTLISTED", specialConsideration: false }, NOW).applyBlockedBecause ?? "", /already applied/);
  assert.match(buildFacts(drives[1], { ...stu, placementStatus: "JOINED" }, null, NOW).applyBlockedBecause ?? "", /joined/);
});
test("special consideration makes the student eligible", () => {
  const f = buildFacts(drives[0], stu, { stage: "ELIGIBLE", specialConsideration: true }, NOW);
  assert.equal(f.eligible, true);
});
test("AI wording is accepted only if it stays inside the facts", () => {
  const facts = [buildFacts(drives[0], stu, null, NOW)];
  const text = factsForModel("VERDICT", facts);
  assert.equal(isFaithful("You are not eligible for this role because you have more backlogs than allowed. The last date is 16 Nov 2026.", text, facts), true);
  assert.equal(isFaithful("You are eligible for this role, good luck!", text, facts), false, "contradicts the verdict");
  assert.equal(isFaithful("You are not eligible, but you need a CGPA of 8.", text, facts), false, "invented number");
  assert.equal(isFaithful("See https://example.com for details about this drive today.", text, facts), false, "link");
  assert.equal(isFaithful("Hi", text, facts), false, "too short");
});
test("summary lists eligible drives", () => {
  const all = drives.map((d) => buildFacts(d, { ...stu, backlogs: 0 }, null, NOW));
  assert.match(summarize("LIST", all), /eligible for 2/);
});

console.log("\nEvaluation statistics");
test("mean, sd, median, percentile, correlation", () => {
  assert.equal(mean([2, 4, 6]), 4);
  assert.equal(Math.round(stdev([2, 4, 6]) * 1000) / 1000, 2);
  assert.equal(median([3, 1, 2, 10]), 2.5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  assert.equal(Math.round((pearson([1, 2, 3, 4], [2, 4, 6, 8]) ?? 0) * 100) / 100, 1);
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), null);
  assert.equal(skillOverlapPercent(["Java", " sql "], ["java", "SQL", "Git", "Docker"]), 50);
});

console.log(`\n${passed} checks passed${process.exitCode ? ", some FAILED" : ""}.\n`);
