"use client";

import { useState, useTransition } from "react";
import { sendOfferToStudentAction, verifyDocumentsAction, markJoinedAction, undoJoinedAction } from "@/lib/actions/offers";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { journeyLabel } from "@/lib/utils";
import { decideDeferralAction, setDocumentDeadlineAction } from "@/lib/actions/offerChanges";
import { OfferTermsLine, OfferTypeBadge } from "./OfferTermsLine";
import { fmtJoining, todayYmd, toYmd } from "@/lib/offerRules";
import { fmtDate } from "@/lib/format";

interface OfferApplication {
  id: string;
  stage: string;
  offerPackage: string | null;
  offerMessage?: string | null;
  offerType?: string | null;
  offerCtcLpa?: number | null;
  offerStipend?: number | null;
  bondMonths?: number | null;
  bondNote?: string | null;
  joiningDate?: Date | string | null;
  previousJoiningDate?: Date | string | null;
  convertedFromInternship?: boolean | null;
  deferralStatus?: string | null;
  deferralReason?: string | null;
  deferralRequestedDate?: Date | string | null;
  deferralNote?: string | null;
  documentsDueAt?: Date | string | null;
  joinedByRole?: string | null;
  documentsVerified: boolean;
  joined: boolean;
  student: { rollNo: string; user: { name: string } };
  drive: { jobRole: string; companyName: string };
}

const stageTone: Record<string, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  OFFER_REQUESTED: "warning",
  OFFER_SENT: "brand",
  OFFER_ACCEPTED: "success",
  OFFER_DECLINED: "danger",
  JOINED: "success",
};

