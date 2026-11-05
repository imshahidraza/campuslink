"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

/** Inline panel: optional growth-framed note, then confirm. Shared by the placement cell and recruiter "Not selected" actions. */
export function RejectWithFeedback({
  confirmLabel,
  disabled,
  onConfirm,
  onCancel,
}: {
  confirmLabel: string;
  disabled: boolean;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="mt-3 bg-surface rounded-lg p-3 border border-border-soft">
      <label className="text-xs text-muted block">
        Feedback for the student (optional). Keep it constructive, so they know what to work on next. Press Enter to start a new line.
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="e.g. Strong technically. Work on communication and system design depth."
          className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink"
        />
      </label>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onConfirm(note)}>
          {confirmLabel}
        </Button>
        <Button size="sm" variant="ghost" disabled={disabled} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
