"use client";

import { useState, useTransition } from "react";
import { updateApplicationStageAction } from "@/lib/actions/matching";
import { scheduleInterviewAction } from "@/lib/actions/offers";
import { recordOfferAction } from "@/lib/actions/offers";
import { Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { stageLabel } from "@/lib/utils";
import { Award } from "lucide-react";

interface Props {
  application: {
    id: string;
    driveId: string;
    stage: string;
    fitScore: number | null;
    matchedSkills: string[];
    missingSkills: string[];
    matchExplanation: string | null;
    specialConsideration?: boolean;
    student: { rollNo: string; branch: string; cgpa: number; user: { name: string } };
  };
}

const stageTone: Record<string, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  ELIGIBLE: "neutral",
  SHORTLISTED: "brand",
  INTERVIEW: "warning",
  SELECTED: "success",
  OFFER: "success",
  REJECTED: "danger",
};

export function ApplicationReviewRow({ application }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [offering, setOffering] = useState(false);

  function setStage(stage: "SHORTLISTED" | "INTERVIEW" | "SELECTED" | "REJECTED", label: string) {
    startTransition(async () => {
      await updateApplicationStageAction(application.id, stage);
      toast(`${application.student.user.name} ${label}.`);
    });
  }

  return (
    <div className="border-b border-border-soft py-4 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">{application.student.user.name}</p>
          <p className="text-xs text-muted">
            {application.student.rollNo} · {application.student.branch} · CGPA {application.student.cgpa.toFixed(2)}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {application.specialConsideration && (
            <Badge tone="warning" className="flex items-center gap-1">
              <Award className="h-3 w-3" /> TPO Recommended
            </Badge>
          )}
          {application.fitScore != null && (
            <span className="text-sm font-semibold text-brand-600">{application.fitScore}</span>
          )}
          <Badge tone={stageTone[application.stage] || "neutral"}>{stageLabel(application.stage)}</Badge>
          {application.matchExplanation && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-xs text-brand-500 hover:text-brand-600"
            >
              {expanded ? "Hide" : "Why?"}
            </button>
          )}
        </div>
      </div>

      {expanded && application.matchExplanation && (
        <div className="mt-3 rounded-lg bg-surface border border-border-soft p-3 text-sm text-muted">
          {application.matchExplanation}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {application.matchedSkills.map((s) => (
              <Badge key={s} tone="success">
                ✓ {s}
              </Badge>
            ))}
            {application.missingSkills.map((s) => (
              <Badge key={s} tone="warning">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={isPending} onClick={() => setStage("SHORTLISTED", "shortlisted")}>
          Shortlist
        </Button>
        <Button size="sm" variant="secondary" disabled={isPending} onClick={() => setScheduling((s) => !s)}>
          Schedule interview
        </Button>
        <Button size="sm" variant="secondary" disabled={isPending} onClick={() => setStage("SELECTED", "marked as selected")}>
          Mark selected
        </Button>
        <Button size="sm" variant="secondary" disabled={isPending} onClick={() => setOffering((s) => !s)}>
          Record offer
        </Button>
        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setStage("REJECTED", "rejected")}>
          Reject
        </Button>
      </div>

      {scheduling && (
        <form
          action={async (formData) => {
            formData.set("applicationId", application.id);
            formData.set("driveId", application.driveId);
            const { conflict } = await scheduleInterviewAction(formData);
            if (!conflict.hasConflict) {
              setScheduling(false);
              toast("Interview scheduled.");
            } else {
              toast(`Scheduled, but conflicts found: ${conflict.notes.join("; ")}`, "error");
            }
          }}
          className="mt-3 grid grid-cols-2 gap-2 bg-surface rounded-lg p-3 border border-border-soft"
        >
          <label className="col-span-2 text-xs text-muted">
            Interview round
            <input name="stage" placeholder="e.g. Technical Round 1" className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink" required />
          </label>
          <label className="text-xs text-muted">
            Date &amp; time
            <input name="scheduledAt" type="datetime-local" className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink" required />
          </label>
          <label className="text-xs text-muted">
            Duration
            <select name="durationMins" defaultValue="30" className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink">
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Venue / meeting link
            <input name="venue" placeholder="e.g. Seminar Hall A" className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink" />
          </label>
          <label className="text-xs text-muted">
            Interview panel
            <input name="panel" placeholder="e.g. Panel 1" className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink" />
          </label>
          <Button type="submit" size="sm" className="col-span-2 w-fit">
            Confirm schedule
          </Button>
        </form>
      )}

      {offering && (
        <form
          action={async (formData) => {
            await recordOfferAction(application.id, formData);
            setOffering(false);
            toast("Offer recorded.");
          }}
          className="mt-3 flex items-center gap-2 bg-surface rounded-lg p-3 border border-border-soft"
        >
          <input name="offerPackage" placeholder="Package (e.g. 12 LPA)" className="flex-1 rounded-lg border border-border-soft px-3 py-2 text-sm" />
          <Button type="submit" size="sm">
            Confirm offer
          </Button>
        </form>
      )}
    </div>
  );
}
