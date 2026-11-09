"use client";

import { useToast } from "@/components/ui/Toast";
import { useTransition } from "react";

export function MarkReadButton({ onMarkRead }: { onMarkRead: () => Promise<void> }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(async () => { await onMarkRead(); toast("Marked as read.", "info"); })}
      disabled={isPending}
      className="text-xs text-brand-500 hover:text-brand-600 font-medium shrink-0"
    >
      Mark read
    </button>
  );
}
