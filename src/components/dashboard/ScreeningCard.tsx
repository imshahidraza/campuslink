"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { AiWaitNote } from "@/components/ui/Loader";
import { useToast } from "@/components/ui/Toast";
import {
  draftScreeningAction,
  publishScreeningAction,
  updateScreeningQuestionAction,
  removeScreeningQuestionAction,
  saveScreeningSettingsAction,
} from "@/lib/actions/screening";
import { MIN_MINUTES, MAX_MINUTES, type StoredQuestion } from "@/lib/screening";

interface Props {
  driveId: string;
  status: "NONE" | "DRAFT" | "PUBLISHED";
  minutes: number;
  minScore: number | null;
  questions: StoredQuestion[];
}

const field = "mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink";

export function ScreeningCard({ driveId, status, minutes, minScore, questions }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [mins, setMins] = useState(String(minutes));
  const [min, setMin] = useState(minScore === null ? "" : String(minScore));
  const mcqCount = questions.filter((q) => q.kind === "MCQ").length;

  function draft() {
    startTransition(async () => {
      const r = await draftScreeningAction(driveId);
      if (r.ok) {
        setEditing(null);
        toast("Questions drafted. Please read them before you publish.");
      } else toast(r.error, "error");
    });
  }

  function publish() {
    startTransition(async () => {
      const r = await publishScreeningAction(driveId);
      if (r.ok) toast("Published. Students who applied have been notified.");
      else toast(r.error, "error");
    });
  }

  function saveSettings() {
    startTransition(async () => {
      const r = await saveScreeningSettingsAction(driveId, status === "PUBLISHED" ? { minScore: min } : { minutes: mins, minScore: min });
      if (r.ok) toast("Settings saved.");
      else toast(r.error, "error");
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const r = await removeScreeningQuestionAction(driveId, id);
      if (r.ok) {
        setEditing(null);
        toast("Question removed.", "info");
      } else toast(r.error, "error");
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {status === "NONE" && <Badge>Not set up</Badge>}
        {status === "DRAFT" && <Badge tone="warning">Draft: not visible to students</Badge>}
        {status === "PUBLISHED" && <Badge tone="success">Published</Badge>}
        <span className="text-xs text-muted">Text interview · same questions for every student · {minutes} minutes</span>
      </div>

      {status === "NONE" && (
        <p className="text-sm text-muted mt-3 leading-relaxed">
          The AI drafts 5 multiple-choice questions and 2 short written questions from your job description. You read, edit
          and approve them before any student sees them. Students must finish it before you can shortlist them.
        </p>
      )}

      {questions.length > 0 && (
        <ol className="mt-4 space-y-4">
          {questions.map((q, i) =>
            editing === q.id ? (
              <li key={q.id}>
                <QuestionEditor
                  q={q}
                  number={i + 1}
                  busy={isPending}
                  onCancel={() => setEditing(null)}
                  onRemove={() => remove(q.id)}
                  onSave={(input) =>
                    startTransition(async () => {
                      const r = await updateScreeningQuestionAction(driveId, q.id, q.kind, input);
                      if (r.ok) {
                        setEditing(null);
                        toast("Question saved.");
                      } else toast(r.error, "error");
                    })
                  }
                />
              </li>
            ) : (
              <li key={q.id} className="rounded-xl border border-border-soft bg-surface px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-ink">
                    {i + 1}. {q.prompt}
                    <span className="ml-2 text-[11px] font-normal text-muted">{q.kind === "MCQ" ? "Multiple choice" : "Written answer"}</span>
                  </p>
                  {status !== "PUBLISHED" && (
                    <button type="button" onClick={() => setEditing(q.id)} disabled={isPending} className="shrink-0 text-xs text-brand-500 hover:text-brand-600">
                      Edit
                    </button>
                  )}
                </div>
                {q.kind === "MCQ" ? (
                  <ul className="mt-2 space-y-1">
                    {q.options.map((o, oi) => (
                      <li key={oi} className={`text-sm flex items-start gap-2 ${oi === q.correctIndex ? "text-ink font-medium" : "text-muted"}`}>
                        <span className="shrink-0 w-5">{String.fromCharCode(65 + oi)}.</span>
                        <span className="min-w-0 break-words">{o}</span>
                        {oi === q.correctIndex && (
                          <span className="shrink-0 inline-flex items-center gap-1 text-xs text-emerald-700">
                            <Check className="h-3.5 w-3.5" /> Correct answer
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  q.lookFor && <p className="mt-2 text-xs text-muted">A good answer covers: {q.lookFor}</p>
                )}
              </li>
            )
          )}
        </ol>
      )}

      {status !== "PUBLISHED" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm" variant={status === "DRAFT" ? "secondary" : "primary"} onClick={draft} disabled={isPending}>
            {status === "DRAFT" ? "Draft again" : "Draft questions with AI"}
          </Button>
          {status === "DRAFT" && (
            <Button size="sm" onClick={publish} disabled={isPending || editing !== null}>
              Approve and publish
            </Button>
          )}
          <AiWaitNote show={isPending} />
        </div>
      )}
      {status === "DRAFT" && (
        <p className="text-xs text-muted mt-3 leading-relaxed">
          The AI can make mistakes. Check that every question is fair for the role and that the marked answer is really
          correct. You can edit or remove any question. &quot;Draft again&quot; replaces all of them. Once published, the questions
          can&apos;t be changed or replaced.
        </p>
      )}

      <div className="mt-5 pt-4 border-t border-border-soft">
        <p className="text-sm font-medium text-ink">Settings</p>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          <label className="block text-xs text-muted">
            Time limit (minutes)
            <input
              type="number"
              inputMode="numeric"
              min={MIN_MINUTES}
              max={MAX_MINUTES}
              value={mins}
              onChange={(e) => setMins(e.target.value)}
              disabled={status === "PUBLISHED" || isPending}
              className={field}
            />
            <span className="block mt-1">{status === "PUBLISHED" ? "Fixed once published." : `${MIN_MINUTES} to ${MAX_MINUTES}.`}</span>
          </label>
          <label className="block text-xs text-muted">
            Your minimum correct answers (optional)
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={mcqCount || 5}
              value={min}
              onChange={(e) => setMin(e.target.value)}
              disabled={isPending}
              placeholder="No minimum"
              className={field}
            />
            <span className="block mt-1 leading-relaxed">Students below it are listed separately in the results. Nobody is removed.</span>
          </label>
        </div>
        <Button size="sm" variant="secondary" className="mt-3" onClick={saveSettings} disabled={isPending}>
          Save settings
        </Button>
      </div>
    </div>
  );
}

function QuestionEditor({
  q,
  number,
  busy,
  onSave,
  onCancel,
  onRemove,
}: {
  q: StoredQuestion;
  number: number;
  busy: boolean;
  onSave: (input: { prompt: string; options?: string[]; correctIndex?: number; lookFor?: string }) => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const [prompt, setPrompt] = useState(q.prompt);
  const [options, setOptions] = useState<string[]>(q.options.length ? q.options : ["", "", "", ""]);
  const [correct, setCorrect] = useState<number>(q.correctIndex ?? 0);
  const [lookFor, setLookFor] = useState(q.lookFor ?? "");

  return (
    <div className="rounded-xl border border-brand-500 bg-white px-4 py-3 space-y-3">
      <p className="text-sm font-medium text-ink">Editing question {number}</p>
      <label className="block text-xs text-muted">
        Question
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} maxLength={300} className={field} />
      </label>
      {q.kind === "MCQ" ? (
        <fieldset className="space-y-2">
          <legend className="text-xs text-muted">Options. Select the circle next to the correct answer.</legend>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name={`correct-${q.id}`} checked={correct === i} onChange={() => setCorrect(i)} aria-label={`Option ${String.fromCharCode(65 + i)} is correct`} />
              <span className="w-5 text-sm text-muted">{String.fromCharCode(65 + i)}.</span>
              <input
                value={o}
                onChange={(e) => setOptions((prev) => prev.map((x, xi) => (xi === i ? e.target.value : x)))}
                maxLength={150}
                aria-label={`Option ${String.fromCharCode(65 + i)}`}
                className="w-full rounded-lg border border-border-soft bg-white px-3 py-1.5 text-sm text-ink"
              />
            </div>
          ))}
        </fieldset>
      ) : (
        <label className="block text-xs text-muted">
          A good answer covers (only for you and the AI comments; students never see it)
          <textarea value={lookFor} onChange={(e) => setLookFor(e.target.value)} rows={2} maxLength={300} className={field} />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => onSave(q.kind === "MCQ" ? { prompt, options, correctIndex: correct } : { prompt, lookFor })}
        >
          Save question
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
          Remove question
        </Button>
      </div>
    </div>
  );
}