export function OfferRow({ application }: { application: OfferApplication }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [confirmingUndo, setConfirmingUndo] = useState(false);
  const [deciding, setDeciding] = useState<null | "DECLINE">(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [settingDeadline, setSettingDeadline] = useState(false);
  const [deadline, setDeadline] = useState(application.documentsDueAt ? toYmd(new Date(application.documentsDueAt)) : "");

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-soft py-3 last:border-0">
      <div>
        <p className="text-sm font-medium text-ink break-words">{application.student.user.name}</p>
        <p className="text-xs text-muted">
          {application.drive.jobRole} · {application.drive.companyName}
        </p>
        <OfferTermsLine offer={application} className="text-xs text-muted mt-0.5" />
        {application.stage === "OFFER_ACCEPTED" && !application.documentsVerified && application.documentsDueAt && (
          <p className="text-xs text-muted mt-0.5">Documents due by {fmtDate(application.documentsDueAt)}</p>
        )}
        {application.deferralStatus === "APPROVED" && application.previousJoiningDate && application.joiningDate && (
          <p className="text-xs text-muted mt-0.5">
            Joining date moved from {fmtJoining(application.previousJoiningDate)} to {fmtJoining(application.joiningDate)}.
          </p>
        )}
        {application.deferralStatus === "DECLINED" && (
          <p className="text-xs text-muted mt-0.5">A request to move the joining date was declined.</p>
        )}
        {application.stage === "OFFER_ACCEPTED" && application.deferralStatus === "PENDING" && application.deferralRequestedDate && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <p className="text-xs text-ink font-medium">
              Asks to move the joining date{application.joiningDate ? ` from ${fmtJoining(application.joiningDate)}` : ""} to{" "}
              {fmtJoining(application.deferralRequestedDate)}
            </p>
            {application.deferralReason && <p className="text-xs text-muted mt-1 whitespace-pre-line">Reason: {application.deferralReason}</p>}
            {deciding === "DECLINE" ? (
              <div className="mt-2">
                <label className="text-xs text-muted block">
                  Why can&apos;t this be approved? The student will read this.
                  <textarea
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    rows={3}
                    maxLength={500}
                    className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink"
                  />
                </label>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isPending || decisionNote.trim().length < 5}
                    onClick={() =>
                      startTransition(async () => {
                        const r = await decideDeferralAction(application.id, "DECLINE", decisionNote);
                        if (!r.ok) return toast(r.error, "error");
                        toast("Request declined. The student was told.", "info");
                        setDeciding(null);
                        setDecisionNote("");
                      })
                    }
                  >
                    Confirm decline
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeciding(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await decideDeferralAction(application.id, "APPROVE", "");
                      if (!r.ok) return toast(r.error, "error");
                      toast("Joining date moved. The student and the recruiter were told.");
                    })
                  }
                >
                  Approve
                </Button>
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setDeciding("DECLINE")}>
                  Decline
                </Button>
              </div>
            )}
          </div>
        )}
        {application.offerMessage && (
          <details className="mt-1">
            <summary className="text-xs text-brand-500 cursor-pointer">Message to the student</summary>
            <p className="mt-1 text-xs text-muted whitespace-pre-line">{application.offerMessage}</p>
          </details>
        )}
        {application.stage === "JOINED" && application.joinedByRole && (
          <p className="text-xs text-muted mt-0.5">
            Confirmed by {application.joinedByRole === "TPO" ? "the placement cell" : "the recruiter"}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <OfferTypeBadge type={application.offerType} />
        <Badge tone={stageTone[application.stage] || "neutral"}>{journeyLabel(application.stage, application.documentsVerified)}</Badge>

        {application.stage === "OFFER_REQUESTED" && (
          <Button
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await sendOfferToStudentAction(application.id);
                  toast("Offer sent to student.");
                } catch (err) {
                  toast((err as Error).message, "error");
                }
              })
            }
          >
            Send to student
          </Button>
        )}

        {application.stage === "OFFER_SENT" && (
          <span className="text-xs text-muted">Waiting for the student to reply</span>
        )}

        {application.stage === "OFFER_ACCEPTED" && !application.documentsVerified && !settingDeadline && (
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setSettingDeadline(true)}>
            {application.documentsDueAt ? "Change deadline" : "Set deadline"}
          </Button>
        )}
        {application.stage === "OFFER_ACCEPTED" && !application.documentsVerified && settingDeadline && (
          <span className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={deadline}
              min={todayYmd()}
              onChange={(e) => setDeadline(e.target.value)}
              className="rounded-lg border border-border-soft bg-white px-2 py-1 text-xs text-ink"
              aria-label="Document deadline"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={isPending || !deadline}
              onClick={() =>
                startTransition(async () => {
                  const r = await setDocumentDeadlineAction(application.id, deadline);
                  if (!r.ok) return toast(r.error, "error");
                  toast("Deadline saved. The student was told.");
                  setSettingDeadline(false);
                })
              }
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSettingDeadline(false)}>
              Cancel
            </Button>
          </span>
        )}
        {application.stage === "OFFER_ACCEPTED" && !application.documentsVerified && (
          <Button
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await verifyDocumentsAction(application.id);
                  toast("Documents marked as verified.");
                } catch (err) {
                  toast((err as Error).message, "error");
                }
              })
            }
          >
            Documents verified
          </Button>
        )}

        {application.stage === "OFFER_ACCEPTED" && application.documentsVerified && (
          <Button
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await markJoinedAction(application.id);
                  toast("Marked as joined.");
                } catch (err) {
                  toast((err as Error).message, "error");
                }
              })
            }
          >
            Mark as joined
          </Button>
        )}

        {application.stage === "JOINED" && !confirmingUndo && (
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setConfirmingUndo(true)}>
            Undo joined
          </Button>
        )}
        {application.stage === "JOINED" && confirmingUndo && (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Move back to documents verified?</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await undoJoinedAction(application.id);
                    toast("Moved back to documents verified.", "info");
                    setConfirmingUndo(false);
                  } catch (err) {
                    toast((err as Error).message, "error");
                  }
                })
              }
            >
              Yes, undo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingUndo(false)}>
              Keep joined
            </Button>
          </span>
        )}
      </div>
    </div>
  );
}
