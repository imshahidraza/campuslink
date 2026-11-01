"use client";

import { useTransition } from "react";
import { studentRespondToOfferAction } from "@/lib/actions/offers";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function OfferResponseButtons({ applicationId }: { applicationId: string }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function respond(response: "ACCEPT" | "DECLINE") {
    startTransition(async () => {
      try {
        await studentRespondToOfferAction(applicationId, response);
        toast(response === "ACCEPT" ? "Offer accepted!" : "Offer declined.");
      } catch (err) {
        toast((err as Error).message, "error");
      }
    });
  }

  return (
    <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-4">
      <p className="text-sm text-ink font-medium">You have an offer awaiting your response.</p>
      <p className="text-xs text-muted mt-1">
        Declining doesn&apos;t affect your other applications — you can still pursue other drives.
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={isPending} onClick={() => respond("ACCEPT")}>
          Accept offer
        </Button>
        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => respond("DECLINE")}>
          Decline
        </Button>
      </div>
    </div>
  );
}
