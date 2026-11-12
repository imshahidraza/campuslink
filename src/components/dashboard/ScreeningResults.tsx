"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { AiWaitNote } from "@/components/ui/Loader";
import { useToast } from "@/components/ui/Toast";
import {
  loadScreeningDetailAction,
  generateScreeningCommentsAction,
  generateScreeningCommentsForDriveAction,
  type ScreeningDetail,
} from "@/lib/actions/screening";
import type { AttemptState } from "@/lib/screening";

export interface ResultRow {
  applicationId: string;
  name: string;
  rollNo: string;
  state: AttemptState;
  correct: number | null;
  total: number | null;
  submittedAt: string | null;
  hasComments: boolean;
  leaveCount: number;
}

type SortKey = "high" | "low" | "name";

export function ScreeningResults({ driveId, rows, minScore }: { driveId: string; rows: ResultRow[]; minScore: number | null }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [sort, setSort] = useState<SortKey>("high");

  const done = rows.filter((r) => r.state === "SUBMITTED");
  const notDone = rows.filter((r) => r.state !== "SUBMITTED").sort((a, b) => a.name.localeCompare(b.name));
  const score = (r: ResultRow) => r.correct ?? 0;
  const ordered = done.slice().sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name) : sort === "high" ? score(b) - score(a) || a.name.localeCompare(b.name) : score(a) - score(b) || a.name.localeCompare(b.name)
  );
  const below = minScore === null ? [] : ordered.filter((r) => score(r) < minScore);
  const meets = minScore === null ? ordered : ordered.filter((r) => score(r) >= minScore);
  const withoutComments = done.filter((r) => !r.hasComments).length;

  function commentsForAll() {
    startTransition(async () => {
      const r = await generateScreeningCommentsForDriveAction(driveId);
      if (r.ok) toast(r.data.done === 0 ? "Nothing left to comment on." : `AI comments written for ${r.data.done} student${r.data.done === 1 ? "" : "s"}.${r.data.more ? " Click again for the next ones." : ""}`);
      else toast(r.error, "error");
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted">No one has applied yet. Results appear here as students finish the interview.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink">
          {done.length} of {rows.length} finished
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-muted flex items-center gap-2">
            Sort by
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-lg border border-border-soft bg-white px-2 py-1 text-sm text-ink">
              <option value="high">Highest score first</option>
              <option value="low">Lowest score first</option>
              <option value="name">Name A to Z</option>
            </select>
          </label>
          {withoutComments > 0 && (
            <Button size="sm" variant="secondary" onClick={commentsForAll} disabled={isPending}>
              AI comments for {Math.min(withoutComments, 10)} student{Math.min(withoutComments, 10) === 1 ? "" : "s"}
            </Button>
          )}
          <AiWaitNote show={isPending} label="The AI is reading the written answers. This can take a few minutes." />
        </div>
      </div>
      <p className="text-xs text-muted mt-2 leading-relaxed">
        The score counts correct multiple-choice answers. Written answers are not scored: read them, and use the AI comments as
        a help only. The decision is yours.
      </p>

      <Section title={minScore === null ? "Finished" : `Finished, at or above your minimum (${minScore})`} rows={meets} driveId={driveId} empty="No one yet." />
      {minScore !== null && (
        <Section
          title={`Below your minimum (${minScore})`}
          note="These students are not removed. You can open their answers and still shortlist them if you choose."
          rows={below}
          driveId={driveId}
          empty="No one."
        />
      )}
      <Section title="Not finished" rows={notDone} driveId={driveId} empty="Everyone has finished." />
    </div>
  );
}

function Section({ title, note, rows, driveId, empty }: { title: string; note?: string; rows: ResultRow[]; driveId: string; empty: string }) {
  return (
    <div className="mt-5">
      <p className="text-sm font-medium text-ink">
        {title} <span className="text-muted font-normal">({rows.length})</span>
      </p>
      {note && <p className="text-xs text-muted mt-1">{note}</p>}
      <div className="mt-2 rounded-xl border border-border-soft divide-y divide-border-soft">
        {rows.length === 0 && <p className="px-4 py-3 text-sm text-muted">{empty}</p>}
        {rows.map((r) => (
          <ResultItem key={r.applicationId} row={r} driveId={driveId} />
        ))}
      </div>
    </div>
  );
}

function ResultItem({ row, driveId }: { row: ResultRow; driveId: string }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ScreeningDetail | null>(null);
  void driveId;

  function load() {
    startTransition(async () => {
      const r = await loadScreeningDetailAction(row.applicationId);
      if (r.ok) setDetail(r.data);
      else toast(r.error, "error");
    });
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail) load();
  }

  function comments() {
    startTransition(async () => {
      const g = await generateScreeningCommentsAction(row.applicationId);
      if (!g.ok) {
        toast(g.error, "error");
        return;
      }
      const r = await loadScreeningDetailAction(row.applicationId);
      if (r.ok) setDetail(r.data);
      toast("AI comments written.");
    });
  }

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink break-words">{row.name}</p>
          <p className="text-xs text-muted">{row.rollNo}</p>
        </div>
        <div className="flex items-center gap-3">
          {row.state === "SUBMITTED" ? (
            <>
              {row.leaveCount > 0 && (
                <Badge tone="warning">
                  Left the page {row.leaveCount} time{row.leaveCount === 1 ? "" : "s"}
                </Badge>
              )}
              <span className="text-sm font-semibold text-ink whitespace-nowrap">
                {row.correct ?? 0} / {row.total ?? 0} correct
              </span>
              <button type="button" onClick={toggle} className="text-xs text-brand-500 hover:text-brand-600" aria-expanded={open}>
                {open ? "Hide answers" : "View answers"}
              </button>
            </>
          ) : (
            <Badge>{row.state === "IN_PROGRESS" ? "In progress" : "Not started"}</Badge>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {isPending && !detail && <p className="text-xs text-muted">Loading...</p>}
          {detail && (
            <>
              <p className="text-xs text-muted">
                Submitted {new Date(detail.submittedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
                {detail.autoSubmitted ? " (time ran out, saved answers were submitted)" : ""}
              </p>
              {detail.questions.map((q, i) => (
                <div key={q.id} className="rounded-lg bg-surface border border-border-soft px-3 py-2.5">
                  <p className="text-sm text-ink">
                    {i + 1}. {q.prompt}
                  </p>
                  {q.kind === "MCQ" ? (
                    <ul className="mt-1.5 space-y-0.5">
                      {q.options.map((o, oi) => (
                        <li key={oi} className={`text-xs flex items-start gap-1.5 ${oi === q.correctIndex ? "text-emerald-700 font-medium" : q.answer === oi ? "text-rose-700" : "text-muted"}`}>
                          <span className="w-4 shrink-0">{String.fromCharCode(65 + oi)}.</span>
                          <span className="min-w-0 break-words">{o}</span>
                          {oi === q.correctIndex && <span className="inline-flex items-center gap-0.5 shrink-0"><Check className="h-3 w-3" /> correct</span>}
                          {q.answer === oi && oi !== q.correctIndex && <span className="inline-flex items-center gap-0.5 shrink-0"><X className="h-3 w-3" /> student&apos;s answer</span>}
                          {q.answer === oi && oi === q.correctIndex && <span className="shrink-0">(student&apos;s answer)</span>}
                        </li>
                      ))}
                      {q.answer === null && <li className="text-xs text-muted">Not answered.</li>}
                    </ul>
                  ) : (
                    <>
                      <p className="mt-1.5 text-sm text-ink whitespace-pre-line break-words">{typeof q.answer === "string" ? q.answer : <span className="text-muted">Not answered.</span>}</p>
                      {q.lookFor && <p className="mt-1.5 text-xs text-muted">A good answer covers: {q.lookFor}</p>}
                      {q.comment && (
                        <p className="mt-1.5 text-xs text-ink">
                          <span className="font-medium">AI comment (advice only):</span> {q.comment}
                        </p>
                      )}
                    </>
                  )}
                </div>
              ))}
              {detail.questions.some((q) => q.kind === "SHORT") && !detail.hasComments && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" variant="secondary" onClick={comments} disabled={isPending}>
                    Get AI comments on the written answers
                  </Button>
                  <AiWaitNote show={isPending} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
