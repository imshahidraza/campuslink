"use client";

import { useTransition } from "react";
import { updateOfferStatusAction } from "@/lib/actions/offers";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

export function OfferRow({
  application,
}: {
  application: {
    id: string;
    offerPackage: string | null;
    offerStatus: string | null;
    documentsVerified: boolean;
    joined: boolean;
    student: { rollNo: string; user: { name: string } };
    drive: { jobRole: string; companyName: string };
  };
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between border-b border-border-soft py-3 last:border-0">
      <div>
        <p className="text-sm font-medium text-ink">{application.student.user.name}</p>
        <p className="text-xs text-muted">
          {application.drive.jobRole} · {application.drive.companyName} · {application.offerPackage || "—"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={application.joined ? "success" : "brand"}>
          {application.joined ? "Joined" : application.offerStatus || "Offer Received"}
        </Badge>
        {!application.documentsVerified && (
          <Button
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => { await updateOfferStatusAction(application.id, "Offer Accepted", true); toast("Documents verified — offer accepted."); })
            }
          >
            Verify docs &amp; accept
          </Button>
        )}
        {application.offerStatus !== "Offer Declined" && !application.joined && (
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => startTransition(async () => { await updateOfferStatusAction(application.id, "Offer Declined"); toast("Offer marked as declined.", "info"); })}
          >
            Mark declined
          </Button>
        )}
      </div>
    </div>
  );
}
