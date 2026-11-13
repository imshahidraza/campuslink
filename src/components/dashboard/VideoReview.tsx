"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { allowVideoRetakeAction, deleteVideoRecordingAction, reprocessVideoAction } from "@/lib/actions/videoReview";
import { MAX_SCORE_PER_QUESTION, RUBRIC, clock } from "@/lib/video";

export interface ReviewAnswer {
  position: number;
  prompt: string;
  expected: string | null;
  status: string; // ANSWERED, SKIPPED, UNANSWERED, PENDING
  startSec: number | null;
  endSec: number | null;
  transcript: string | null;
  transcriptStatus: string;
  evalStatus: string;
  score: number | null;
  technical: number | null;
  relevance: number | null;
  completeness: number | null;
  clarity: number | null;
  strengths: string[];
  improvements: string[];
  feedback: string | null;
  needsReview: boolean;
  note: string | null;
}

interface Props {
  attemptId: string;
  recordingAvailable: boolean;
  recordingDeleted: boolean;
  answers: ReviewAnswer[];
  showReprocess: boolean;
  studentName: string;
}

const STATUS_LABEL: Record<string, string> = { ANSWERED: "Answered", SKIPPED: "Skipped", UNANSWERED: "Not answered", PENDING: "Not answered" };

function stepText(a: ReviewAnswer): string | null {
  if (a.status !== "ANSWERED") return null;
  if (a.transcriptStatus === "PENDING" || a.transcriptStatus === "PROCESSING") return "Turning the speech into text...";
  if (a.transcriptStatus === "DONE" && (a.evalStatus === "PENDING" || a.evalStatus === "PROCESSING")) return "The AI is reading the transcript...";
  return null;
}

