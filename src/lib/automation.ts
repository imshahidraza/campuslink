/**
 * The in-app workflow automation. Everything here is a rule check that creates notifications inside C-Link:
 *   1. document deadline reminders (due soon, overdue)
 *   2. follow-up prompts for offers the student has not answered
 *   3. the support list of students at risk of finishing the season unplaced
 * Nothing is sent by email or SMS, and no AI is involved. It runs at most once every few minutes when
 * someone uses the app (see runChecksIfDue), and the placement cell can also press "Run checks now".
 * Each reminder is claimed in the database before it is sent, so it can never go out twice.
 */

import { prisma } from "./prisma";
import { documentReminderDue, offerFollowUpDue, daysBetween, OFFER_FOLLOW_UP_AFTER_DAYS, OFFER_FOLLOW_UP_EVERY_DAYS } from "./automationRules";
import { riskReasons, type OpenDrive } from "./risk";
import { fmtDate } from "./format";

export interface SweepResult {
  documentReminders: number;
  overdueDocuments: number;
  offerFollowUps: number;
  newlyFlagged: number;
  resolved: number;
}

const MIN_GAP_MS = 10 * 60_000; // when triggered by normal use, at most once per 10 minutes
const g = globalThis as unknown as { __clinkSweep?: { last: number; running: Promise<SweepResult> | null } };
const state = (g.__clinkSweep ??= { last: 0, running: null });

