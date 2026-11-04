"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAssessmentScoresAction } from "@/lib/actions/college";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Upload } from "lucide-react";

// Shown only as a grey placeholder. Nothing here is ever saved unless the TPO types or imports it.
const PLACEHOLDER = `Roll No, Aptitude, Reasoning, Verbal, Communication
(one student per row)`;

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
        toast(`${r.errors.length} row${r.errors.length === 1 ? "" : "s"} skipped. See the details below.`, "error");
      }
    });
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result || ""));
      toast(`Loaded ${file.name}. Review it below, then click Update scores.`, "info");
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-sm text-ink font-medium">One student per row:</p>
        <p className="text-xs text-muted mt-1">
          Roll No, Aptitude, Reasoning, Verbal, Communication. Use any column order with a header row, or this exact
          order without one. Scores work for students who have signed up and for those still waiting to sign up. Leave
          a cell blank to keep the current score.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={PLACEHOLDER}
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
      </div>

      {result && result.errors.length > 0 && (
        <div className="rounded-xl border border-border-soft bg-surface p-4 text-sm space-y-2">
          <p className="text-rose-600 font-medium">{result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped:</p>
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