export function VideoReview({ attemptId, recordingAvailable, recordingDeleted, answers, showReprocess, studentName }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<"" | "delete" | "retake">("");

  function seekTo(position: number, sec: number) {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(position);
    const go = () => {
      v.currentTime = Math.max(0, sec);
      void v.play().catch(() => {});
    };
    if (v.readyState >= 1) go();
    else {
      v.addEventListener("loadedmetadata", go, { once: true });
      v.load();
    }
    v.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function onTime() {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    const hit = answers.find((a) => a.status === "ANSWERED" && a.startSec !== null && a.endSec !== null && t >= a.startSec - 0.3 && t <= a.endSec + 0.3);
    setCurrent(hit ? hit.position : null);
  }

  function run(fn: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>, done: string, goBack = false) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        setConfirm("");
        toast(done);
        if (goBack) router.push("/recruiter/interviews");
        else router.refresh();
      } else toast(r.error, "error");
    });
  }

  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
      <div className="space-y-5 min-w-0">
        <Card>
          <CardContent className="pt-5">
            {recordingAvailable ? (
              <video
                ref={videoRef}
                src={`/api/video/${attemptId}/media`}
                controls
                controlsList="nodownload noplaybackrate"
                disablePictureInPicture
                preload="metadata"
                playsInline
                onTimeUpdate={onTime}
                onContextMenu={(e) => e.preventDefault()}
                aria-label={`Recording of ${studentName}`}
                className="w-full rounded-xl bg-black aspect-video"
              />
            ) : (
              <div className="rounded-xl bg-surface px-4 py-10 text-center text-sm text-muted">
                {recordingDeleted ? "This recording has been deleted. The transcripts and marks below are kept." : "No recording reached the server for this interview."}
              </div>
            )}
            <p className="text-xs text-muted mt-3 leading-relaxed">Click a question on the right to jump to where the student answered it.</p>
          </CardContent>
        </Card>

        {answers.map((a) => {
          const progress = stepText(a);
          return (
            <Card key={a.position} className={current === a.position ? "border-brand-500" : ""}>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle>Question {a.position + 1}</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={a.status === "ANSWERED" ? "success" : a.status === "SKIPPED" ? "neutral" : "warning"}>{STATUS_LABEL[a.status] ?? a.status}</Badge>
                  {a.score !== null && (
                    <Badge tone="brand">
                      {a.score} / {MAX_SCORE_PER_QUESTION}
                    </Badge>
                  )}
                  {a.needsReview && <Badge tone="warning">Needs your check</Badge>}
                </div>
              </CardHeader>
              <CardContent className="pt-3 space-y-3">
                <p className="text-sm text-ink leading-relaxed">{a.prompt}</p>
                {a.expected && <p className="text-xs text-muted">A good answer covers: {a.expected}</p>}

                {a.status === "ANSWERED" && a.startSec !== null && a.endSec !== null && (
                  <p className="text-xs text-muted">
                    {clock(a.startSec)} to {clock(a.endSec)} in the recording ({Math.round(a.endSec - a.startSec)} s){" "}
                    {recordingAvailable && (
                      <button type="button" onClick={() => seekTo(a.position, a.startSec ?? 0)} className="ml-1 text-brand-500 hover:text-brand-600">
                        Play this answer
                      </button>
                    )}
                  </p>
                )}
                {a.status === "SKIPPED" && <p className="text-sm text-muted">The student skipped this question. It gets 0 marks.</p>}
                {a.status !== "ANSWERED" && a.status !== "SKIPPED" && a.note && <p className="text-sm text-amber-900">{a.note}</p>}

                {progress && <p className="text-sm text-muted">{progress}</p>}

                {a.status === "ANSWERED" && a.transcriptStatus === "DONE" && (
                  <div>
                    <p className="text-xs font-medium text-ink">Transcript (made by speech recognition, it can contain mistakes)</p>
                    <p className="mt-1 text-sm text-ink leading-relaxed whitespace-pre-wrap bg-surface rounded-lg px-3 py-2">
                      {a.transcript?.trim() ? a.transcript : "Nothing was recognised."}
                    </p>
                  </div>
                )}

                {a.status === "ANSWERED" && a.needsReview && a.note && (
                  <p role="note" className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                    {a.note}
                  </p>
                )}

                {a.status === "ANSWERED" && a.evalStatus === "DONE" && a.score !== null && (
                  <div className="rounded-lg border border-border-soft px-3 py-3 space-y-2">
                    <p className="text-xs font-medium text-ink">AI advice (not a decision)</p>
                    <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted">
                      <li>Technical: <span className="text-ink font-medium">{a.technical}/{RUBRIC.technical}</span></li>
                      <li>Relevance: <span className="text-ink font-medium">{a.relevance}/{RUBRIC.relevance}</span></li>
                      <li>Completeness: <span className="text-ink font-medium">{a.completeness}/{RUBRIC.completeness}</span></li>
                      <li>Clarity: <span className="text-ink font-medium">{a.clarity}/{RUBRIC.clarity}</span></li>
                    </ul>
                    {a.feedback && <p className="text-sm text-ink leading-relaxed">{a.feedback}</p>}
                    {a.strengths.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-emerald-700">Strengths</p>
                        <ul className="list-disc pl-5 text-sm text-ink space-y-0.5">{a.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                      </div>
                    )}
                    {a.improvements.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-amber-700">Could improve</p>
                        <ul className="list-disc pl-5 text-sm text-ink space-y-0.5">{a.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-5 lg:sticky lg:top-4">
        <Card>
          <CardHeader>
            <CardTitle>Questions</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <ol className="space-y-1.5">
              {answers.map((a) => {
                const canSeek = recordingAvailable && a.status === "ANSWERED" && a.startSec !== null;
                const label = `Q${a.position + 1}`;
                const right =
                  a.status === "SKIPPED" ? "Skipped" : a.status === "ANSWERED" && a.startSec !== null ? clock(a.startSec) : a.status === "ANSWERED" ? "--:--" : "Not answered";
                const mark = a.score !== null ? `${a.score}/${MAX_SCORE_PER_QUESTION}` : a.needsReview ? "check" : "";
                return (
                  <li key={a.position}>
                    <button
                      type="button"
                      disabled={!canSeek}
                      onClick={() => seekTo(a.position, a.startSec ?? 0)}
                      aria-label={canSeek ? `Go to question ${a.position + 1} at ${right}` : `Question ${a.position + 1}: ${right}`}
                      className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                        current === a.position ? "border-brand-500 bg-surface" : "border-border-soft"
                      } ${canSeek ? "hover:bg-surface cursor-pointer" : "cursor-default text-muted"}`}
                    >
                      <span className="font-medium">
                        {label} <span className="font-normal text-muted">· {right}</span>
                      </span>
                      <span className="text-xs text-muted">{mark}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-3">
            {showReprocess && (
              <div>
                <Button size="sm" variant="secondary" disabled={isPending} onClick={() => run(() => reprocessVideoAction(attemptId), "Trying the failed steps again. This page updates by itself.")}>
                  Process again
                </Button>
                <p className="text-xs text-muted mt-1.5 leading-relaxed">Repeats only what failed (speech to text or AI marks). Finished results are not changed.</p>
              </div>
            )}
            {confirm === "" && (
              <div className="flex flex-col items-start gap-2">
                {recordingAvailable && (
                  <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setConfirm("delete")}>
                    Delete the recording
                  </Button>
                )}
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setConfirm("retake")}>
                  Let the student retake it
                </Button>
              </div>
            )}
            {confirm === "delete" && (
              <div role="group" aria-label="Confirm deleting the recording" className="rounded-lg border border-border-soft bg-surface px-3 py-3">
                <p className="text-sm text-ink leading-relaxed">Delete the video and audio now? The transcripts and marks stay. This cannot be undone.</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={isPending} onClick={() => run(() => deleteVideoRecordingAction(attemptId), "The recording was deleted.")}>
                    Yes, delete it
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm("")}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {confirm === "retake" && (
              <div role="group" aria-label="Confirm letting the student retake" className="rounded-lg border border-border-soft bg-surface px-3 py-3">
                <p className="text-sm text-ink leading-relaxed">
                  This removes this attempt, its recording and its marks, and lets {studentName} take the interview again. They are told by a notification.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={isPending} onClick={() => run(() => allowVideoRetakeAction(attemptId), "The student can take it again.", true)}>
                    Yes, allow a retake
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm("")}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
