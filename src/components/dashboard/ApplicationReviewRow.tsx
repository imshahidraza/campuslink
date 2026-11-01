"use client";

import { useState, useTransition } from "react";
import { updateApplicationStageAction } from "@/lib/actions/matching";
import { scheduleInterviewAction } from "@/lib/actions/offers";
import { Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { stageLabel } from "@/lib/utils";
import { Award } from "lucide-react";
import Link from "next/link";
import { RejectWithFeedback } from "./RejectWithFeedback";
import { ViewResumeLink } from "./ViewResumeLink";

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
    student: { id: string; rollNo: string; branch: string; cgpa: number; resume?: { id: string } | null; user: { name: string } };
  };
}

const stageTone: Record<string, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  ELIGIBLE: "neutral",
  SHORTLISTED: "brand",
  INTERVIEW: "warning",
  SELECTED: "success",
  OFFER_REQUESTED: "warning",
  OFFER_SENT: "warning",
  OFFER_ACCEPTED: "success",
  OFFER_DECLINED: "danger",
  JOINED: "success",
  REJECTED: "danger",
};

const OFFER_PIPELINE_STAGES = ["OFFER_REQUESTED", "OFFER_SENT", "OFFER_ACCEPTED", "OFFER_DECLINED", "JOINED"];

export function ApplicationReviewRow({ application }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  function confirmReject(note: string) {
    startTransition(async () => {
      try {
        await updateApplicationStageAction(application.id, "REJECTED", note);
        toast(`${application.student.user.name} rejected${note.trim() ? " with feedback" : ""}.`);
        setRejecting(false);
      } catch (err) {
        toast((err as Error).message, "error");
      }
    });
  }

  function setStage(stage: "SHORTLISTED" | "INTERVIEW" | "SELECTED", label: string) {
    startTransition(async () => {
      await updateApplicationStageAction(application.id, stage);
      toast(`${application.student.user.name} ${label}.`);
    });
  }

  const inOfferPipeline = OFFER_PIPELINE_STAGES.includes(application.stage);

  return (
    <div className="border-b border-border-soft py-4 last:border-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">{application.student.user.name}</p>
          <p className="text-xs text-muted">
            {application.student.rollNo} · {application.student.branch} · CGPA {application.student.cgpa.toFixed(2)}
          </p>
          <div className="mt-1">
            <ViewResumeLink studentId={application.student.id} hasResume={!!application.student.resume} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
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

      {!inOfferPipeline && (
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
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setRejecting((r) => !r)}>
            Reject
          </Button>
        </div>
      )}

      {rejecting && (
        <RejectWithFeedback
          confirmLabel="Confirm reject"
          disabled={isPending}
          onConfirm={confirmReject}
          onCancel={() => setRejecting(false)}
        />
      )}

      {inOfferPipeline && (
        <p className="mt-3 text-xs text-muted">
          This candidate is in the offer pipeline —{" "}
          <Link href="/tpo/offers" className="text-brand-500 hover:text-brand-600 font-medium">
            manage it from Offers
          </Link>
          .
        </p>
      )}

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
          className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-surface rounded-lg p-3 border border-border-soft"
        >
          <label className="sm:col-span-2 text-xs text-muted">
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
          <Button type="submit" size="sm" className="sm:col-span-2 w-fit">
            Confirm schedule
          </Button>
        </form>
      )}
    </div>
  );
}