function envDays(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Runs the checks if the last run was a while ago. Never throws and never makes the page wait. */
export function runChecksIfDue(): void {
  if (state.running || Date.now() - state.last < MIN_GAP_MS) return;
  runChecks().catch(() => {
    // Details stay out of the logs on purpose: a failed reminder run must not leak data. It tries again next time.
    console.error("Automation checks failed. They will run again shortly.");
  });
}

/** Runs all the checks now. Only one run happens at a time; a second caller gets the first run's result. */
export function runChecks(): Promise<SweepResult> {
  if (state.running) return state.running;
  state.running = doRun().finally(() => {
    state.last = Date.now();
    state.running = null;
  });
  return state.running;
}

async function doRun(): Promise<SweepResult> {
  const now = new Date();
  const result: SweepResult = { documentReminders: 0, overdueDocuments: 0, offerFollowUps: 0, newlyFlagged: 0, resolved: 0 };

  /* 1. Document deadlines */
  const waitingDocs = await prisma.application.findMany({
    where: { stage: "OFFER_ACCEPTED", documentsVerified: false, documentsDueAt: { not: null } },
    select: {
      id: true, stage: true, documentsVerified: true, documentsDueAt: true, docReminderSentAt: true, docOverdueSentAt: true,
      studentId: true, drive: { select: { companyName: true } }, student: { select: { rollNo: true, user: { select: { name: true } } } },
    },
  });
  for (const a of waitingDocs) {
    const due = documentReminderDue(a, now);
    if (due === "none" || !a.documentsDueAt) continue;
    if (due === "soon") {
      const claimed = await prisma.application.updateMany({ where: { id: a.id, docReminderSentAt: null }, data: { docReminderSentAt: now } });
      if (claimed.count === 1) {
        await prisma.notification.create({
          data: {
            studentId: a.studentId,
            type: "DOCUMENT_DEADLINE",
            title: "Reminder: documents due soon",
            message: `Your documents for ${a.drive.companyName} are due by ${fmtDate(a.documentsDueAt)}. Please send them to the placement cell if you have not already.`,
          },
        });
        result.documentReminders++;
      }
    } else {
      const claimed = await prisma.application.updateMany({ where: { id: a.id, docOverdueSentAt: null }, data: { docOverdueSentAt: now } });
      if (claimed.count === 1) {
        await prisma.notification.create({
          data: {
            studentId: a.studentId,
            type: "DOCUMENT_DEADLINE",
            title: "Your documents are overdue",
            message: `The last date for your ${a.drive.companyName} documents was ${fmtDate(a.documentsDueAt)}. Please send them to the placement cell as soon as you can, or ask them for more time.`,
          },
        });
        await prisma.tpoNotification.create({
          data: {
            type: "DOCUMENT_DEADLINE",
            title: "Documents overdue",
            message: `${a.student.rollNo} (${a.student.user.name}) has not had their ${a.drive.companyName} documents verified by the deadline of ${fmtDate(a.documentsDueAt)}.`,
          },
        });
        result.overdueDocuments++;
      }
    }
  }

  /* 2. Offers the student has not answered: prompt the recruiter, remind the student */
  const afterDays = envDays("OFFER_FOLLOW_UP_DAYS", OFFER_FOLLOW_UP_AFTER_DAYS);
  const everyDays = envDays("OFFER_FOLLOW_UP_DAYS", OFFER_FOLLOW_UP_EVERY_DAYS);
  const pendingOffers = await prisma.application.findMany({
    where: { stage: "OFFER_SENT", offerSentAt: { not: null } },
    select: {
      id: true, stage: true, offerSentAt: true, offerFollowUpAt: true, offerFollowUpCount: true, studentId: true,
      drive: { select: { companyName: true, jobRole: true, recruiterId: true } },
      student: { select: { rollNo: true, user: { select: { name: true } } } },
    },
  });
  for (const a of pendingOffers) {
    if (!offerFollowUpDue(a, now, { afterDays, everyDays })) continue;
    // Claim this reminder first: only one run can move the count from its current value.
    const claimed = await prisma.application.updateMany({
      where: { id: a.id, stage: "OFFER_SENT", offerFollowUpCount: a.offerFollowUpCount },
      data: { offerFollowUpAt: now, offerFollowUpCount: a.offerFollowUpCount + 1 },
    });
    if (claimed.count !== 1 || !a.offerSentAt) continue;
    const waited = Math.max(1, daysBetween(a.offerSentAt, now));
    await prisma.recruiterNotification.create({
      data: {
        recruiterId: a.drive.recruiterId,
        type: "OFFER_UPDATE",
        title: "Follow up on a pending offer",
        message: `${a.student.rollNo} (${a.student.user.name}) has not replied to your ${a.drive.jobRole} offer for ${waited} day${waited === 1 ? "" : "s"}. You may want to get in touch.`,
      },
    });
    await prisma.notification.create({
      data: {
        studentId: a.studentId,
        type: "OFFER_UPDATE",
        title: `Your offer from ${a.drive.companyName} is waiting`,
        message: `You received this offer ${waited} day${waited === 1 ? "" : "s"} ago. Please open your Placement Journey to accept or decline it.`,
      },
    });
    result.offerFollowUps++;
  }

  /* 3. Support list (escalation) */
  const [students, openDrives, existing] = await Promise.all([
    prisma.student.findMany({
      select: {
        id: true, readinessLevel: true, placementStatus: true, cgpa: true, backlogs: true, branch: true, graduationYear: true,
        applications: { select: { stage: true } },
      },
    }),
    prisma.drive.findMany({
      where: { status: "OPEN" },
      select: { createdAt: true, minCgpa: true, maxBacklogs: true, eligibleBranches: true, eligibleGradYears: true },
    }),
    prisma.escalation.findMany({ select: { id: true, studentId: true, status: true, reasons: true } }),
  ]);
  const byStudent = new Map(existing.map((e) => [e.studentId, e]));
  const drives: OpenDrive[] = openDrives;
  for (const s of students) {
    const reasons = riskReasons(
      { readinessLevel: s.readinessLevel, placementStatus: s.placementStatus, cgpa: s.cgpa, backlogs: s.backlogs, branch: s.branch, graduationYear: s.graduationYear, applicationStages: s.applications.map((a) => a.stage) },
      drives,
      now
    );
    const row = byStudent.get(s.id);
    if (reasons.length > 0) {
      if (!row) {
        try {
          await prisma.escalation.create({ data: { studentId: s.id, reasons } });
          result.newlyFlagged++;
        } catch (err) {
          // Another server process may have added this student a moment ago (the studentId is unique): that is fine.
          if ((err as { code?: string }).code !== "P2002") throw err;
        }
      } else if (row.status !== "RESOLVED" && JSON.stringify(row.reasons) !== JSON.stringify(reasons)) {
        await prisma.escalation.update({ where: { id: row.id }, data: { reasons } });
      }
    } else if (row && row.status !== "RESOLVED" && ["OFFER_ACCEPTED", "JOINED"].includes(s.placementStatus)) {
      // Placed, so the support is no longer needed.
      await prisma.escalation.update({ where: { id: row.id }, data: { status: "RESOLVED", resolvedAt: now } });
      result.resolved++;
    }
  }

  return result;
}
