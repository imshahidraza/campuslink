"use client";

import { useState, useTransition } from "react";
import { tpoRespondScheduleAction } from "@/lib/actions/scheduleRequest";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { DayLoadHint } from "./DayLoadHint";
import { fmtDay } from "@/lib/format";
import type { ScheduleRequestView } from "./ScheduleRequestCard";

const inputCls =
  "mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-300";

const showDate = (d: string) => fmtDay(d);

/** The placement cell's side: confirm the requested dates, suggest other dates, or ask for a change. */
export function TpoScheduleResponse({
  driveId,
  title,
  request,
}: {
  driveId: string;
  title: string;
  request: ScheduleRequestView;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"confirm" | "counter" | null>(request.status === "WAITING_TPO" ? "confirm" : null);

  function send(intent: "confirm" | "counter", formData: FormData) {
    formData.set("intent", intent);
    startTransition(async () => {
      try {
        await tpoRespondScheduleAction(driveId, formData);
        toast(intent === "confirm" ? "Confirmed. The recruiter was notified." : "Sent to the recruiter.");
        setMode(null);
      } catch (err) {
        toast((err as Error).message, "error");
      }
    });
  }

  const waitingTpo = request.status === "WAITING_TPO";
  const hasAgreed = request.agreedDates.length > 0;

  return (
    <div className="py-4 border-b border-border-soft last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">{title}</p>
        {request.status === "WAITING_TPO" && <Badge tone="warning">Needs your answer</Badge>}
        {request.status === "WAITING_RECRUITER" && <Badge tone="neutral">Waiting for the recruiter</Badge>}
        {request.status === "CONFIRMED" && <Badge tone="success">Dates confirmed</Badge>}
      </div>

      {waitingTpo && (
        <p className="text-sm text-muted mt-2">
          Asked for {request.dates.map(showDate).join(", ")}, {request.startTime} to {request.endTime}, with {request.panelCount} panel
          {request.panelCount === 1 ? "" : "s"}.
        </p>
      )}
      {request.status === "WAITING_RECRUITER" && (
        <p className="text-sm text-muted mt-2">
          You suggested {request.dates.map(showDate).join(", ")}, {request.startTime} to {request.endTime}.
        </p>
      )}
      {hasAgreed && (
        <p className="text-xs text-muted mt-1.5">
          {request.status === "CONFIRMED" ? "Agreed" : "Currently agreed"}: {request.agreedDates.map(showDate).join(", ")},{" "}
          {request.agreedStart} to {request.agreedEnd}. Panels: <span className="whitespace-pre-line">{request.agreedPanels}</span>
        </p>
      )}
      {request.note && <p className="text-xs text-ink mt-1.5 whitespace-pre-line">Note: {request.note}</p>}

      {mode === null && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setMode("counter")}>
            {request.status === "CONFIRMED" ? "Suggest a change" : "Suggest other dates"}
          </Button>
        </div>
      )}

      {mode === "confirm" && waitingTpo && (
        <form action={(fd) => send("confirm", fd)} className="mt-3 space-y-3 rounded-xl border border-border-soft bg-surface p-4">
          <fieldset>
            <legend className="text-xs text-muted">Which of these dates can you give? Tick one or more.</legend>
            <div className="mt-2 space-y-2">
              {request.dates.map((d) => (
                <label key={d} className="block text-sm text-ink">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" name="agreeDates" value={d} defaultChecked />
                    {showDate(d)}
                  </span>
                  <DayLoadHint date={d} />
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-xs text-muted">
            Panels and rooms, one per line (for example: Panel A @ Room 101). The recruiter asked for {request.panelCount}.
            <textarea name="panels" rows={3} required className={inputCls} placeholder={"Panel A @ Room 101\nPanel B @ Room 102"} />
          </label>
          <label className="block text-xs text-muted">
            Venue or building (optional)
            <input name="venue" className={inputCls} placeholder="e.g. Seminar Hall" maxLength={60} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Saving..." : "Confirm these dates"}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setMode("counter")}>
              Suggest other dates
            </Button>
          </div>
        </form>
      )}

      {mode === "counter" && (
        <form action={(fd) => send("counter", fd)} className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-border-soft bg-surface p-4">
          <label className="text-xs text-muted">
            Date 1
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
            <input name="startTime" type="time" required defaultValue={request.startTime} className={inputCls} />
          </label>
          <label className="text-xs text-muted">
            End time
            <input name="endTime" type="time" required defaultValue={request.endTime} className={inputCls} />
          </label>
          <label className="text-xs text-muted">
            Venue or building (optional)
            <input name="venue" className={inputCls} maxLength={60} />
          </label>
          <label className="sm:col-span-3 text-xs text-muted">
            Panels and rooms, one per line
            <textarea name="panels" rows={3} required className={inputCls} placeholder={"Panel A @ Room 101\nPanel B @ Room 102"} />
          </label>
          <label className="sm:col-span-3 text-xs text-muted">
            Why these dates? (the recruiter will read this)
            <textarea name="note" rows={3} required maxLength={600} className={inputCls} placeholder="For example: the college has exams that week." />
          </label>
          <div className="sm:col-span-3 flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Sending..." : "Send to the recruiter"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode(waitingTpo ? "confirm" : null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
