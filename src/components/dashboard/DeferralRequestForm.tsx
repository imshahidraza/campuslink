"use client";

import { useState, useTransition } from "react";
import { requestDeferralAction } from "@/lib/actions/offerChanges";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { todayYmd, addMonthsYmd, MAX_DEFERRAL_MONTHS } from "@/lib/offerRules";

/** The student asks the placement cell to move their joining date. Both boxes are checked again on the server. */
export function DeferralRequestForm({ applicationId, currentJoining }: { applicationId: string; currentJoining: string | null }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [newDate, setNewDate] = useState("");

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Request deferral
      </Button>
    );
  }

  const today = todayYmd();
  const earliest = currentJoining && currentJoining > today ? currentJoining : today;

  return (
    <div className="mt-3 rounded-xl border border-border-soft bg-surface p-4 space-y-3">
      <p className="text-sm font-medium text-ink">Ask to join later</p>
      <p className="text-xs text-muted leading-relaxed">
        Tell the placement cell why you need a later joining date. They will approve or decline it, and you will see the answer here and in
        your notifications.
      </p>
      <label className="block text-xs text-muted">
        New joining date you are asking for
        <input
          type="date"
          value={newDate}
          min={earliest}
          max={addMonthsYmd(today, MAX_DEFERRAL_MONTHS)}
          onChange={(e) => setNewDate(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink"
        />
      </label>
      <label className="block text-xs text-muted">
        Reason
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="For example: my final semester exams end after the current joining date."
          className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink leading-relaxed"
        />
      </label>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={isPending || reason.trim().length < 10 || !newDate}
          onClick={() =>
            startTransition(async () => {
              const r = await requestDeferralAction(applicationId, { reason, newDate });
              if (!r.ok) return toast(r.error, "error");
              toast("Request sent to the placement cell.");
              setOpen(false);
              setReason("");
              setNewDate("");
            })
          }
        >
          {isPending ? "Sending..." : "Send request"}
        </Button>
        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
