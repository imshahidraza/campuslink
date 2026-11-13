import Link from "next/link";
import { requireRecruiterOrRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, Badge } from "@/components/ui/Card";
import { RECRUITER_NOT_APPROVED } from "@/lib/access";
import { ensureProcessing, purgeExpiredRecordings, settleVideoRecruiter } from "@/lib/videoAttempt";
import { AutoRefresh } from "@/components/dashboard/AutoRefresh";
import { MAX_TOTAL_SCORE, STATUS_TEXT } from "@/lib/video";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

function working(a: { remuxStatus: string; transcriptionStatus: string; evaluationStatus: string; status: string }) {
  return a.status !== "IN_PROGRESS" && [a.remuxStatus, a.transcriptionStatus, a.evaluationStatus].some((s) => s === "PENDING" || s === "PROCESSING");
}

export default async function InterviewsPage() {
  const { recruiter } = await requireRecruiterOrRedirect();
  if (recruiter.status !== "APPROVED") {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-ink">AI Interviews</h1>
        <Card className="mt-6">
          <CardContent className="pt-5">
            <p className="text-sm text-muted">{RECRUITER_NOT_APPROVED}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Close attempts whose time is over, delete recordings past their keep-until date, and restart work that was cut off.
  await settleVideoRecruiter(recruiter.id);
  await purgeExpiredRecordings();

  const attempts = await prisma.videoAttempt.findMany({
    where: { application: { drive: { recruiterId: recruiter.id } } },
    select: {
      id: true,
      status: true,
      startedAt: true,
      totalScore: true,
      reviewCount: true,
      leaveCount: true,
      remuxStatus: true,
      transcriptionStatus: true,
      evaluationStatus: true,
      processingStartedAt: true,
      recordingDeletedAt: true,
      application: { select: { student: { select: { rollNo: true, user: { select: { name: true } } } }, drive: { select: { jobRole: true, companyName: true } } } },
    },
    orderBy: { startedAt: "desc" },
    take: 200,
  });
  for (const a of attempts) ensureProcessing(a);
  const anyWorking = attempts.some(working);

  return (
    <div>
      <AutoRefresh active={anyWorking} />
      <h1 className="text-2xl font-semibold text-ink">AI Interviews</h1>
      <p className="text-muted text-sm mt-1">
        Recorded video interviews for your drives. The AI&apos;s marks are advice. You watch, read and decide.
      </p>

      <Card className="mt-8">
        <CardContent className="pt-5">
          {attempts.length === 0 && (
            <p className="text-sm text-muted">
              No video interviews yet. Set one up from a drive&apos;s page (&quot;Video interview&quot;). Finished interviews will appear here.
            </p>
          )}
          {attempts.map((a) => {
            const busy = working(a);
            return (
              <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-soft py-3 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {a.application.student.user.name} <span className="text-muted font-normal">· {a.application.student.rollNo}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {a.application.drive.jobRole} at {a.application.drive.companyName} · {fmtDateTime(a.startedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={a.status === "INTERRUPTED" ? "warning" : a.status === "IN_PROGRESS" ? "neutral" : "success"}>{STATUS_TEXT[a.status] ?? a.status}</Badge>
                  {a.status !== "IN_PROGRESS" && (
                    <Badge tone={busy ? "neutral" : a.evaluationStatus === "FAILED" || a.transcriptionStatus === "FAILED" || a.remuxStatus === "FAILED" ? "danger" : "brand"}>
                      {busy ? "AI is working on it" : a.evaluationStatus === "FAILED" || a.transcriptionStatus === "FAILED" ? "AI step failed" : "Evaluated"}
                    </Badge>
                  )}
                  {a.totalScore !== null && !busy && (
                    <span className="text-sm font-semibold text-brand-600 whitespace-nowrap">
                      {a.totalScore} / {MAX_TOTAL_SCORE}
                    </span>
                  )}
                  {a.reviewCount > 0 && !busy && <Badge tone="warning">{a.reviewCount} to check</Badge>}
                  {a.leaveCount > 0 && <Badge tone="warning">Left page {a.leaveCount}×</Badge>}
                  {a.recordingDeletedAt && <Badge>Recording deleted</Badge>}
                  {a.status !== "IN_PROGRESS" && (
                    <Link href={`/recruiter/interviews/${a.id}`} className="text-sm text-brand-500 hover:text-brand-600">
                      Open
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
