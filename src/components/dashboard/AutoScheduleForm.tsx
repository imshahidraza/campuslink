"use client";

import { useState, useTransition } from "react";
import { CalendarClock, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { previewAutoScheduleAction, confirmAutoScheduleAction, type AutoSchedulePlan } from "@/lib/actions/scheduling";

interface DriveOption {
  id: string;
  label: string;
  shortlisted: number;
}

const inputCls =
  "w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-300";

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted mb-1 block">{label}</span>
      {children}
    </label>
  );
}

export function AutoScheduleForm({ drives }: { drives: DriveOption[] }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [f, setF] = useState({
    driveId: drives[0]?.id ?? "",
    round: "Interview",
    date: "",
    startTime: "09:00",
    endTime: "17:00",
    durationMins: "30",
    gapMins: "5",
    breakStart: "13:00",
    breakEnd: "14:00",
    panels: "Panel A @ Room 101\nPanel B @ Room 102",
  });
  const [plan, setPlan] = useState<AutoSchedulePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setPlan(null); // any change invalidates the shown preview
  };

  if (drives.length === 0) {
    return (
      <p className="text-sm text-muted">
        No drive has shortlisted candidates yet. Shortlist candidates on a drive, then come back to schedule them all at once.
      </p>
    );
  }

  function preview() {
    setError(null);
    startTransition(async () => {
      try {
        setPlan(await previewAutoScheduleAction(f));
      } catch (err) {
        setPlan(null);
        setError((err as Error).message);
      }
    });
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await confirmAutoScheduleAction(f);
        toast(`Scheduled ${r.scheduled} interview${r.scheduled === 1 ? "" : "s"} and notified the students.`);
        setPlan(null);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <F label="Drive (shortlisted candidates)">
          <select className={inputCls} value={f.driveId} onChange={(e) => set("driveId", e.target.value)}>
            {drives.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} — {d.shortlisted} shortlisted
              </option>
            ))}
          </select>
        </F>
        <F label="Round name">
          <input className={inputCls} value={f.round} onChange={(e) => set("round", e.target.value)} maxLength={60} />
        </F>
        <F label="Date">
          <input type="date" className={inputCls} value={f.date} onChange={(e) => set("date", e.target.value)} />
        </F>
        <div className="grid grid-cols-2 gap-3">
          <F label="Start">
            <input type="time" className={inputCls} value={f.startTime} onChange={(e) => set("startTime", e.target.value)} />
          </F>
          <F label="End">
            <input type="time" className={inputCls} value={f.endTime} onChange={(e) => set("endTime", e.target.value)} />
          </F>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <F label="Minutes per interview">
            <input type="number" min={10} max={240} className={inputCls} value={f.durationMins} onChange={(e) => set("durationMins", e.target.value)} />
          </F>
          <F label="Gap between (min)">
            <input type="number" min={0} max={60} className={inputCls} value={f.gapMins} onChange={(e) => set("gapMins", e.target.value)} />
          </F>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <F label="Break from (optional)">
            <input type="time" className={inputCls} value={f.breakStart} onChange={(e) => set("breakStart", e.target.value)} />
          </F>
          <F label="Break to">
            <input type="time" className={inputCls} value={f.breakEnd} onChange={(e) => set("breakEnd", e.target.value)} />
          </F>
        </div>
        <div className="sm:col-span-2">
          <F label="Panels — one per line, optionally with a room: “Panel A @ Room 101”">
            <textarea rows={3} className={inputCls} value={f.panels} onChange={(e) => set("panels", e.target.value)} />
          </F>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={preview} disabled={isPending || !f.date}>
          <CalendarClock className="h-4 w-4" />
          {isPending && !plan ? "Building..." : "Preview timetable"}
        </Button>
        <span className="text-xs text-muted">Nothing is saved until you confirm. Candidates are placed in roll-number order, so slots are neutral.</span>
      </div>

      {error && <p className="mt-3 text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}

      {plan && (
        <div className="mt-5">
          <div className="overflow-x-auto rounded-xl border border-border-soft">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-ink text-xs">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Panel</th>
                  <th className="px-3 py-2 font-medium">Student</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((r) => (
                  <tr key={r.applicationId} className="border-t border-border-soft">
                    <td className="px-3 py-2 whitespace-nowrap text-ink">
                      {new Date(r.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {r.panel}
                      {r.venue ? ` · ${r.venue}` : ""}
                    </td>
                    <td className="px-3 py-2 text-ink">
                      {r.studentName} <span className="text-xs text-muted">{r.rollNo}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {plan.unscheduled.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4" /> {plan.unscheduled.length} candidate{plan.unscheduled.length === 1 ? "" : "s"} couldn&apos;t fit
              </p>
              <p className="text-xs mt-1">
                {plan.unscheduled.map((u) => `${u.studentName} (${u.rollNo})`).join(", ")} — {plan.unscheduled[0].reason}
              </p>
            </div>
          )}

          {plan.rows.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={confirm} disabled={isPending}>
                <CheckCircle2 className="h-4 w-4" />
                {isPending ? "Scheduling..." : `Confirm & notify ${plan.rows.length} student${plan.rows.length === 1 ? "" : "s"}`}
              </Button>
              <span className="text-xs text-muted">Students get a notification with their slot.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
