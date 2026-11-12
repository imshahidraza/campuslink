"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { startScreeningAction, saveScreeningAnswersAction, submitScreeningAction } from "@/lib/actions/screeningStudent";
import { SHORT_ANSWER_MAX, type PresentedQuestion, type Answers } from "@/lib/screening";

export function ScreeningStart({ driveId, minutes }: { driveId: string; minutes: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    const r = await startScreeningAction(driveId);
    if (r.ok) router.refresh();
    else {
      toast(r.error, "error");
      setBusy(false);
    }
  }

  return (
    <Button onClick={start} disabled={busy}>
      {busy ? "Starting..." : `Start (${minutes} minutes)`}
    </Button>
  );
}

function clock(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function ScreeningTest({
  driveId,
  remainingMs,
  questions,
  initialAnswers,
}: {
  driveId: string;
  remainingMs: number;
  questions: PresentedQuestion[];
  initialAnswers: Answers;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const answersRef = useRef<Answers>(initialAnswers);
  const [endAt] = useState(() => Date.now() + remainingMs); // counted from the server's remaining time, so a wrong PC clock can't help
  const [now, setNow] = useState(() => Date.now());
  const [saveNote, setSaveNote] = useState<"" | "saving" | "saved" | "error">("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const dirty = useRef(false);

  async function submit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    const r = await submitScreeningAction(driveId, answersRef.current);
    if (r.ok) {
      router.refresh();
    } else {
      toast(r.error, "error");
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  // The clock. When it reaches zero the answers are submitted automatically.
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= endAt) {
        clearInterval(id);
        void submit();
      }
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endAt]);

  // Saves shortly after the student stops typing or clicking.
  useEffect(() => {
    if (!dirty.current) return;
    const id = setTimeout(async () => {
      setSaveNote("saving");
      const r = await saveScreeningAnswersAction(driveId, answersRef.current);
      setSaveNote(r.ok ? "saved" : "error");
    }, 800);
    return () => clearTimeout(id);
  }, [answers, driveId]);

  function setAnswer(id: string, value: number | string) {
    const next = { ...answersRef.current };
    if (value === "") delete next[id];
    else next[id] = value;
    answersRef.current = next;
    dirty.current = true;
    setConfirming(false);
    setAnswers(next);
  }

  const left = Math.max(0, endAt - now);
  const answered = questions.filter((q) => answers[q.id] !== undefined).length;
  const urgent = left <= 120_000;

  return (
    <div className="mt-6">
      <div className="sticky top-0 z-20 -mx-1 mb-5 rounded-xl border border-border-soft bg-white/95 backdrop-blur px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink">
          Answered {answered} of {questions.length}
          <span className="ml-3 text-xs text-muted" aria-live="polite">
            {saveNote === "saving" ? "Saving..." : saveNote === "saved" ? "Saved" : saveNote === "error" ? "Could not save. Check your connection." : ""}
          </span>
        </p>
        <p className={`text-sm font-semibold tabular-nums ${urgent ? "text-rose-700" : "text-ink"}`} role="timer">
          {urgent && "Hurry. "}Time left {clock(left)}
        </p>
      </div>

      <ol className="space-y-5">
        {questions.map((q, i) => (
          <li key={q.id}>
            <Card>
              <CardContent className="pt-5">
                {q.kind === "MCQ" ? (
                  <fieldset>
                    <legend className="text-sm font-medium text-ink leading-relaxed">
                      {i + 1}. {q.prompt}
                    </legend>
                    <div className="mt-3 space-y-2">
                      {q.options.map((o, oi) => {
                        const id = `${q.id}-${o.i}`;
                        return (
                          <label
                            key={id}
                            htmlFor={id}
                            className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm cursor-pointer ${
                              answers[q.id] === o.i ? "border-brand-500 bg-surface" : "border-border-soft hover:bg-surface"
                            }`}
                          >
                            <input
                              id={id}
                              type="radio"
                              name={q.id}
                              checked={answers[q.id] === o.i}
                              onChange={() => setAnswer(q.id, o.i)}
                              disabled={submitting}
                              className="mt-0.5"
                            />
                            <span className="min-w-0 break-words text-ink">
                              <span className="text-muted mr-1.5">{String.fromCharCode(65 + oi)}.</span>
                              {o.text}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ) : (
                  <div>
                    <label htmlFor={q.id} className="text-sm font-medium text-ink leading-relaxed block">
                      {i + 1}. {q.prompt}
                    </label>
                    <textarea
                      id={q.id}
                      rows={5}
                      maxLength={SHORT_ANSWER_MAX}
                      value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      disabled={submitting}
                      placeholder="Write 2 to 4 sentences. Press Enter for a new line."
                      className="mt-3 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink leading-relaxed"
                    />
                    <p className="text-xs text-muted mt-1 text-right">
                      {typeof answers[q.id] === "string" ? (answers[q.id] as string).length : 0} / {SHORT_ANSWER_MAX}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!confirming ? (
          <Button onClick={() => setConfirming(true)} disabled={submitting}>
            Submit
          </Button>
        ) : (
          <>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Submitting..." : "Yes, submit now"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={submitting}>
              Keep working
            </Button>
          </>
        )}
        <span className="text-xs text-muted">
          {confirming
            ? `You answered ${answered} of ${questions.length}. You cannot change your answers after you submit.`
            : "You can submit early. Otherwise your answers are submitted when the time ends."}
        </span>
      </div>
    </div>
  );
}
