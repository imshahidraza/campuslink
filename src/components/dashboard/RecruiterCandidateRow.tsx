"use client";

import { useState, useTransition } from "react";
import { updateApplicationStageAction } from "@/lib/actions/matching";
import { requestOfferAction } from "@/lib/actions/offers";
import { Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { stageLabel } from "@/lib/utils";
import { Award } from "lucide-react";
import { RejectWithFeedback } from "./RejectWithFeedback";
import { ViewResumeLink } from "./ViewResumeLink";

interface Props {
  application: {
    id: string;
    stage: string;
    fitScore: number | null;
    matchedSkills: string[];
    missingSkills: string[];
    relevantProjects: string[];
    matchExplanation: string | null;
    offerPackage?: string | null;
    specialConsideration?: boolean;
    specialConsiderationNote?: string | null;
    student: { id: string; rollNo: string; branch: string; githubUrl: string | null; resume?: { id: string } | null; user: { name: string } };
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

export function RecruiterCandidateRow({ application }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [requestingOffer, setRequestingOffer] = useState(false);
  const [passing, setPassing] = useState(false);

  function confirmPass(note: string) {
    startTransition(async () => {
      try {
        await updateApplicationStageAction(application.id, "REJECTED", note);
        toast(note.trim() ? "Candidate passed, with feedback." : "Candidate passed.", "info");
        setPassing(false);
      } catch (err) {
        toast((err as Error).message, "error");
      }
    });
  }

  return (
    <div className="border-b border-border-soft py-4 last:border-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">{application.student.user.name}</p>
          <p className="text-xs text-muted">
            {application.student.rollNo} · {application.student.branch}
          </p>
          <div className="mt-1">
            <ViewResumeLink studentId={application.student.id} hasResume={!!application.student.resume} />
          </div>
          {application.specialConsiderationNote && (
            <p className="text-xs text-amber-700 mt-1 italic">&quot;{application.specialConsiderationNote}&quot;</p>
          )}
          {application.offerPackage && (
            <p className="text-xs text-muted mt-1">Offered: {application.offerPackage}</p>
          )}
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

      {["ELIGIBLE", "SHORTLISTED", "INTERVIEW", "SELECTED"].includes(application.stage) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {application.stage === "ELIGIBLE" && (
            <Button
              size="sm"
              variant="secondary"
              disabled={isPending}
              onClick={() => startTransition(async () => { await updateApplicationStageAction(application.id, "SHORTLISTED"); toast("Candidate shortlisted."); })}
            >
              Shortlist
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => setPassing((p) => !p)}
          >
            Pass
          </Button>
        </div>
      )}

      {passing && (
        <RejectWithFeedback
          confirmLabel="Confirm pass"
          disabled={isPending}
          onConfirm={confirmPass}
          onCancel={() => setPassing(false)}
        />
      )}

      {application.stage === "SELECTED" && !requestingOffer && (
        <div className="mt-3">
          <Button size="sm" onClick={() => setRequestingOffer(true)}>
            Request Offer
          </Button>
        </div>
      )}

      {application.stage === "SELECTED" && requestingOffer && (
        <form
          action={(formData) => {
            startTransition(async () => {
              try {
                await requestOfferAction(application.id, formData);
                toast("Offer request sent to your placement cell for review.");
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
              Send to TPO
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRequestingOffer(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {application.stage === "OFFER_REQUESTED" && (
        <p className="mt-3 text-xs text-muted">Awaiting your placement cell to forward this offer to the student.</p>
      )}
      {application.stage === "OFFER_SENT" && (
        <p className="mt-3 text-xs text-muted">Offer sent — awaiting the student&apos;s response.</p>
      )}
    </div>
  );
}
