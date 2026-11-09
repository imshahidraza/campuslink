import { requireStudentOrRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkEligibility, eligibilityFixes } from "@/lib/rules";
import { StudentDriveCard } from "@/components/dashboard/StudentDriveCard";

export default async function DrivesPage() {
  const { student: studentBase } = await requireStudentOrRedirect();
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentBase.id },
    include: { applications: true, matches: true },
  });

  const joinedApp =
    student.placementStatus === "JOINED"
      ? await prisma.application.findFirst({ where: { studentId: student.id, stage: "JOINED" }, include: { drive: true } })
      : null;
  const joined = student.placementStatus === "JOINED";

  const openDrives = await prisma.drive.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
    orderBy: { createdAt: "desc" },
  });

  const drivesWithEligibility = openDrives.map((d) => {
    const rule = {
      minCgpa: d.minCgpa,
      maxBacklogs: d.maxBacklogs,
      eligibleBranches: d.eligibleBranches,
      eligibleGradYears: d.eligibleGradYears,
    };
    return { drive: d, eligibility: checkEligibility(student, rule), fixes: eligibilityFixes(student, rule) };
  });

  const appByDrive = new Map(student.applications.map((a) => [a.driveId, a]));
  const matchByDrive = new Map(student.matches.map((m) => [m.driveId, m]));
  const eligibleCount = drivesWithEligibility.filter(
    (d) => d.eligibility.eligible || appByDrive.get(d.drive.id)?.specialConsideration
  ).length;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Drives &amp; AI Matching</h1>
      <p className="text-muted text-sm mt-1">
        You are eligible for {eligibleCount} of {openDrives.length} open drive{openDrives.length === 1 ? "" : "s"},
        based on CGPA, backlogs, specialization and graduation year. Check your AI fit first if you like, then press
        Apply.
      </p>

      {joined && (
        <div className="mt-5 rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm text-ink">
          You have joined {joinedApp ? `${joinedApp.drive.companyName} as ${joinedApp.drive.jobRole}` : "a company"}, so you
          can&apos;t apply to other drives. Congratulations!
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {drivesWithEligibility.map(({ drive, eligibility, fixes }) => {
          const app = appByDrive.get(drive.id);
          const match = app && app.stage !== "WITHDRAWN" ? app : matchByDrive.get(drive.id) ?? app;
          return (
            <StudentDriveCard
              key={drive.id}
              drive={{
                id: drive.id,
                companyName: drive.companyName,
                jobRole: drive.jobRole,
                jdSummary: drive.jdSummary,
                jdRequiredSkills: drive.jdRequiredSkills,
                venue: drive.venue,
                driveDate: drive.driveDate ? drive.driveDate.toISOString() : null,
                status: drive.status,
                applyDeadline: drive.applyDeadline ? drive.applyDeadline.toISOString() : null,
              }}
              eligible={eligibility.eligible || Boolean(app?.specialConsideration)}
              ineligibleReasons={eligibility.reasons}
              ineligibleFixes={fixes}
              specialConsideration={Boolean(app?.specialConsideration)}
              alreadyJoined={joined}
              joinedCompany={joinedApp?.drive.companyName ?? null}
              existing={
                match
                  ? {
                      fitScore: match.fitScore,
                      matchedSkills: match.matchedSkills,
                      missingSkills: match.missingSkills,
                      matchExplanation: match.matchExplanation,
                    }
                  : null
              }
              application={app ? { stage: app.stage, documentsVerified: app.documentsVerified } : null}
            />
          );
        })}
        {openDrives.length === 0 && <p className="text-sm text-muted">No drives are open right now. Please check back soon.</p>}
      </div>
    </div>
  );
}
