"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { AiWaitNote } from "@/components/ui/Loader";
import { useToast } from "@/components/ui/Toast";
import { draftScreeningAction, publishScreeningAction } from "@/lib/actions/screening";
import type { StoredQuestion } from "@/lib/screening";

interface Props {
  driveId: string;
  status: "NONE" | "DRAFT" | "PUBLISHED";
  minutes: number;
  questions: StoredQuestion[];
}

export function ScreeningCard({ driveId, status, minutes, questions }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function draft() {
    startTransition(async () => {
      const r = await draftScreeningAction(driveId);
      if (r.ok) toast("Questions drafted. Please read them before you publish.");
      else toast(r.error, "error");
    });
  }

  function publish() {
    startTransition(async () => {
      const r = await publishScreeningAction(driveId);
      if (r.ok) toast("Published.");
      else toast(r.error, "error");
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
          The AI drafts 5 multiple-choice questions and 2 short written questions from your job description. You read
          and approve them before any student sees them.
        </p>
      )}

      {questions.length > 0 && (
        <ol className="mt-4 space-y-4">
          {questions.map((q, i) => (
            <li key={q.id} className="rounded-xl border border-border-soft bg-surface px-4 py-3">
              <p className="text-sm font-medium text-ink">
                {i + 1}. {q.prompt}
                <span className="ml-2 text-[11px] font-normal text-muted">{q.kind === "MCQ" ? "Multiple choice" : "Written answer"}</span>
              </p>
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
          ))}
        </ol>
      )}

      {status !== "PUBLISHED" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm" variant={status === "DRAFT" ? "secondary" : "primary"} onClick={draft} disabled={isPending}>
            {status === "DRAFT" ? "Draft again" : "Draft questions with AI"}
          </Button>
          {status === "DRAFT" && (
            <Button size="sm" onClick={publish} disabled={isPending}>
              Approve and publish
            </Button>
          )}
          <AiWaitNote show={isPending} />
        </div>
      )}
      {status === "DRAFT" && (
        <p className="text-xs text-muted mt-3 leading-relaxed">
          The AI can make mistakes. Check that every question is fair for the role and that the marked answer is really
          correct. Once published, the questions can&apos;t be replaced.
        </p>
      )}
    </div>
  );
}
