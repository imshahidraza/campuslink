"use client";

import { useState, useTransition } from "react";
import { updateApplicationStageAction } from "@/lib/actions/matching";
import { requestOfferAction } from "@/lib/actions/offers";
import { Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { journeyLabel } from "@/lib/utils";
import { Award } from "lucide-react";
import { RejectWithFeedback } from "./RejectWithFeedback";
import { ViewResumeLink } from "./ViewResumeLink";
import { ScheduleInterviewForm } from "./ScheduleInterviewForm";

interface Props {
  application: {
    id: string;
    driveId: string;
    stage: string;
    fitScore: number | null;
    matchedSkills: string[];
    missingSkills: string[];
    relevantProjects: string[];
    matchExplanation: string | null;
    offerPackage?: string | null;
    documentsVerified?: boolean;
    specialConsideration?: boolean;
    specialConsiderationNote?: string | null;
    student: {
      id: string;
      rollNo: string;
      branch: string;
      program?: string | null;
      githubUrl: string | null;
      resume?: { id: string } | null;
      user: { name: string };
    };
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

/** What the recruiter can do at each stage. Request Offer appears once a candidate is selected. */
export function RecruiterCandidateRow({ application }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [requestingOffer, setRequestingOffer] = useState(false);
  const [passing, setPassing] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const stage = application.stage;
  const name = application.student.user.name;

  function move(to: "SHORTLISTED" | "SELECTED", message: string) {
    startTransition(async () => {
      try {
        await updateApplicationStageAction(application.id, to);
        toast(message);
      } catch (err) {
        toast((err as Error).message, "error");
      }
    });
  }

  function confirmPass(note: string) {
    startTransition(async () => {
      try {
        await updateApplicationStageAction(application.id, "REJECTED", note);
        toast(note.trim() ? "Marked as not selected, with feedback." : "Marked as not selected.", "info");
        setPassing(false);
      } catch (err) {
        toast((err as Error).message, "error");
      }
    });
  }

  const badgeText =
    application.specialConsideration && stage === "ELIGIBLE"
      ? "Recommended"
      : journeyLabel(stage, Boolean(application.documentsVerified));

  const canDecide = ["ELIGIBLE", "SHORTLISTED", "INTERVIEW", "SELECTED"].includes(stage);

  return (
    <div className="border-b border-border-soft py-4 last:border-0">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink break-words">{name}</p>
          <p className="text-xs text-muted mt-0.5">
            {application.student.rollNo} · {application.student.branch}
          </p>
          <div className="mt-1.5">
            <ViewResumeLink studentId={application.student.id} hasResume={!!application.student.resume} />
          </div>
          {application.specialConsideration && application.specialConsiderationNote && (
            <p className="text-xs text-amber-800 mt-2 leading-relaxed">
              <span className="font-medium">Placement cell note:</span> {application.specialConsiderationNote}
            </p>
          )}
          {application.offerPackage && <p className="text-xs text-muted mt-1.5">Offered: {application.offerPackage}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:justify-end">
          {application.specialConsideration && (
            <Badge tone="warning" className="flex items-center gap-1">
              <Award className="h-3 w-3" /> TPO Recommended
            </Badge>
          )}
          {application.fitScore != null && (
            <span className="text-sm font-semibold text-brand-600 whitespace-nowrap">Fit {application.fitScore}/100</span>
          )}
          <Badge tone={stageTone[stage] || "neutral"}>{badgeText}</Badge>
          {application.matchExplanation && (
            <button onClick={() => setExpanded((e) => !e)} className="text-xs text-brand-500 hover:text-brand-600">
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
          {application.relevantProjects.length > 0 && (
            <p className="mt-2 text-xs">
              <span className="font-medium text-ink">Relevant projects: </span>
              {application.relevantProjects.join(", ")}
            </p>
          )}
        </div>
      )}

      {canDecide && stage !== "SELECTED" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {stage === "ELIGIBLE" && (
            <Button size="sm" variant="secondary" disabled={isPending} onClick={() => move("SHORTLISTED", `${name} shortlisted.`)}>
              Shortlist
            </Button>
          )}
          {(stage === "SHORTLISTED" || stage === "INTERVIEW") && (
            <Button size="sm" variant="secondary" disabled={isPending} onClick={() => setScheduling((s) => !s)}>
              {stage === "INTERVIEW" ? "Schedule another round" : "Schedule interview"}
            </Button>
          )}
          {(stage === "SHORTLISTED" || stage === "INTERVIEW") && (
            <Button size="sm" variant="secondary" disabled={isPending} onClick={() => move("SELECTED", `${name} selected.`)}>
              Select
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setPassing((p) => !p)}>
            Not selected
          </Button>
        </div>
      )}

      {scheduling && (stage === "SHORTLISTED" || stage === "INTERVIEW") && (
        <ScheduleInterviewForm
          applicationId={application.id}
          driveId={application.driveId}
          onDone={() => setScheduling(false)}
        />
      )}

      {passing && (
        <RejectWithFeedback
          confirmLabel="Confirm not selected"
          disabled={isPending}
          onConfirm={confirmPass}
          onCancel={() => setPassing(false)}
        />
      )}

      {stage === "SELECTED" && !requestingOffer && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setRequestingOffer(true)}>
            Request offer
          </Button>
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setPassing((p) => !p)}>
            Not selected
          </Button>
        </div>
      )}

      {stage === "SELECTED" && requestingOffer && (
        <form
          action={(formData) => {
            startTransition(async () => {
              try {
                await requestOfferAction(application.id, formData);
                toast("Offer request sent to the placement cell for review.");
                setRequestingOffer(false);
              } catch (err) {
                toast((err as Error).message, "error");
              }
            });
          }}
          className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-end gap-2 bg-surface rounded-lg p-3 border border-border-soft"
        >
          <div className="flex-1">
            <label className="text-xs text-muted mb-1 block">Package to offer</label>
            <input
              name="offerPackage"
              placeholder="e.g. 12 LPA"
              required
              className="w-full rounded-lg border border-border-soft px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Sending..." : "Send to placement cell"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRequestingOffer(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {stage === "OFFER_REQUESTED" && (
        <p className="mt-3 text-xs text-muted">Waiting for the placement cell to forward this offer to the student.</p>
      )}
      {stage === "OFFER_SENT" && <p className="mt-3 text-xs text-muted">Offer sent. Waiting for the student&apos;s reply.</p>}
      {stage === "OFFER_ACCEPTED" && (
        <p className="mt-3 text-xs text-muted">
          {application.documentsVerified
            ? "Offer accepted and documents verified. The placement cell will mark the student as joined."
            : "Offer accepted. The placement cell is verifying the student's documents."}
        </p>
      )}
      {stage === "JOINED" && <p className="mt-3 text-xs text-emerald-700">This candidate has joined your company.</p>}
      {stage === "WITHDRAWN" && <p className="mt-3 text-xs text-muted">The student withdrew this application.</p>}
    </div>
  );
}
