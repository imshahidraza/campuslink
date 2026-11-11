"use client";

import { useState, useTransition } from "react";
import { generateMockInterviewAction } from "@/lib/actions/assistant";
import { Button } from "@/components/ui/Button";
import { AiWaitNote } from "@/components/ui/Loader";
import { useToast } from "@/components/ui/Toast";
import type { MockInterview, MockQuestion } from "@/lib/ai";

export interface PracticeDrive {
  id: string;
  label: string;
}

function Section({ title, items }: { title: string; items: MockQuestion[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <ol className="mt-2 space-y-2">
        {items.map((q, i) => (
          <li key={i} className="rounded-lg border border-border-soft bg-surface p-3 text-sm">
            <p className="text-ink">
              {i + 1}. {q.question}
            </p>
            {q.looksFor && (
              <details className="mt-1.5">
                <summary className="text-xs text-brand-500 cursor-pointer">What a good answer covers</summary>
                <p className="mt-1 text-xs text-muted leading-relaxed">{q.looksFor}</p>
              </details>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function MockInterviewPanel({ drives }: { drives: PracticeDrive[] }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [driveId, setDriveId] = useState(drives[0]?.id ?? "");
  const [data, setData] = useState<{ label: string; set: MockInterview } | null>(null);

  if (drives.length === 0) {
    return <p className="text-sm text-muted">No drives are open right now. Come back when a drive opens and practise for it here.</p>;
  }

  return (
    <div>
      <label className="block text-xs text-muted">
        Choose a drive to practise for
        <select
          value={driveId}
          onChange={(e) => setDriveId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink"
        >
          {drives.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          disabled={isPending || !driveId}
          onClick={() =>
            startTransition(async () => {
              const r = await generateMockInterviewAction(driveId);
              if (!r.ok) return toast(r.error, "error");
              setData({ label: drives.find((d) => d.id === driveId)?.label ?? "", set: r.data });
            })
          }
        >
          {isPending ? "Preparing questions..." : data ? "Make a new set" : "Make practice questions"}
        </Button>
        <AiWaitNote show={isPending} label="The AI is writing your questions. This can take up to a minute." />
      </div>

      {data && (
        <div className="mt-6 space-y-6">
          <p className="text-sm text-ink font-medium">Practice questions for {data.label}</p>
          <Section title="Technical" items={data.set.technical} />
          <Section title="About the role" items={data.set.roleBased} />
          <Section title="Behavioural" items={data.set.behavioural} />
          {data.set.tips.length > 0 && (
            <div>
              <p className="text-sm font-medium text-ink">Preparation tips</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-muted space-y-1">
                {data.set.tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted">
            These questions are practice material made by the AI from the job description. They are not the company&apos;s real questions, and nothing here is saved or
            shown to a recruiter.
          </p>
        </div>
      )}
    </div>
  );
}
