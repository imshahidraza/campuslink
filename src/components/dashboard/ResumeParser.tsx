"use client";

import { useState, useTransition } from "react";
import { parseResumeAction } from "@/lib/actions/student";
import { Button } from "@/components/ui/Button";
import { Sparkles } from "lucide-react";
import type { ParsedResume } from "@/lib/ai";

export function ResumeParser() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ParsedResume | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleParse() {
    setError(null);
    startTransition(async () => {
      try {
        const parsed = await parseResumeAction(text);
        setResult(parsed);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="Paste your resume text here — Gemma will extract skills, projects, certifications and experience, and merge them into your profile."
        className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-brand-300"
      />
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={handleParse} disabled={isPending || text.trim().length < 20} size="sm">
          <Sparkles className="h-4 w-4" />
          {isPending ? "Analyzing with Gemma..." : "Parse resume with AI"}
        </Button>
        {isPending && (
          <span className="text-xs text-muted">
            First run can take a minute on local hardware — Gemma is thinking.
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>
      )}

      {result && (
        <div className="mt-4 rounded-xl bg-brand-100/40 border border-brand-200 p-4 text-sm space-y-2">
          <p className="text-ink">
            <span className="font-medium">Skills found: </span>
            {result.skills.join(", ") || "none"}
          </p>
          <p className="text-ink">
            <span className="font-medium">Technologies: </span>
            {result.technologies.join(", ") || "none"}
          </p>
          <p className="text-ink">
            <span className="font-medium">Projects: </span>
            {result.projects.map((p) => p.title).join(", ") || "none"}
          </p>
          <p className="text-muted text-xs mt-2">
            Merged into your profile below — you can still edit it manually.
          </p>
        </div>
      )}
    </div>
  );
}
