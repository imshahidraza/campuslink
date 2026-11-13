"use client";

import { useState, useTransition } from "react";
import { updateApplicationStageAction } from "@/lib/actions/matching";
import {
  requestOfferAction,
  editOfferRequestAction,
  cancelOfferRequestAction,
  withdrawOfferAction,
  markJoinedAction,
} from "@/lib/actions/offers";
import { Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { journeyLabel } from "@/lib/utils";
import { Award } from "lucide-react";
import { RejectWithFeedback } from "./RejectWithFeedback";
import { ViewResumeLink } from "./ViewResumeLink";
import { ScheduleInterviewForm, type ConfirmedWindow } from "./ScheduleInterviewForm";
import type { AttemptState } from "@/lib/screening";
import type { VideoStage } from "@/lib/video";
import Link from "next/link";

interface Props {
  /** The interview window agreed with the placement cell, or null until it is confirmed. */
  window: ConfirmedWindow | null;
  /** The drive's screening interview, if it has one: whether this student has finished it, and the score. */
  screening?: { required: boolean; state: AttemptState; correct: number | null; total: number | null };
  /** The drive's video interview, if it has one: whether this student has finished it, and where to read it. */
  video?: { required: boolean; stage: VideoStage; attemptId: string | null; totalScore: number | null; reviewCount: number };
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
    offerMessage?: string | null;
    offerWithdrawnNote?: string | null;
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
export function RecruiterCandidateRow({ application, window, screening, video }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [requestingOffer, setRequestingOffer] = useState(false);
  const [passing, setPassing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [editingOffer, setEditingOffer] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");

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
  // The server refuses to shortlist a student who hasn't finished the interview; the button says so up front.
  const waitingForScreening =
    (Boolean(screening?.required) && screening?.state !== "SUBMITTED") ||
    (Boolean(video?.required) && (video?.stage === "NOT_STARTED" || video?.stage === "IN_PROGRESS"));

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
            <p className="text-xs text-amber-800 mt-2 leading-relaxed whitespace-pre-line">
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
            <Button
              size="sm"
              variant="secondary"
              disabled={isPending || waitingForScreening}
              onClick={() => move("SHORTLISTED", `${name} shortlisted.`)}
            >
              Shortlist
            </Button>
          )}
          {(stage === "SHORTLISTED" || stage === "INTERVIEW") && (
            <Button size="sm" variant="secondary" disabled={isPending || !window} onClick={() => setScheduling((s) => !s)}>
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

      {screening?.required && stage === "ELIGIBLE" && (
        <p className="mt-2 text-xs text-muted">
          {screening.state === "SUBMITTED"
            ? `Screening interview done: ${screening.correct ?? 0} of ${screening.total ?? 0} multiple-choice answers correct.`
            : screening.state === "IN_PROGRESS"
              ? "Screening interview: the student has started but not finished. You can shortlist once it is done."
              : "Screening interview: not started. You can shortlist once the student finishes it."}
        </p>
      )}

      {video?.required && (
        <p className="mt-2 text-xs text-muted">
          {video.stage === "NOT_STARTED"
            ? "Video interview: not started. You can shortlist once the student finishes it."
            : video.stage === "IN_PROGRESS"
              ? "Video interview: the student is taking it now, or has not finished it."
              : `Video interview ${video.stage === "INTERRUPTED" ? "was interrupted" : "done"}${video.totalScore !== null ? `: AI advice ${video.totalScore} of 500` : ""}${video.reviewCount > 0 ? `, ${video.reviewCount} answer${video.reviewCount === 1 ? "" : "s"} for you to check` : ""}. `}
          {video.attemptId && video.stage !== "IN_PROGRESS" && (
            <Link href={`/recruiter/interviews/${video.attemptId}`} className="text-brand-500 hover:text-brand-600">
              Watch and read it
            </Link>
          )}
        </p>
      )}

      {!window && (stage === "SHORTLISTED" || stage === "INTERVIEW") && (
        <p className="mt-2 text-xs text-muted">Interviews can be booked once the placement cell confirms your dates (see the schedule card above).</p>
      )}
      {scheduling && window && (stage === "SHORTLISTED" || stage === "INTERVIEW") && (
        <ScheduleInterviewForm
          applicationId={application.id}
          driveId={application.driveId}
          window={window}
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

      {stage === "SELECTED" && application.offerWithdrawnNote && !requestingOffer && (
        <p className="mt-3 text-xs text-amber-800 whitespace-pre-line">
          <span className="font-medium">You withdrew the earlier offer:</span> {application.offerWithdrawnNote}
        </p>
      )}

      {stage === "SELECTED" && !requestingOffer && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setRequestingOffer(true)}>
            {application.offerWithdrawnNote ? "Send a corrected offer" : "Request offer"}
          </Button>
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setPassing((p) => !p)}>
            Not selected
          </Button>
        </div>
      )}

      {stage === "SELECTED" && requestingOffer && (
        <OfferForm
          title="Offer for the candidate"
          submitLabel="Send to placement cell"
          busy={isPending}
          onCancel={() => setRequestingOffer(false)}
          onSubmit={(fd) =>
            startTransition(async () => {
              try {
                await requestOfferAction(application.id, fd);
                toast("Offer request sent to the placement cell for review.");
                setRequestingOffer(false);
              } catch (err) {
                toast((err as Error).message, "error");
              }
            })
          }
        />
      )}

      {stage === "OFFER_REQUESTED" && !editingOffer && (
        <div className="mt-3">
          {application.offerMessage && (
            <p className="text-xs text-muted whitespace-pre-line mb-2">Your message: {application.offerMessage}</p>
          )}
          <p className="text-xs text-muted">Waiting for the placement cell to forward this offer to the student.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={isPending} onClick={() => setEditingOffer(true)}>
              Edit offer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await cancelOfferRequestAction(application.id);
                    toast("Offer request cancelled.", "info");
                  } catch (err) {
                    toast((err as Error).message, "error");
                  }
                })
              }
            >
              Cancel request
            </Button>
          </div>
        </div>
      )}

      {stage === "OFFER_REQUESTED" && editingOffer && (
        <OfferForm
          title="Edit the offer"
          submitLabel="Save changes"
          busy={isPending}
          defaults={{ offerPackage: application.offerPackage ?? "", offerMessage: application.offerMessage ?? "" }}
          onCancel={() => setEditingOffer(false)}
          onSubmit={(fd) =>
            startTransition(async () => {
              try {
                await editOfferRequestAction(application.id, fd);
                toast("Offer updated.");
                setEditingOffer(false);
              } catch (err) {
                toast((err as Error).message, "error");
              }
            })
          }
        />
      )}

      {(stage === "OFFER_SENT" || stage === "OFFER_ACCEPTED") && (
        <div className="mt-3">
          {application.offerMessage && (
            <p className="text-xs text-muted whitespace-pre-line mb-2">Your message: {application.offerMessage}</p>
          )}
          <p className="text-xs text-muted">
            {stage === "OFFER_SENT"
              ? "Offer sent. Waiting for the student's reply."
              : application.documentsVerified
                ? "Offer accepted and documents verified. You or the placement cell can mark the student as joined."
                : "Offer accepted. The placement cell is verifying the student's documents."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {stage === "OFFER_ACCEPTED" && application.documentsVerified && (
              <Button
                size="sm"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await markJoinedAction(application.id);
                      toast(`${name} marked as joined.`);
                    } catch (err) {
                      toast((err as Error).message, "error");
                    }
                  })
                }
              >
                Mark as joined
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setWithdrawing((w) => !w)}>
              Withdraw offer
            </Button>
          </div>
          {withdrawing && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
              <label className="text-xs text-muted block">
                Why are you withdrawing this offer? The student and the placement cell will read this.
                <textarea
                  value={withdrawReason}
                  onChange={(e) => setWithdrawReason(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder={"For example: the package was typed wrong, or the offer went to the wrong candidate.\nPress Enter to start a new line."}
                  className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink"
                />
              </label>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isPending || withdrawReason.trim().length < 5}
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        await withdrawOfferAction(application.id, withdrawReason);
                        toast("Offer withdrawn. The student and the placement cell were told.", "info");
                        setWithdrawing(false);
                        setWithdrawReason("");
                      } catch (err) {
                        toast((err as Error).message, "error");
                      }
                    })
                  }
                >
                  Confirm withdrawal
                </Button>
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setWithdrawing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {stage === "JOINED" && <p className="mt-3 text-xs text-emerald-700">This candidate has joined your company.</p>}
      {stage === "WITHDRAWN" && <p className="mt-3 text-xs text-muted">The student withdrew this application.</p>}
    </div>
  );
}

/** The offer form: a package on one line and a message box where Enter starts a new line. */
function OfferForm({
  title,
  submitLabel,
  busy,
  defaults,
  onSubmit,
  onCancel,
}: {
  title: string;
  submitLabel: string;
  busy: boolean;
  defaults?: { offerPackage: string; offerMessage: string };
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form
      action={(fd) => onSubmit(fd)}
      className="mt-3 rounded-xl border border-border-soft bg-surface p-4 space-y-3"
    >
      <p className="text-sm font-medium text-ink">{title}</p>
      <label className="block text-xs text-muted">
        Package
        <input
          name="offerPackage"
          required
          maxLength={100}
          defaultValue={defaults?.offerPackage}
          placeholder="e.g. 12 LPA"
          className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink"
        />
      </label>
      <label className="block text-xs text-muted">
        Message to the candidate (optional). Press Enter to start a new line.
        <textarea
          name="offerMessage"
          rows={7}
          maxLength={2000}
          defaultValue={defaults?.offerMessage}
          placeholder={"Dear candidate,\n\nWe are happy to offer you the role of ...\n\nJoining date: ...\nLocation: ...\n\nRegards,"}
          className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink leading-relaxed"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving..." : submitLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
