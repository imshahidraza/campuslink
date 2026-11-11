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
import { convertToFullTimeAction } from "@/lib/actions/offerChanges";
import { OfferFormFields, type OfferFormDefaults } from "./OfferFormFields";
import { OfferTermsLine } from "./OfferTermsLine";
import { fmtJoining, todayYmd, toYmd } from "@/lib/offerRules";
import { OFFER_FOLLOW_UP_AFTER_DAYS, daysBetween } from "@/lib/automationRules";
import { Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { journeyLabel } from "@/lib/utils";
import { Award } from "lucide-react";
import { RejectWithFeedback } from "./RejectWithFeedback";
import { ViewResumeLink } from "./ViewResumeLink";
import { ScheduleInterviewForm, type ConfirmedWindow } from "./ScheduleInterviewForm";

interface Props {
  /** The interview window agreed with the placement cell, or null until it is confirmed. */
  window: ConfirmedWindow | null;
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
    offerType?: string | null;
    offerCtcLpa?: number | null;
    offerStipend?: number | null;
    bondMonths?: number | null;
    bondNote?: string | null;
    joiningDate?: Date | string | null;
    previousJoiningDate?: Date | string | null;
    convertedFromInternship?: boolean | null;
    offerSentAt?: Date | string | null;
    deferralStatus?: string | null;
    deferralRequestedDate?: Date | string | null;
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
export function RecruiterCandidateRow({ application, window }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [requestingOffer, setRequestingOffer] = useState(false);
  const [passing, setPassing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [editingOffer, setEditingOffer] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [converting, setConverting] = useState(false);

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
            <p className="text-xs text-amber-800 mt-2 leading-relaxed whitespace-pre-line">
              <span className="font-medium">Placement cell note:</span> {application.specialConsiderationNote}
            </p>
          )}
          {(application.offerPackage || application.offerCtcLpa != null || application.offerStipend != null) &&
            !["ELIGIBLE", "SHORTLISTED", "INTERVIEW", "SELECTED", "REJECTED", "WITHDRAWN"].includes(stage) && (
              <OfferTermsLine offer={application} className="text-xs text-muted mt-1.5" />
            )}
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
              const r = await requestOfferAction(application.id, fd);
              if (!r.ok) return toast(r.error, "error");
              toast("Offer request sent to the placement cell for review.");
              setRequestingOffer(false);
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
          forceType={application.convertedFromInternship ? "FULL_TIME" : undefined}
          defaults={{
            offerType: application.offerType,
            offerCtcLpa: application.offerCtcLpa,
            offerStipend: application.offerStipend,
            bondMonths: application.bondMonths,
            bondNote: application.bondNote,
            joiningDate: application.joiningDate ? toYmd(new Date(application.joiningDate)) : undefined,
            offerMessage: application.offerMessage,
          }}
          onCancel={() => setEditingOffer(false)}
          onSubmit={(fd) =>
            startTransition(async () => {
              const r = await editOfferRequestAction(application.id, fd);
              if (!r.ok) return toast(r.error, "error");
              toast("Offer updated.");
              setEditingOffer(false);
            })
          }
        />
      )}

      {(stage === "OFFER_SENT" || stage === "OFFER_ACCEPTED") && (
        <div className="mt-3">
          {application.offerMessage && (
            <p className="text-xs text-muted whitespace-pre-line mb-2">Your message: {application.offerMessage}</p>
          )}
          {application.convertedFromInternship && (
            <p className="text-xs text-muted mb-1">This is a full-time offer that follows the student&apos;s internship.</p>
          )}
          <p className="text-xs text-muted">
            {stage === "OFFER_SENT"
              ? "Offer sent. Waiting for the student's reply."
              : application.documentsVerified
                ? "Offer accepted and documents verified. You or the placement cell can mark the student as joined."
                : "Offer accepted. The placement cell is verifying the student's documents."}
          </p>
          {stage === "OFFER_SENT" && application.offerSentAt && daysBetween(new Date(application.offerSentAt), new Date()) >= OFFER_FOLLOW_UP_AFTER_DAYS && (
            <p className="mt-1 text-xs text-amber-800">
              No reply for {daysBetween(new Date(application.offerSentAt), new Date())} days. You may want to follow up with the student.
            </p>
          )}
          {stage === "OFFER_ACCEPTED" && application.deferralStatus === "PENDING" && application.deferralRequestedDate && (
            <p className="mt-1 text-xs text-amber-800">
              The student asked to move the joining date to {fmtJoining(application.deferralRequestedDate)}. The placement cell will decide.
            </p>
          )}
          {application.deferralStatus === "APPROVED" && application.previousJoiningDate && application.joiningDate && (
            <p className="mt-1 text-xs text-muted">
              Joining date moved from {fmtJoining(application.previousJoiningDate)} to {fmtJoining(application.joiningDate)} (approved by the placement cell).
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {application.offerType === "INTERNSHIP" && stage === "OFFER_ACCEPTED" && !converting && (
              <Button size="sm" variant="secondary" disabled={isPending} onClick={() => setConverting(true)}>
                Convert to full-time
              </Button>
            )}
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
      {converting && application.offerType === "INTERNSHIP" && (stage === "OFFER_ACCEPTED" || stage === "JOINED") && (
        <OfferForm
          title="Convert to a full-time offer"
          submitLabel="Send to placement cell"
          busy={isPending}
          forceType="FULL_TIME"
          note="This starts a full-time offer for the same student. The placement cell reviews it and the student accepts or declines it, like any other offer."
          onCancel={() => setConverting(false)}
          onSubmit={(fd) =>
            startTransition(async () => {
              const r = await convertToFullTimeAction(application.id, fd);
              if (!r.ok) return toast(r.error, "error");
              toast("Full-time offer sent to the placement cell for review.");
              setConverting(false);
            })
          }
        />
      )}
      {stage === "JOINED" && (
        <div className="mt-3">
          <p className="text-xs text-emerald-700">
            {application.offerType === "INTERNSHIP" ? "This intern has started with your company." : "This candidate has joined your company."}
          </p>
          {application.offerType === "INTERNSHIP" && !converting && (
            <Button size="sm" variant="secondary" className="mt-2" disabled={isPending} onClick={() => setConverting(true)}>
              Convert to full-time
            </Button>
          )}
        </div>
      )}
      {stage === "WITHDRAWN" && <p className="mt-3 text-xs text-muted">The student withdrew this application.</p>}
    </div>
  );
}

/** The offer form: type, package, joining date, bond and a message where Enter starts a new line. */
function OfferForm({
  title,
  submitLabel,
  busy,
  defaults,
  forceType,
  note,
  onSubmit,
  onCancel,
}: {
  title: string;
  submitLabel: string;
  busy: boolean;
  defaults?: OfferFormDefaults;
  forceType?: "FULL_TIME";
  note?: string;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form action={(fd) => onSubmit(fd)} className="mt-3 rounded-xl border border-border-soft bg-surface p-4 space-y-3">
      <p className="text-sm font-medium text-ink">{title}</p>
      {note && <p className="text-xs text-muted leading-relaxed">{note}</p>}
      <OfferFormFields defaults={defaults} forceType={forceType} minDate={todayYmd()} />
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
