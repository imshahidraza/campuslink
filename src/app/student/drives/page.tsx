import { requireStudentOrRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkEligibility } from "@/lib/rules";
import { StudentDriveCard } from "@/components/dashboard/StudentDriveCard";

export default async function DrivesPage() {
  const { student: studentBase } = await requireStudentOrRedirect();
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentBase.id },
    include: { applications: true },
  });

  const openDrives = await prisma.drive.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
    orderBy: { createdAt: "desc" },
  });

  const drivesWithEligibility = openDrives.map((d) => ({
    drive: d,
    eligibility: checkEligibility(student, {
      minCgpa: d.minCgpa,
      maxBacklogs: d.maxBacklogs,
      eligibleBranches: d.eligibleBranches,
      eligibleGradYears: d.eligibleGradYears,
    }),
  }));

  const appByDrive = new Map(student.applications.map((a) => [a.driveId, a]));
  const eligibleCount = drivesWithEligibility.filter(
    (d) => d.eligibility.eligible || appByDrive.get(d.drive.id)?.specialConsideration
  ).length;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Drives &amp; AI Matching</h1>
      <p className="text-muted text-sm mt-1">
        {eligibleCount} of {openDrives.length} open drive{openDrives.length === 1 ? "" : "s"} you&apos;re
        eligible for, based on CGPA, backlogs, specialization and graduation year.
      </p>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {drivesWithEligibility.map(({ drive, eligibility }) => {
          const app = appByDrive.get(drive.id);
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
              }}
              eligible={eligibility.eligible || Boolean(app?.specialConsideration)}
              ineligibleReasons={eligibility.reasons}
              specialConsideration={Boolean(app?.specialConsideration)}
              existing={
                app
                  ? {
                      fitScore: app.fitScore,
                      matchedSkills: app.matchedSkills,
                      missingSkills: app.missingSkills,
                      matchExplanation: app.matchExplanation,
                    }
                  : null
              }
            />
          );
        })}
        {openDrives.length === 0 && <p className="text-sm text-muted">No open drives right now. Check back soon.</p>}
      </div>
    </div>
  );
}
