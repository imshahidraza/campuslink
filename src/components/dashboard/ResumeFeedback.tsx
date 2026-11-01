"use client";

import { useState, useTransition } from "react";
import { Sparkles, ThumbsUp, Wrench } from "lucide-react";
import { reviewResumeAction } from "@/lib/actions/student";
import { Button } from "@/components/ui/Button";

export interface ResumeFeedbackData {
  strengths: string[];
  improvements: { issue: string; suggestion: string }[];
}

export function ResumeFeedback({ existing, canReview }: { existing: ResumeFeedbackData | null; canReview: boolean }) {
  const [data, setData] = useState<ResumeFeedbackData | null>(existing);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        setData((await reviewResumeAction()) as ResumeFeedbackData);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div>
      <p className="text-sm text-muted">
        Get specific, friendly suggestions on your resume. It&apos;s advice only — nothing here affects your eligibility or score.
      </p>

      {data && (
        <div className="mt-4 space-y-4">
          {data.strengths.length > 0 && (
            <div>
              <p className="text-sm font-medium text-ink flex items-center gap-1.5">
                <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" /> What&apos;s working
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted list-disc list-inside">
                {data.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {data.improvements.length > 0 && (
            <div>
              <p className="text-sm font-medium text-ink flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 text-brand-500" /> Make it stronger
              </p>
              <div className="mt-2 space-y-2">
                {data.improvements.map((im, i) => (
                  <div key={i} className="rounded-lg border border-border-soft bg-surface p-3 text-sm">
                    <p className="text-ink">{im.issue}</p>
                    <p className="text-muted mt-1">{im.suggestion}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={run} disabled={isPending || !canReview}>
          <Sparkles className="h-3.5 w-3.5" />
          {isPending ? "Reading your resume..." : data ? "Review again" : "Review my resume"}
        </Button>
        {!canReview && <span className="text-xs text-muted">Upload and parse your resume first.</span>}
        {isPending && <span className="text-xs text-muted">This can take a minute on local hardware.</span>}
      </div>
    </div>
  );
}
