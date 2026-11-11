"use client";

import { useState, useTransition } from "react";
import { announceDriveAction } from "@/lib/actions/automation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/** The placement cell announces an open drive to eligible students, or reminds those who have not applied. */
export function AnnounceDriveCard({
  driveId,
  open,
  eligible,
  notApplied,
  lastAnnounced,
  lastCount,
}: {
  driveId: string;
  open: boolean;
  eligible: number;
  notApplied: number;
  lastAnnounced: string | null; // already formatted on the server
  lastCount: number | null;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");

  function send(mode: "ANNOUNCE" | "REMIND") {
    startTransition(async () => {
      const r = await announceDriveAction(driveId, mode, note);
      if (!r.ok) return toast(r.error, "error");
      const sent = r.data.sent;
      toast(sent === 0 ? "Nobody to message right now." : `Sent to ${sent} student${sent === 1 ? "" : "s"}.`, sent === 0 ? "info" : "success");
      setNote("");
    });
  }

  return (
    <div>
      <p className="text-sm text-muted leading-relaxed">
        {eligible} student{eligible === 1 ? "" : "s"} meet the rules for this drive, and {notApplied} of them {notApplied === 1 ? "has" : "have"} not applied yet.
        Only eligible students are messaged.
      </p>
      {lastAnnounced && (
        <p className="text-xs text-muted mt-2">
          Last announced {lastAnnounced}
          {lastCount != null ? ` to ${lastCount} student${lastCount === 1 ? "" : "s"}` : ""}.
        </p>
      )}
      {!open && <p className="text-xs text-amber-800 mt-2">Set the drive to Open before announcing it.</p>}
      <label className="block text-xs text-muted mt-3">
        Add a short note (optional)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={300}
          placeholder="For example: bring your updated resume to the pre-placement talk."
          className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={isPending || !open || eligible === 0} onClick={() => send("ANNOUNCE")}>
          {isPending ? "Sending..." : "Announce to eligible students"}
        </Button>
        <Button size="sm" variant="secondary" disabled={isPending || !open || notApplied === 0} onClick={() => send("REMIND")}>
          Remind those who have not applied
        </Button>
      </div>
    </div>
  );
}
