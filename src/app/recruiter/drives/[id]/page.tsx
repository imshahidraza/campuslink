import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRecruiterOrRedirect } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { DriveStatusControl, BulkMatchButton } from "@/components/dashboard/DriveDetailControls";
import { ScreeningCard } from "@/components/dashboard/ScreeningCard";
import { ScreeningResults, type ResultRow } from "@/components/dashboard/ScreeningResults";
import { settleDrive } from "@/lib/screeningAttempt";
import type { AttemptState } from "@/lib/screening";
import { RecruiterCandidateRow } from "@/components/dashboard/RecruiterCandidateRow";
import { AutoScheduleForm } from "@/components/dashboard/AutoScheduleForm";
import { ScheduleRequestCard } from "@/components/dashboard/ScheduleRequestCard";
import { getAgreedWindow } from "@/lib/schedule";
import { stageLabel } from "@/lib/utils";
import { Pencil, Award } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { placementCellLabel } from "@/lib/college";

export default async function RecruiterDriveDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { recruiter } = await requireRecruiterOrRedirect();
  // Students whose time ran out are finished with their saved answers before the results are drawn.
  await settleDrive(id);
  const drive = await prisma.drive.findUnique({
    where: { id },
    include: {
      applications: {
        include: {
          student: { include: { user: true, resume: { select: { id: true } } } },
          screeningAttempt: { select: { submittedAt: true, mcqCorrect: true, mcqTotal: true, feedbackAt: true } },
        },
        orderBy: { fitScore: "desc" },
      },
      screeningQuestions: { orderBy: { position: "asc" } },
    },
  });
  // A recruiter can only open their own drives (IDOR guard).
  if (!drive || drive.recruiterId !== recruiter.id) notFound();

  const active = drive.applications.filter((a) => a.stage !== "WITHDRAWN");
  const withdrawn = drive.applications.length - active.length;
  const recommended = active.filter((a) => a.specialConsideration);
  const others = active.filter((a) => !a.specialConsideration);
  const shortlisted = active.filter((a) => a.stage === "SHORTLISTED").length;
  const cell = await placementCellLabel();
  const approved = recruiter.status === "APPROVED";
  const screeningOn = drive.screeningStatus === "PUBLISHED";
  const stateOf = (a: (typeof active)[number]): AttemptState =>
    !a.screeningAttempt ? "NOT_STARTED" : a.screeningAttempt.submittedAt ? "SUBMITTED" : "IN_PROGRESS";
  const screeningFor = (a: (typeof active)[number]) => ({
    required: screeningOn,
    state: stateOf(a),
    correct: a.screeningAttempt?.mcqCorrect ?? null,
    total: a.screeningAttempt?.mcqTotal ?? null,
  });
  const resultRows: ResultRow[] = active
    .filter((a) => ["ELIGIBLE", "SHORTLISTED", "INTERVIEW", "SELECTED"].includes(a.stage) || a.screeningAttempt)
    .map((a) => ({
      applicationId: a.id,
      name: a.student.user.name,
      rollNo: a.student.rollNo,
      state: stateOf(a),
      correct: a.screeningAttempt?.mcqCorrect ?? null,
      total: a.screeningAttempt?.mcqTotal ?? null,
      submittedAt: a.screeningAttempt?.submittedAt ? a.screeningAttempt.submittedAt.toISOString() : null,
      hasComments: Boolean(a.screeningAttempt?.feedbackAt),
    }));
  const [scheduleRequest, window] = await Promise.all([
    prisma.scheduleRequest.findUnique({ where: { driveId: drive.id } }),
    getAgreedWindow(drive.id),
  ]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{drive.jobRole}</h1>
          <p className="text-muted text-sm mt-1">
            Posted {fmtDate(drive.createdAt)}
            {drive.applyDeadline ? ` · Apply by ${fmtDate(drive.applyDeadline)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge tone="brand">{stageLabel(drive.status)}</Badge>
          {approved && (
            <LinkButton href={`/recruiter/drives/${drive.id}/edit`} variant="secondary" size="sm">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </LinkButton>
          )}
        </div>
      </div>

      {approved && (
        <div className="mt-6">
          <DriveStatusControl driveId={drive.id} status={drive.status} />
          {drive.status === "DRAFT" && (
            <p className="text-xs text-muted mt-2">
              This drive is a draft. Set it to Open when you want students to see it and apply.
            </p>
          )}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-1 h-fit">
          <CardHeader>
            <CardTitle>Requirements</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <p className="text-sm text-muted leading-relaxed">{drive.jdSummary}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {drive.jdRequiredSkills.map((s) => (
                <Badge key={s} tone="brand">
                  {s}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-5">
          {recommended.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader className="flex flex-row items-center gap-2">
                <Award className="h-4 w-4 text-amber-600 shrink-0" />
                <CardTitle>Recommended by the placement cell ({recommended.length})</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <p className="text-xs text-muted mb-3 leading-relaxed">
                  {cell} recommended these students. They don&apos;t meet the automatic eligibility rules, but are
                  worth a look based on their profile. The decision is yours.
                </p>
                {recommended.map((app) => (
                  <RecruiterCandidateRow key={app.id} application={app} window={window} screening={screeningFor(app)} />
                ))}
              </CardContent>
            </Card>
          )}

          {approved && (
            <Card>
              <CardHeader>
                <CardTitle>Screening interview</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <ScreeningCard
                  driveId={drive.id}
                  status={drive.screeningStatus}
                  minutes={drive.screeningMinutes}
                  minScore={drive.screeningMinScore}
                  questions={drive.screeningQuestions.map((q) => ({
                    id: q.id,
                    position: q.position,
                    kind: q.kind,
                    prompt: q.prompt,
                    options: q.options,
                    correctIndex: q.correctIndex,
                    lookFor: q.lookFor,
                  }))}
                />
              </CardContent>
            </Card>
          )}

          {approved && screeningOn && (
            <Card>
              <CardHeader>
                <CardTitle>Screening results</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <ScreeningResults driveId={drive.id} rows={resultRows} minScore={drive.screeningMinScore} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>Applicants ({others.length})</CardTitle>
              {approved && <BulkMatchButton driveId={drive.id} />}
            </CardHeader>
            <CardContent className="pt-3">
              {others.length === 0 && (
                <p className="text-sm text-muted">
                  No one has applied yet.{" "}
                  {drive.status === "DRAFT"
                    ? "Open the drive so eligible students can see it and apply."
                    : "Eligible students can see this drive and apply from their dashboard."}
                </p>
              )}
              {others.map((app) => (
                <RecruiterCandidateRow key={app.id} application={app} window={window} screening={screeningFor(app)} />
              ))}
              {withdrawn > 0 && (
                <p className="text-xs text-muted mt-3">
                  {withdrawn} student{withdrawn === 1 ? "" : "s"} withdrew their application.
                </p>
              )}
            </CardContent>
          </Card>

          {approved && (
            <Card>
              <CardHeader>
                <CardTitle>Interview dates</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <ScheduleRequestCard
                  driveId={drive.id}
                  request={
                    scheduleRequest
                      ? {
                          status: scheduleRequest.status,
                          dates: scheduleRequest.dates,
                          startTime: scheduleRequest.startTime,
                          endTime: scheduleRequest.endTime,
                          panelCount: scheduleRequest.panelCount,
                          venue: scheduleRequest.venue,
                          panels: scheduleRequest.panels,
                          note: scheduleRequest.note,
                          agreedDates: scheduleRequest.agreedDates,
                          agreedStart: scheduleRequest.agreedStart,
                          agreedEnd: scheduleRequest.agreedEnd,
                          agreedVenue: scheduleRequest.agreedVenue,
                          agreedPanels: scheduleRequest.agreedPanels,
                        }
                      : null
                  }
                />
              </CardContent>
            </Card>
          )}

          {approved && window && (
            <Card>
              <CardHeader>
                <CardTitle>Schedule everyone shortlisted</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <p className="text-xs text-muted mb-4 leading-relaxed">
                  Shortlist candidates first. You can also book one candidate at a time from their row above. Clashes
                  with a student&apos;s other interviews are checked for you.
                </p>
                <AutoScheduleForm driveId={drive.id} shortlisted={shortlisted} window={window} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
