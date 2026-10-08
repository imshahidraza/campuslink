"use client";

import { markNotificationReadAction } from "@/lib/actions/student";
import { useToast } from "@/components/ui/Toast";
import { useTransition } from "react";

export function MarkReadButton({ id }: { id: string }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(async () => { await markNotificationReadAction(id); toast("Marked as read.", "info"); })}
      disabled={isPending}
      className="text-xs text-brand-500 hover:text-brand-600 font-medium shrink-0"
    >
      Mark read
    </button>
  );
}
