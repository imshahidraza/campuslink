"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { AiWaitNote } from "@/components/ui/Loader";
import { useToast } from "@/components/ui/Toast";
import {
  draftVideoQuestionsAction,
  publishVideoQuestionsAction,
  startBlankVideoDraftAction,
  updateVideoQuestionAction,
} from "@/lib/actions/videoSetup";
import { VIDEO_MINUTES, VIDEO_QUESTION_COUNT } from "@/lib/video";

interface Q {
  id: string;
  position: number;
  prompt: string;
  expected: string | null;
}

interface Props {
  driveId: string;
  status: "NONE" | "DRAFT" | "PUBLISHED";
  questions: Q[];
}

const field = "mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink";

export function VideoSetupCard({ driveId, status, questions }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>, done: string, after?: () => void) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        after?.();
        toast(done);
      } else toast(r.error, "error");
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {status === "NONE" && <Badge>Not set up</Badge>}
        {status === "DRAFT" && <Badge tone="warning">Draft: not visible to students</Badge>}
        {status === "PUBLISHED" && <Badge tone="success">Published</Badge>}
        <span className="text-xs text-muted">
          Recorded video interview · {VIDEO_QUESTION_COUNT} spoken questions · {VIDEO_MINUTES} minutes in all
        </span>
      </div>

      {status === "NONE" && (
        <p className="text-sm text-muted mt-3 leading-relaxed">
          An optional second round. The student answers {VIDEO_QUESTION_COUNT} questions out loud on camera, in one continuous recording of at
          most {VIDEO_MINUTES} minutes. Speech is turned into text on this computer, and the AI gives you advice marks for each answer. You
          watch the recording, read the transcript and decide. The AI drafts the questions from your job description, you approve them, and
          students must finish it before you can shortlist them. You can use this together with the text interview or instead of it.
        </p>
      )}

      {questions.length > 0 && (
        <ol className="mt-4 space-y-3">
          {questions.map((q, i) =>
            editing === q.id ? (
              <li key={q.id}>
                <QuestionEditor
                  q={q}
                  number={i + 1}
                  busy={isPending}
                  onCancel={() => setEditing(null)}
                  onSave={(input) =>
                    run(() => updateVideoQuestionAction(driveId, q.id, input), "Question saved.", () => setEditing(null))
                  }
                />
              </li>
            ) : (
              <li key={q.id} className="rounded-xl border border-border-soft bg-surface px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-ink">
                    {i + 1}. {q.prompt || <span className="text-muted font-normal">(empty: write this question)</span>}
                  </p>
                  {status !== "PUBLISHED" && (
                    <button type="button" onClick={() => setEditing(q.id)} disabled={isPending} className="shrink-0 text-xs text-brand-500 hover:text-brand-600">
                      Edit
                    </button>
                  )}
                </div>
                {q.expected && <p className="mt-2 text-xs text-muted">A good answer covers: {q.expected}</p>}
              </li>
            )
          )}
        </ol>
      )}

      {status !== "PUBLISHED" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant={status === "DRAFT" ? "secondary" : "primary"}
            onClick={() => run(() => draftVideoQuestionsAction(driveId), "Questions drafted. Please read them before you publish.", () => setEditing(null))}
            disabled={isPending}
          >
            {status === "DRAFT" ? "Draft again with AI" : "Draft questions with AI"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => run(() => startBlankVideoDraftAction(driveId), "Five empty questions are ready. Write them and publish.", () => setEditing(null))} disabled={isPending}>
            Write them myself
          </Button>
          {status === "DRAFT" && (
            <Button size="sm" onClick={() => run(() => publishVideoQuestionsAction(driveId), "Published. Students who applied have been notified.")} disabled={isPending || editing !== null}>
              Approve and publish
            </Button>
          )}
          <AiWaitNote show={isPending} />
        </div>
      )}
      {status === "DRAFT" && (
        <p className="text-xs text-muted mt-3 leading-relaxed">
          The AI can make mistakes. Check that every question is fair for the role and can be answered out loud in one to three minutes. &quot;Draft
          again&quot; and &quot;Write them myself&quot; replace all five. Once published, the questions can&apos;t be changed or replaced.
        </p>
      )}
      {status === "PUBLISHED" && (
        <p className="text-xs text-muted mt-3 leading-relaxed">
          Finished interviews appear in <strong>AI Interviews</strong> in the menu. Recordings are deleted automatically after 30 days (you can delete one
          earlier). The transcripts and the AI&apos;s advice stay.
        </p>
      )}
    </div>
  );
}

function QuestionEditor({
  q,
  number,
  busy,
  onSave,
  onCancel,
}: {
  q: Q;
  number: number;
  busy: boolean;
  onSave: (input: { prompt: string; expected: string }) => void;
  onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState(q.prompt);
  const [expected, setExpected] = useState(q.expected ?? "");
  return (
    <div className="rounded-xl border border-brand-500 bg-white px-4 py-3 space-y-3">
      <p className="text-sm font-medium text-ink">Editing question {number}</p>
      <label className="block text-xs text-muted">
        Question (spoken answer, 15 to 250 characters)
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} maxLength={250} className={field} />
      </label>
      <label className="block text-xs text-muted">
        A good answer covers (only for you and the AI marking; students never see it)
        <textarea value={expected} onChange={(e) => setExpected(e.target.value)} rows={2} maxLength={400} className={field} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => onSave({ prompt, expected })}>
          Save question
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
