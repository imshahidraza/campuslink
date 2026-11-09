"use client";

import { useState, useTransition } from "react";
import { sendOfferToStudentAction, verifyDocumentsAction, markJoinedAction, undoJoinedAction } from "@/lib/actions/offers";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { journeyLabel } from "@/lib/utils";

interface OfferApplication {
  id: string;
  stage: string;
  offerPackage: string | null;
  offerMessage?: string | null;
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

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-soft py-3 last:border-0">
      <div>
        <p className="text-sm font-medium text-ink break-words">{application.student.user.name}</p>
        <p className="text-xs text-muted">
          {application.drive.jobRole} · {application.drive.companyName}{application.offerPackage ? ` · ${application.offerPackage}` : ""}
        </p>
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
