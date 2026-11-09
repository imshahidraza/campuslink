"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { scheduleInterviewAction } from "@/lib/actions/offers";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { fmtDay } from "@/lib/format";

const inputCls =
  "mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-300";

export interface ConfirmedWindow {
  dates: string[]; // yyyy-mm-dd
  start: string; // HH:mm
  end: string;
  panels: { name: string; venue: string | null }[];
}

/**
 * Books one interview for one candidate, inside the dates, time window and panels that the recruiter and
 * the placement cell agreed on. On a clash nothing is saved and the reason is shown, so the recruiter
 * can choose another time.
 */
export function ScheduleInterviewForm({
  applicationId,
  driveId,
  window,
  onDone,
}: {
  applicationId: string;
  driveId: string;
  window: ConfirmedWindow;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [clash, setClash] = useState<string[] | null>(null);

  async function submit(formData: FormData) {
    formData.set("applicationId", applicationId);
    formData.set("driveId", driveId);
    try {
      const r = await scheduleInterviewAction(formData);
      if (!r.saved) {
        setClash(r.conflict.notes);
        return;
      }
      setClash(null);
      onDone();
      toast("Interview scheduled and the student was notified.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <form
      action={(formData) => startTransition(() => submit(formData))}
      className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-surface rounded-lg p-3 border border-border-soft"
    >
      <label className="sm:col-span-2 text-xs text-muted">
        Interview round
        <input name="stage" placeholder="e.g. Technical round 1" className={inputCls} required maxLength={60} />
      </label>
      <label className="text-xs text-muted">
        Date
        <select name="date" className={inputCls} required defaultValue="" onChange={() => setClash(null)}>
          <option value="" disabled>
            Choose a confirmed date
          </option>
          {window.dates.map((d) => (
            <option key={d} value={d}>
              {fmtDay(d)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted">
        Time (between {window.start} and {window.end})
        <input name="time" type="time" min={window.start} max={window.end} className={inputCls} required onChange={() => setClash(null)} />
      </label>
      <label className="text-xs text-muted">
        Panel
        <select name="panel" className={inputCls} required defaultValue="" onChange={() => setClash(null)}>
          <option value="" disabled>
            Choose a panel
          </option>
          {window.panels.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
              {p.venue ? ` (${p.venue})` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted">
        Duration
        <select name="durationMins" defaultValue="30" className={inputCls}>
          {[15, 30, 45, 60, 90, 120].map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </label>

      {clash && (
        <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" /> That time is not free
          </p>
          <ul className="mt-1.5 list-disc list-inside text-xs space-y-0.5">
            {clash.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs">Please choose another time or panel.</p>
        </div>
      )}
      <Button type="submit" size="sm" className="sm:col-span-2 w-fit" disabled={isPending}>
        {isPending ? "Scheduling..." : "Confirm schedule"}
      </Button>
    </form>
  );
}
