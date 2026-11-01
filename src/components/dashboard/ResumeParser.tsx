"use client";

import { useState, useTransition } from "react";
import { parseResumeAction, deleteResumeAction } from "@/lib/actions/student";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Sparkles, Upload, FileText, Trash2 } from "lucide-react";
import type { ParsedResume } from "@/lib/ai";

interface SavedResume {
  studentId: string;
  fileName: string;
  size: number;
  uploadedAt: string;
}

export function ResumeParser({ saved }: { saved?: SavedResume | null }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setNotice(null);
    setResult(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("That file is too large. The limit is 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/resume", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed.");
        return;
      }
      router.refresh();
      if (!data.textFound) {
        setNotice(
          "Your PDF was saved and your placement cell and recruiters can view it, but we couldn't read any text from it (it may be a scan). Paste your resume text below to use AI parsing."
        );
        return;
      }
      setText(data.text);
      setNotice("PDF saved. Analyzing it with Gemma...");
      startTransition(async () => {
        try {
          const parsed = await parseResumeAction(data.text);
          setResult(parsed);
          setNotice("PDF saved and analyzed.");
        } catch (err) {
          setNotice(null);
          setError((err as Error).message);
        }
      });
    } catch {
      setError("Couldn't upload the file. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleRemove() {
    startTransition(async () => {
      try {
        await deleteResumeAction();
        setNotice("Resume PDF removed.");
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div>
      <div className="mb-4 rounded-xl border border-dashed border-border-soft bg-surface p-4">
        {saved ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <FileText className="h-4 w-4 text-brand-500 shrink-0" />
            <span className="text-ink truncate">{saved.fileName}</span>
            <span className="text-xs text-muted">
              {(saved.size / 1024).toFixed(0)} KB · uploaded {new Date(saved.uploadedAt).toLocaleDateString()}
            </span>
            <a href={`/api/resume/${saved.studentId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-500 hover:text-brand-600">
              View
            </a>
            <button type="button" onClick={handleRemove} disabled={isPending} className="ml-auto inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700">
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">Upload your resume as a PDF (max 5 MB). Your placement cell and recruiters of drives you apply to can view it.</p>
        )}
        <label className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm text-white cursor-pointer hover:bg-brand-600">
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading..." : saved ? "Replace PDF" : "Upload PDF"}
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={uploading || isPending}
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {notice && <p className="mt-3 text-sm text-brand-600">{notice}</p>}
      </div>

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
