import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/Card";
import {
  DriveStatusControl,
  BulkMatchButton,
  EligibilityForm,
} from "@/components/dashboard/DriveDetailControls";
import { ApplicationReviewRow } from "@/components/dashboard/ApplicationReviewRow";
import { SpecialConsiderationPanel } from "@/components/dashboard/SpecialConsiderationPanel";
import { stageLabel } from "@/lib/utils";
import { FileDown } from "lucide-react";
import { settleDrive } from "@/lib/screeningAttempt";
import { settleVideoDrive } from "@/lib/videoAttempt";

export default async function TpoDriveDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await settleDrive(id); // finish attempts whose time ran out, so the counts below are right
  await settleVideoDrive(id);
  const [drive, allStudents] = await Promise.all([
    prisma.drive.findUnique({
      where: { id },
      include: {
        recruiter: true,
        applications: {
          include: {
            student: { include: { user: true, resume: { select: { id: true } } } },
            screeningAttempt: { select: { submittedAt: true } },
            videoAttempt: { select: { status: true } },
          },
          orderBy: { fitScore: "desc" },
        },
      },
    }),
    prisma.student.findMany({
      include: { user: true },
      orderBy: { rollNo: "asc" },
    }),
  ]);
  if (!drive) notFound();

  const recommended = drive.applications
    .filter((a) => a.specialConsideration)
    .map((a) => ({
      id: a.id,
      studentId: a.studentId,
      rollNo: a.student.rollNo,
      name: a.student.user.name,
      note: a.specialConsiderationNote,
      fitScore: a.fitScore,
    }));

  const screeningApplicants = drive.applications.filter((a) => a.stage !== "WITHDRAWN");
  const screeningFinished = screeningApplicants.filter((a) => a.screeningAttempt?.submittedAt).length;
  const videoFinished = screeningApplicants.filter((a) => a.videoAttempt && a.videoAttempt.status !== "IN_PROGRESS").length;
  const videoStarted = screeningApplicants.filter((a) => a.videoAttempt?.status === "IN_PROGRESS").length;
  const screeningStarted = screeningApplicants.filter((a) => a.screeningAttempt && !a.screeningAttempt.submittedAt).length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{drive.jobRole}</h1>
          <p className="text-muted text-sm mt-1">{drive.companyName}</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/api/drives/${drive.id}/report`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-soft bg-white px-3 py-1.5 text-xs text-ink hover:bg-surface-2"
          >
            <FileDown className="h-3.5 w-3.5" /> Download report (PDF)
          </a>
          <Badge tone="brand">{stageLabel(drive.status)}</Badge>
        </div>
      </div>

      <div className="mt-6">
        <DriveStatusControl driveId={drive.id} status={drive.status} />
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>AI-structured requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted leading-relaxed">{drive.jdSummary}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {drive.jdRequiredSkills.map((s) => (
                  <Badge key={s} tone="brand">
                    {s}
                  </Badge>
                ))}
                {drive.jdPreferredSkills.map((s) => (
                  <Badge key={s} tone="neutral">
                    {s}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Applications ({drive.applications.length})</CardTitle>
              <BulkMatchButton driveId={drive.id} />
            </CardHeader>
            <CardContent>
              {drive.applications.length === 0 && (
                <p className="text-sm text-muted">
                  No applications yet. Run AI matching to score every rule-eligible student against this JD.
                </p>
              )}
              {drive.applications.map((app) => (
                <ApplicationReviewRow
                  key={app.id}
                  application={{
                    id: app.id,
                    driveId: drive.id,
                    stage: app.stage,
                    fitScore: app.fitScore,
                    matchedSkills: app.matchedSkills,
                    missingSkills: app.missingSkills,
                    matchExplanation: app.matchExplanation,
                    specialConsideration: app.specialConsideration,
                    student: app.student,
                  }}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Screening interview</CardTitle>
            </CardHeader>
            <CardContent>
              {drive.screeningStatus === "PUBLISHED" ? (
                <>
                  <p className="text-sm text-ink">
                    {screeningFinished} of {screeningApplicants.length} applicant{screeningApplicants.length === 1 ? "" : "s"} finished
                  </p>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    {screeningStarted} in progress · {screeningApplicants.length - screeningFinished - screeningStarted} not started.
                    The recruiter shortlists only students who finish it.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">
                  {drive.screeningStatus === "DRAFT"
                    ? "The recruiter is preparing the questions. Students can't see them yet."
                    : "The recruiter has not set up a screening interview for this drive."}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Video interview</CardTitle>
            </CardHeader>
            <CardContent>
              {drive.videoStatus === "PUBLISHED" ? (
                <>
                  <p className="text-sm text-ink">
                    {videoFinished} of {screeningApplicants.length} applicant{screeningApplicants.length === 1 ? "" : "s"} finished
                  </p>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    {videoStarted} taking it now · {screeningApplicants.length - videoFinished - videoStarted} not started. Counts only: the recordings and
                    marks are seen by the recruiter of this drive.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">
                  {drive.videoStatus === "DRAFT"
                    ? "The recruiter is preparing the questions. Students can't see them yet."
                    : "The recruiter has not set up a video interview for this drive."}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Eligibility rules</CardTitle>
            </CardHeader>
            <CardContent>
              <EligibilityForm
                driveId={drive.id}
                defaults={{
                  minCgpa: drive.minCgpa?.toString() || "",
                  maxBacklogs: drive.maxBacklogs?.toString() || "",
                  eligibleBranches: drive.eligibleBranches.length ? drive.eligibleBranches.join(", ") : "All",
                  eligibleGradYears: drive.eligibleGradYears.join(", "),
                }}
              />
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>TPO Special Consideration</CardTitle>
            </CardHeader>
            <CardContent>
              <SpecialConsiderationPanel
                driveId={drive.id}
                allStudents={allStudents.map((s) => ({
                  id: s.id,
                  rollNo: s.rollNo,
                  name: s.user.name,
                  branch: s.branch,
                  cgpa: s.cgpa,
                }))}
                initialRecommended={recommended}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
