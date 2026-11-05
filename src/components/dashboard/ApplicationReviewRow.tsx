"use client";

import { useState, useTransition } from "react";
import { updateApplicationStageAction } from "@/lib/actions/matching";
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
  WITHDRAWN: "neutral",
};

const OFFER_PIPELINE_STAGES = ["OFFER_REQUESTED", "OFFER_SENT", "OFFER_ACCEPTED", "OFFER_DECLINED", "JOINED"];

export function ApplicationReviewRow({ application }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  function confirmReject(note: string) {
    startTransition(async () => {
      try {
        await updateApplicationStageAction(application.id, "REJECTED", note);
        toast(`${application.student.user.name} marked as not selected${note.trim() ? ", with feedback" : ""}.`);
        setRejecting(false);
      } catch (err) {
        toast((err as Error).message, "error");
      }
    });
  }

  function setStage(stage: "SHORTLISTED" | "INTERVIEW" | "SELECTED", label: string) {
    startTransition(async () => {
      try {
        await updateApplicationStageAction(application.id, stage);
        toast(`${application.student.user.name} ${label}.`);
      } catch (err) {
        toast((err as Error).message, "error");
      }
    });
  }

  const inOfferPipeline = OFFER_PIPELINE_STAGES.includes(application.stage);

  return (
    <div className="border-b border-border-soft py-4 last:border-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink break-words">{application.student.user.name}</p>
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
            <span className="text-sm font-semibold text-brand-600 whitespace-nowrap">Fit {application.fitScore}/100</span>
          )}
          <Badge tone={stageTone[application.stage] || "neutral"}>
            {application.specialConsideration && application.stage === "ELIGIBLE" ? "Recommended" : stageLabel(application.stage)}
          </Badge>
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

      {!inOfferPipeline && application.stage !== "WITHDRAWN" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" disabled={isPending} onClick={() => setStage("SHORTLISTED", "shortlisted")}>
            Shortlist
          </Button>
          <Button size="sm" variant="secondary" disabled={isPending} onClick={() => setStage("SELECTED", "marked as selected")}>
            Select (override)
          </Button>
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setRejecting((r) => !r)}>
            Not selected
          </Button>
        </div>
      )}

      {rejecting && (
        <RejectWithFeedback
          confirmLabel="Confirm not selected"
          disabled={isPending}
          onConfirm={confirmReject}
          onCancel={() => setRejecting(false)}
        />
      )}

      {inOfferPipeline && (
        <p className="mt-3 text-xs text-muted">
          This candidate is in the offer process.{" "}
          <Link href="/tpo/offers" className="text-brand-500 hover:text-brand-600 font-medium">
            Manage it from Offers
          </Link>
          .
        </p>
      )}

    </div>
  );
}
