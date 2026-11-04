"use client";

import { useState, useTransition } from "react";
import { PartyPopper } from "lucide-react";
import { studentRespondToOfferAction } from "@/lib/actions/offers";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function OfferResponseButtons({ applicationId, docsEmail }: { applicationId: string; docsEmail: string | null }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [accepted, setAccepted] = useState(false);

  function respond(response: "ACCEPT" | "DECLINE") {
    startTransition(async () => {
      try {
        await studentRespondToOfferAction(applicationId, response);
        if (response === "ACCEPT") setAccepted(true);
        else toast("Offer declined.", "info");
      } catch (err) {
        toast((err as Error).message, "error");
      }
    });
  }

  return (
    <>
      <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-4">
        <p className="text-sm text-ink font-medium">You have an offer waiting for your reply.</p>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          Declining doesn&apos;t affect your other applications. You can still apply to other drives.
        </p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" disabled={isPending} onClick={() => respond("ACCEPT")}>
            {isPending ? "Saving..." : "Accept offer"}
          </Button>
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => respond("DECLINE")}>
            Decline
          </Button>
        </div>
      </div>

      {accepted && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="offer-accepted-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="h-11 w-11 rounded-full bg-brand-950 text-accent-lime flex items-center justify-center">
              <PartyPopper className="h-5 w-5" />
            </div>
            <h2 id="offer-accepted-title" className="mt-4 text-lg font-semibold text-ink">
              You accepted the offer
            </h2>
            <p className="mt-2 text-sm text-muted leading-relaxed">
              Please email your important documents to{" "}
              {docsEmail ? (
                <a href={`mailto:${docsEmail}`} className="font-medium text-ink underline break-all">
                  {docsEmail}
                </a>
              ) : (
                "the placement cell"
              )}{" "}
              for verification. Once they are verified, the placement cell will update your profile as joined.
            </p>
            <Button className="mt-5" onClick={() => setAccepted(false)}>
              Got it
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
