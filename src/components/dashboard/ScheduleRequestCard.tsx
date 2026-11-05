"use client";

import { useState, useTransition } from "react";
import { CalendarClock, CheckCircle2, Hourglass } from "lucide-react";
import { requestScheduleAction, recruiterAcceptScheduleAction } from "@/lib/actions/scheduleRequest";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { fmtDay } from "@/lib/format";

const inputCls =
  "mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-300";

export interface ScheduleRequestView {
  status: "WAITING_TPO" | "WAITING_RECRUITER" | "CONFIRMED";
  dates: string[];
  startTime: string;
  endTime: string;
  panelCount: number;
  venue: string | null;
  panels: string | null;
  note: string | null;
  agreedDates: string[];
  agreedStart: string | null;
  agreedEnd: string | null;
  agreedVenue: string | null;
  agreedPanels: string | null;
}

const showDates = (d: string[]) => d.map((x) => fmtDay(x)).join(", ");

function Lines({ text }: { text: string | null }) {
  if (!text) return null;
  return <span className="whitespace-pre-line">{text}</span>;
}

/** The recruiter's side of agreeing interview dates with the placement cell. */
export function ScheduleRequestCard({ driveId, request }: { driveId: string; request: ScheduleRequestView | null }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  const status = request?.status ?? null;
  const hasAgreed = Boolean(request && request.agreedDates.length > 0);
  const showForm = editing || !request;

  function send(formData: FormData) {
    startTransition(async () => {
      try {
        await requestScheduleAction(driveId, formData);
        toast("Sent to the placement cell. You will be notified when they answer.");
        setEditing(false);
      } catch (err) {
        toast((err as Error).message, "error");
      }
    });
  }

  function accept() {
    startTransition(async () => {
      try {
        await recruiterAcceptScheduleAction(driveId);
        toast("Dates accepted. You can now book each student's time.");
      } catch (err) {
        toast((err as Error).message, "error");
      }
    });
  }

  return (
    <div>
      {request && hasAgreed && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 mb-4">
          <p className="text-sm font-medium text-ink flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Confirmed interview window
            {status !== "CONFIRMED" && <Badge tone="warning">Change pending</Badge>}
          </p>
          <p className="text-sm text-muted mt-1.5">
            {showDates(request.agreedDates)}, {request.agreedStart} to {request.agreedEnd}
          </p>
          <p className="text-xs text-muted mt-1">
            Panels: <Lines text={request.agreedPanels} />
          </p>
        </div>
      )}

      {request && status === "WAITING_TPO" && !editing && (
        <div className="rounded-xl border border-border-soft bg-surface p-4">
          <p className="text-sm font-medium text-ink flex items-center gap-2">
            <Hourglass className="h-4 w-4 text-amber-600" /> Waiting for the placement cell
          </p>
          <p className="text-sm text-muted mt-1.5">
            You asked for {showDates(request.dates)}, {request.startTime} to {request.endTime}, with {request.panelCount} panel
            {request.panelCount === 1 ? "" : "s"}.
          </p>
          {request.note && <p className="text-xs text-muted mt-1 whitespace-pre-line">Your note: {request.note}</p>}
          <Button size="sm" variant="ghost" className="mt-3" onClick={() => setEditing(true)}>
            Change my request
          </Button>
        </div>
      )}

      {request && status === "WAITING_RECRUITER" && !editing && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <p className="text-sm font-medium text-ink">The placement cell suggested other dates</p>
          <p className="text-sm text-muted mt-1.5">
            {showDates(request.dates)}, {request.startTime} to {request.endTime}
          </p>
          <p className="text-xs text-muted mt-1">
            Venue and panels: {request.venue ? `${request.venue}. ` : ""}
            <Lines text={request.panels} />
          </p>
          {request.note && <p className="text-xs text-ink mt-2 whitespace-pre-line">Note: {request.note}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={accept} disabled={isPending}>
              {isPending ? "Saving..." : "Accept these dates"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)} disabled={isPending}>
              Ask for different dates
            </Button>
          </div>
        </div>
      )}

      {request && status === "CONFIRMED" && !editing && (
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          <CalendarClock className="h-4 w-4" /> Ask for a change
        </Button>
      )}

      {showForm && (
        <form action={send} className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-border-soft bg-surface p-4">
          <p className="sm:col-span-3 text-sm text-ink font-medium">
            {request ? "Send new dates to the placement cell" : "Ask the placement cell for interview dates"}
          </p>
          <p className="sm:col-span-3 text-xs text-muted -mt-1 leading-relaxed">
            Give up to three dates that work for you. The placement cell checks rooms and the college calendar and
            confirms them, or suggests other dates. You then book each student&apos;s time inside the confirmed window.
          </p>
          <label className="text-xs text-muted">
            Preferred date 1
            <input name="date1" type="date" required className={inputCls} />
          </label>
          <label className="text-xs text-muted">
            Date 2 (optional)
            <input name="date2" type="date" className={inputCls} />
          </label>
          <label className="text-xs text-muted">
            Date 3 (optional)
            <input name="date3" type="date" className={inputCls} />
          </label>
          <label className="text-xs text-muted">
            Start time
            <input name="startTime" type="time" required className={inputCls} />
          </label>
          <label className="text-xs text-muted">
            End time
            <input name="endTime" type="time" required className={inputCls} />
          </label>
          <label className="text-xs text-muted">
            Interviewers (panels) you will bring
            <input name="panelCount" type="number" min={1} max={20} required className={inputCls} placeholder="e.g. 2" />
          </label>
          <label className="sm:col-span-3 text-xs text-muted">
            Note for the placement cell (optional)
            <textarea name="note" rows={3} maxLength={600} className={inputCls} placeholder={"For example: we need two days if more than 40 candidates are shortlisted."} />
          </label>
          <div className="sm:col-span-3 flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Sending..." : "Send to the placement cell"}
            </Button>
            {request && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
