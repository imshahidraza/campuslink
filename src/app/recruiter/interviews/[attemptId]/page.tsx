import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/Card";
import { loadAttemptForRecruiter, logVideoAccess } from "@/lib/videoAccess";
import { ensureProcessing, settleVideoWhere } from "@/lib/videoAttempt";
import { AutoRefresh } from "@/components/dashboard/AutoRefresh";
import { VideoReview, type ReviewAnswer } from "@/components/dashboard/VideoReview";
import { END_REASON_TEXT, MAX_TOTAL_SCORE, STATUS_TEXT } from "@/lib/video";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const STEP: Record<string, string> = { PENDING: "Waiting", PROCESSING: "Working", DONE: "Done", FAILED: "Failed" };

export default async function InterviewDetailPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const session = await getSession();
  // The same "not found" for a missing interview and for another recruiter's interview.
  let attempt = await loadAttemptForRecruiter(session, attemptId);
  if (!attempt || !session) notFound();
  if (attempt.status === "IN_PROGRESS") {
    await settleVideoWhere({ id: attempt.id });
    attempt = await loadAttemptForRecruiter(session, attemptId);
    if (!attempt) notFound();
  }
  if (attempt.status !== "IN_PROGRESS") {
    ensureProcessing(attempt);
    await logVideoAccess(attempt.id, session, "VIEW");
  }

  const logs = await prisma.videoAccessLog.findMany({ where: { attemptId: attempt.id }, orderBy: { createdAt: "desc" }, take: 12 });
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.userId))] } }, select: { id: true, name: true } });
  const nameOf = new Map(people.map((p) => [p.id, p.name]));

  const working = attempt.status !== "IN_PROGRESS" && [attempt.remuxStatus, attempt.transcriptionStatus, attempt.evaluationStatus].some((s) => s === "PENDING" || s === "PROCESSING");
  const failed = [attempt.remuxStatus, attempt.transcriptionStatus, attempt.evaluationStatus].includes("FAILED") || attempt.answers.some((a) => a.transcriptStatus === "FAILED");
  const student = attempt.application.student;
  const drive = attempt.application.drive;

  const answers: ReviewAnswer[] = attempt.answers.map((a) => ({
    position: a.position,
    prompt: a.prompt,
    expected: a.expected,
    status: a.status,
    startSec: a.startSec,
    endSec: a.endSec,
    transcript: a.transcript,
    transcriptStatus: a.transcriptStatus,
    evalStatus: a.evalStatus,
    score: a.score,
    technical: a.technical,
    relevance: a.relevance,
    completeness: a.completeness,
    clarity: a.clarity,
    strengths: a.strengths,
    improvements: a.improvements,
    feedback: a.feedback,
    needsReview: a.needsReview,
    note: a.note,
  }));

  return (
    <div className="max-w-5xl">
      <AutoRefresh active={working} />
      <Link href="/recruiter/interviews" className="text-xs text-brand-500 hover:text-brand-600">
        ← All AI interviews
      </Link>
      <h1 className="text-2xl font-semibold text-ink mt-2">
        {student.user.name} <span className="text-muted text-base font-normal">· {student.rollNo} · {student.branch}</span>
      </h1>
      <p className="text-muted text-sm mt-1">
        {drive.jobRole} at {drive.companyName} · started {fmtDateTime(attempt.startedAt)}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone={attempt.status === "INTERRUPTED" ? "warning" : "success"}>{STATUS_TEXT[attempt.status] ?? attempt.status}</Badge>
        {working && <Badge>The AI is working on it. This page updates by itself.</Badge>}
        {attempt.totalScore !== null && !working && (
          <Badge tone="brand">
            AI advice: {attempt.totalScore} / {MAX_TOTAL_SCORE} ({Math.round((attempt.totalScore / MAX_TOTAL_SCORE) * 100)}%)
          </Badge>
        )}
        {attempt.reviewCount > 0 && !working && <Badge tone="warning">{attempt.reviewCount} answer{attempt.reviewCount === 1 ? "" : "s"} need your check</Badge>}
        {attempt.leaveCount > 0 && <Badge tone="warning">Left the page {attempt.leaveCount} time{attempt.leaveCount === 1 ? "" : "s"}</Badge>}
      </div>

      <p className="mt-3 text-xs text-muted leading-relaxed">
        The marks and comments below are advice from an AI, made from the written transcript only. It does not judge faces, voice, accent or background.
        It can be wrong, and speech recognition can mishear. You decide. Nothing here selects or rejects a student.
      </p>

      <VideoReview
        attemptId={attempt.id}
        recordingAvailable={!attempt.recordingDeletedAt && attempt.byteSize > 0}
        recordingDeleted={Boolean(attempt.recordingDeletedAt)}
        answers={answers}
        showReprocess={failed && !working && !attempt.recordingDeletedAt}
        studentName={student.user.name}
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>About this recording</CardTitle>
        </CardHeader>
        <CardContent className="pt-3 text-sm text-muted space-y-1.5 leading-relaxed">
          <p>
            <span className="text-ink">How it ended:</span> {attempt.endReason ? END_REASON_TEXT[attempt.endReason] ?? attempt.endReason : "Still in progress."}
          </p>
          <p>
            <span className="text-ink">Consent given:</span> {fmtDateTime(attempt.consentAt)} (the student ticked the consent box and pressed Start Test).
          </p>
          <p>
            <span className="text-ink">Length:</span>{" "}
            {attempt.durationSec ? `${Math.floor(attempt.durationSec / 60)} min ${Math.round(attempt.durationSec % 60)} s` : "not known"} ·{" "}
            <span className="text-ink">Size:</span> {(attempt.byteSize / (1024 * 1024)).toFixed(1)} MB · <span className="text-ink">Format:</span> {attempt.mimeType}
          </p>
          <p>
            <span className="text-ink">Steps:</span> recording prepared: {STEP[attempt.remuxStatus]} · speech to text: {STEP[attempt.transcriptionStatus]} · AI marks:{" "}
            {STEP[attempt.evaluationStatus]}
          </p>
          {attempt.gapNote && <p className="text-amber-800">{attempt.gapNote}</p>}
          {attempt.processNote && <p className="text-amber-800">{attempt.processNote}</p>}
          <p>
            <span className="text-ink">Kept until:</span>{" "}
            {attempt.recordingDeletedAt ? "The recording has been deleted." : attempt.retainUntil ? `${fmtDateTime(attempt.retainUntil)}, then it is deleted automatically. Transcripts and marks stay.` : "Set when the interview ends."}
          </p>
          {logs.length > 0 && (
            <details className="pt-2">
              <summary className="cursor-pointer text-ink">Who has opened this recording</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {logs.map((l) => (
                  <li key={l.id}>
                    {fmtDateTime(l.createdAt)} · {nameOf.get(l.userId) ?? (l.userId === "system" ? "The system" : "Someone")} · {l.action.replaceAll("_", " ").toLowerCase()}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
