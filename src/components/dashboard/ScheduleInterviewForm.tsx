"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { scheduleInterviewAction } from "@/lib/actions/offers";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { DayLoadHint } from "./DayLoadHint";

const inputCls =
  "mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-300";

/**
 * Schedules one interview for one candidate. Used by both the placement cell and the recruiter.
 * On a clash nothing is saved and the reason is shown; only the placement cell can then choose
 * "Schedule anyway" (with an optional reason).
 */
export function ScheduleInterviewForm({
  applicationId,
  driveId,
  onDone,
}: {
  applicationId: string;
  driveId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [dateValue, setDateValue] = useState("");
  const [clash, setClash] = useState<{ notes: string[]; hard: boolean; canOverride: boolean; data: FormData } | null>(null);
  const [reason, setReason] = useState("");

  async function submit(formData: FormData, override: boolean) {
    formData.set("applicationId", applicationId);
    formData.set("driveId", driveId);
    if (override) {
      formData.set("override", "1");
      formData.set("overrideReason", reason);
    }
    try {
      const r = await scheduleInterviewAction(formData);
      if (!r.saved) {
        setClash({
          notes: r.conflict.notes,
          hard: r.conflict.notes.some((n) => n.startsWith("Student already")),
          canOverride: r.canOverride,
          data: formData,
        });
        return;
      }
      setClash(null);
      setReason("");
      setDateValue("");
      onDone();
      toast(r.conflict.hasConflict ? "Scheduled over the clash." : "Interview scheduled and the student was notified.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <form
      action={(formData) => startTransition(() => submit(formData, false))}
      className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-surface rounded-lg p-3 border border-border-soft"
    >
      <label className="sm:col-span-2 text-xs text-muted">
        Interview round
        <input name="stage" placeholder="e.g. Technical round 1" className={inputCls} required />
      </label>
      <label className="text-xs text-muted">
        Date and time
        <input
          name="scheduledAt"
          type="datetime-local"
          onChange={(e) => {
            setDateValue(e.target.value);
            setClash(null);
          }}
          className={inputCls}
          required
        />
        <DayLoadHint date={dateValue} />
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
      <label className="text-xs text-muted">
        Venue or meeting link
        <input name="venue" placeholder="e.g. Seminar Hall A" className={inputCls} />
      </label>
      <label className="text-xs text-muted">
        Interview panel
        <input name="panel" placeholder="e.g. Panel 1" className={inputCls} />
      </label>

      {clash && (
        <div
          className={`sm:col-span-2 rounded-lg border p-3 text-sm ${
            clash.hard ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {clash.hard ? "This clashes with the student's own schedule" : "This time clashes"}
          </p>
          <ul className="mt-1.5 list-disc list-inside text-xs space-y-0.5">
            {clash.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          {clash.canOverride ? (
            <>
              {clash.hard && (
                <p className="mt-1.5 text-xs">The student can&apos;t be in two places at once. You can still override if you have arranged it.</p>
              )}
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                placeholder="Reason for the override (optional), e.g. the recruiter is only free then"
                className="mt-2 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={isPending} onClick={() => startTransition(() => submit(clash.data, true))}>
                  Schedule anyway
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setClash(null)}>
                  Change the time
                </Button>
              </div>
            </>
          ) : (
            <div className="mt-2">
              <p className="text-xs">Please choose another time. The placement cell can help if this slot is the only one that works.</p>
              <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => setClash(null)}>
                Change the time
              </Button>
            </div>
          )}
        </div>
      )}
      {!clash && (
        <Button type="submit" size="sm" className="sm:col-span-2 w-fit" disabled={isPending}>
          {isPending ? "Scheduling..." : "Confirm schedule"}
        </Button>
      )}
    </form>
  );
}
