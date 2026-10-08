"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAssessmentScoresAction } from "@/lib/actions/college";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Upload } from "lucide-react";

const EXAMPLE = `Roll No, Aptitude, Reasoning, Verbal, Communication
21CS101, 88, 84, 79, 90
21CS102, 65, 70, 60, 72`;

export function ScoresPasteForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ updated: number; errors: string[] } | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    startTransition(async () => {
      const r = await addAssessmentScoresAction(text);
      setResult(r);
      if (r.updated > 0) {
        toast(`Updated scores for ${r.updated} student${r.updated === 1 ? "" : "s"}.`);
        setText("");
        router.refresh();
      }
      if (r.errors.length > 0) {
        toast(`${r.errors.length} row(s) skipped — see details below.`, "error");
      }
    });
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result || ""));
      toast(`Loaded ${file.name} — review below, then click Update scores.`, "info");
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-sm text-ink font-medium">One student per row:</p>
        <p className="text-xs text-muted mt-1">
          Roll No, Aptitude, Reasoning, Verbal, Communication — any column order with a header row, or that
          exact order without one. Only students who&apos;ve already signed up can receive scores — leave a
          column blank to skip updating it for that student.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={EXAMPLE}
        className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm text-ink font-mono placeholder:text-muted/60 focus:outline-none focus:border-brand-300"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={isPending || !text.trim()}>
          {isPending ? "Updating..." : "Update scores"}
        </Button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-600"
        >
          <Upload className="h-3.5 w-3.5" /> Import .csv file
        </button>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
        <button type="button" onClick={() => setText(EXAMPLE)} className="text-xs text-brand-500 hover:text-brand-600">
          Fill example
        </button>
      </div>

      {result && result.errors.length > 0 && (
        <div className="rounded-xl border border-border-soft bg-surface p-4 text-sm space-y-2">
          <p className="text-rose-600 font-medium">{result.errors.length} row(s) skipped:</p>
          <ul className="mt-1 space-y-1 text-xs text-muted list-disc list-inside">
            {result.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
