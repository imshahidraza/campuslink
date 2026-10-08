"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addStudentRosterAction } from "@/lib/actions/college";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Upload } from "lucide-react";

const EXAMPLE = `Roll No, Name, Program, Specialization, CGPA, Backlogs, Graduation Year
21CS101, Riya Sharma, B.Tech, CSE, 8.7, 0, 2027
21CS102, Aman Verma, B.Tech, CSE, 6.2, 1, 2027
21IT045, Sara Iyer, B.Tech, IT, 7.9, 0, 2027`;

export function RosterPasteForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ added: number; errors: string[] } | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    startTransition(async () => {
      const r = await addStudentRosterAction(text);
      setResult(r);
      if (r.added > 0) {
        toast(`Added ${r.added} student${r.added === 1 ? "" : "s"} to the pending roster.`);
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
      toast(`Loaded ${file.name} — review below, then click Add students.`, "info");
    };
    reader.readAsText(file);
    e.target.value = ""; // allow re-selecting the same file later
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-sm text-ink font-medium">One student per row:</p>
        <p className="text-xs text-muted mt-1">
          Roll No, Name, Program, Specialization, CGPA, Backlogs, Graduation Year — in any column order, as long
          as the first row has headers. No header row? Then that exact order is assumed. Paste from a
          spreadsheet (tab-separated), type comma-separated rows, or import a .csv file below. Program can be
          anything — it&apos;s not limited to a fixed list.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={EXAMPLE}
        className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm text-ink font-mono placeholder:text-muted/60 focus:outline-none focus:border-brand-300"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={isPending || !text.trim()}>
          {isPending ? "Adding..." : "Add students"}
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
