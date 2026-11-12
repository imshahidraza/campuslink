import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStudentOrRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { presentQuestions, cleanAnswers } from "@/lib/screening";
import { settleApplication, msLeft } from "@/lib/screeningAttempt";
import { ScreeningStart, ScreeningTest } from "@/components/dashboard/ScreeningTest";
import { fmtDate } from "@/lib/format";

export default async function StudentScreeningPage({ params }: { params: Promise<{ driveId: string }> }) {
  const { driveId } = await params;
  const { student } = await requireStudentOrRedirect();

  const found = await prisma.application.findUnique({
    where: { studentId_driveId: { studentId: student.id, driveId } },
    select: { id: true },
  });
  if (!found) notFound();
  // If the time ran out while the student was away, finish the attempt with what was saved before showing anything.
  await settleApplication(found.id);

  const application = await prisma.application.findUnique({
    where: { id: found.id },
    select: {
      stage: true,
      screeningAttempt: true,
      drive: {
        select: {
          jobRole: true,
          companyName: true,
          status: true,
          screeningStatus: true,
          screeningMinutes: true,
          screeningQuestions: { orderBy: { position: "asc" }, select: { id: true, kind: true, prompt: true, options: true } },
        },
      },
    },
  });
  if (!application || application.stage === "WITHDRAWN" || application.drive.screeningStatus !== "PUBLISHED") notFound();

  const { drive, screeningAttempt: attempt } = application;
  const title = `${drive.jobRole} at ${drive.companyName}`;
  const mcqCount = drive.screeningQuestions.filter((q) => q.kind === "MCQ").length;
  const shortCount = drive.screeningQuestions.length - mcqCount;

  return (
    <div className="max-w-3xl">
      <Link href="/student/drives" className="text-xs text-brand-500 hover:text-brand-600">
        ← Back to drives
      </Link>
      <h1 className="text-2xl font-semibold text-ink mt-2">Screening interview</h1>
      <p className="text-muted text-sm mt-1">{title}</p>

      {!attempt && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Before you start</CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-4">
            <ul className="text-sm text-muted leading-relaxed list-disc pl-5 space-y-1.5">
              <li>
                {mcqCount} multiple-choice question{mcqCount === 1 ? "" : "s"}
                {shortCount > 0 ? ` and ${shortCount} short written question${shortCount === 1 ? "" : "s"}` : ""}.
              </li>
              <li>
                You have {drive.screeningMinutes} minutes. The timer starts when you press Start and keeps running even if you
                close this page.
              </li>
              <li>You can take it once. Your answers are saved as you go and submitted when the time ends.</li>
              <li>Every student of this drive gets the same questions, in a different order.</li>
              <li>
                Stay on this page while you take it. If you switch to another tab or window, it is counted and the recruiter
                can see how many times it happened.
              </li>
              <li>
                The recruiter of this drive reads your answers. The AI may write comments on your written answers to help
                them, but a person makes every decision.
              </li>
            </ul>
            {["OPEN", "IN_PROGRESS"].includes(drive.status) ? (
              <ScreeningStart driveId={driveId} minutes={drive.screeningMinutes} />
            ) : (
              <p className="text-sm text-muted">This drive is not open right now, so the interview can&apos;t be started.</p>
            )}
          </CardContent>
        </Card>
      )}

      {attempt && !attempt.submittedAt && (
        <ScreeningTest
          driveId={driveId}
          remainingMs={msLeft(attempt.deadlineAt)}
          questions={presentQuestions(drive.screeningQuestions, attempt.seed)}
          initialAnswers={cleanAnswers(attempt.answers, drive.screeningQuestions)}
          initialLeaves={attempt.leaveCount}
        />
      )}

      {attempt?.submittedAt && (
        <Card className="mt-6">
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-ink">Submitted on {fmtDate(attempt.submittedAt)}. Thank you.</p>
            <p className="text-sm text-muted mt-2 leading-relaxed">
              {attempt.autoSubmitted
                ? "Your time ended, so the answers you had saved were submitted. "
                : ""}
              The recruiter will read your answers. You will get a notification if you are shortlisted.
            </p>
            <Link href="/student/drives" className="inline-block mt-4 text-sm text-brand-500 hover:text-brand-600">
              Back to drives
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
