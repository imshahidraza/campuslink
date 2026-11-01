"use client";

import { useTransition } from "react";
import { sendOfferToStudentAction, verifyDocumentsAction, markJoinedAction } from "@/lib/actions/offers";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { stageLabel } from "@/lib/utils";

interface OfferApplication {
  id: string;
  stage: string;
  offerPackage: string | null;
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

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-soft py-3 last:border-0">
      <div>
        <p className="text-sm font-medium text-ink">{application.student.user.name}</p>
        <p className="text-xs text-muted">
          {application.drive.jobRole} · {application.drive.companyName} · {application.offerPackage || "—"}
          {application.stage === "OFFER_ACCEPTED" && application.documentsVerified && " · Documents verified"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={stageTone[application.stage] || "neutral"}>{stageLabel(application.stage)}</Badge>

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
          <span className="text-xs text-muted">Awaiting student response</span>
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
                  toast("Documents verified.");
                } catch (err) {
                  toast((err as Error).message, "error");
                }
              })
            }
          >
            Verify documents
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
            Mark joined
          </Button>
        )}
      </div>
    </div>
  );
}
