"use client";

import { useState, useTransition } from "react";
import { assignMentorAction, resolveEscalationAction, reopenEscalationAction } from "@/lib/actions/automation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

export interface SupportItem {
  id: string;
  rollNo: string;
  name: string;
  branch: string;
  cgpa: number;
  reasons: string[];
  status: "OPEN" | "ASSIGNED" | "RESOLVED";
  mentorName: string | null;
  note: string | null;
  assignedOn: string | null; // formatted on the server
}

const tone = { OPEN: "warning", ASSIGNED: "brand", RESOLVED: "success" } as const;
const label = { OPEN: "Needs a mentor", ASSIGNED: "Mentor assigned", RESOLVED: "Resolved" } as const;

export function SupportRow({ item, mentorNames }: { item: SupportItem; mentorNames: string[] }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [mentor, setMentor] = useState(item.mentorName ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const listId = `mentors-${item.id}`;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return toast(r.error ?? "That didn't work. Please try again.", "error");
      toast(ok);
      setEditing(false);
    });
  }

  return (
    <div className="border-b border-border-soft py-4 last:border-0">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink break-words">
            {item.name} <span className="text-xs text-muted font-normal">{item.rollNo} · {item.branch} · CGPA {item.cgpa.toFixed(2)}</span>
          </p>
          <ul className="mt-1.5 text-xs text-muted list-disc pl-4 space-y-0.5">
            {item.reasons.length === 0 && <li>No reason recorded.</li>}
            {item.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {item.mentorName && (
            <p className="text-xs text-ink mt-2">
              Mentor: <span className="font-medium">{item.mentorName}</span>
              {item.assignedOn ? ` (since ${item.assignedOn})` : ""}
              {item.note ? ` · ${item.note}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Badge tone={tone[item.status]}>{label[item.status]}</Badge>
          {item.status !== "RESOLVED" && !editing && (
            <Button size="sm" variant="secondary" disabled={isPending} onClick={() => setEditing(true)}>
              {item.mentorName ? "Change mentor" : "Assign mentor"}
            </Button>
          )}
          {item.status !== "RESOLVED" && (
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => resolveEscalationAction(item.id), "Marked as resolved.")}>
              Resolve
            </Button>
          )}
          {item.status === "RESOLVED" && (
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => reopenEscalationAction(item.id), "Reopened.")}>
              Reopen
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-3 rounded-xl border border-border-soft bg-surface p-4 space-y-3">
          <label className="block text-xs text-muted">
            Mentor&apos;s name
            <input
              list={listId}
              value={mentor}
              onChange={(e) => setMentor(e.target.value)}
              maxLength={80}
              placeholder="e.g. Prof. A. Sharma"
              className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink"
            />
            <datalist id={listId}>
              {mentorNames.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <label className="block text-xs text-muted">
            Note for the student (optional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="For example: meet on Monday to plan interview practice."
              className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink"
            />
          </label>
          <p className="text-[11px] text-muted">The student gets a message saying who their mentor is.</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={isPending || mentor.trim().length < 2} onClick={() => run(() => assignMentorAction(item.id, mentor, note), "Mentor assigned. The student was told.")}>
              Save
            </Button>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
