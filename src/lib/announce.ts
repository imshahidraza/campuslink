import { prisma } from "./prisma";
import { checkEligibility } from "./rules";
import { fmtDate } from "./format";
import type { Drive } from "@prisma/client";

/**
 * Students who meet a drive's rules (CGPA, backlogs, specialization, graduation year), leaving out those who
 * already joined a company. This is the exact rule check, the same one students see on their Drives page.
 */
export async function eligibleStudentsForDrive(drive: Pick<Drive, "id" | "minCgpa" | "maxBacklogs" | "eligibleBranches" | "eligibleGradYears">) {
  const students = await prisma.student.findMany({
    where: { placementStatus: { not: "JOINED" } },
    select: { id: true, cgpa: true, backlogs: true, branch: true, graduationYear: true },
  });
  return students.filter((s) => checkEligibility(s, drive).eligible);
}

/**
 * Sends the drive announcement to eligible students and records when and to how many.
 * `onlyNotApplied` turns it into a reminder for eligible students who have not applied yet.
 */
export async function announceDrive(
  drive: Drive,
  opts: { onlyNotApplied?: boolean; note?: string | null } = {}
): Promise<number> {
  let students = await eligibleStudentsForDrive(drive);
  if (opts.onlyNotApplied) {
    const applied = await prisma.application.findMany({
      where: { driveId: drive.id, stage: { not: "WITHDRAWN" } },
      select: { studentId: true },
    });
    const appliedIds = new Set(applied.map((a) => a.studentId));
    students = students.filter((s) => !appliedIds.has(s.id));
  }
  if (students.length > 0) {
    const deadline = drive.applyDeadline ? ` Last date to apply: ${fmtDate(drive.applyDeadline)}.` : "";
    const base = drive.jdSummary || "A placement drive is open and you meet its eligibility rules.";
    const message = `${base}${deadline}${opts.note ? `\n\nFrom the placement cell: ${opts.note}` : ""}`;
    await prisma.notification.createMany({
      data: students.map((s) => ({
        studentId: s.id,
        type: "DRIVE_ANNOUNCEMENT" as const,
        title: opts.onlyNotApplied
          ? `Reminder: ${drive.jobRole} at ${drive.companyName} is open for you`
          : `New drive: ${drive.jobRole} at ${drive.companyName}`,
        message,
      })),
    });
  }
  await prisma.drive.update({ where: { id: drive.id }, data: { announcedAt: new Date(), announcedCount: students.length } });
  return students.length;
}
