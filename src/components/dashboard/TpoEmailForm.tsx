"use client";

import { useTransition } from "react";
import { saveTpoEmailAction } from "@/lib/actions/college";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function TpoEmailForm({ defaultValue, fallback }: { defaultValue: string; fallback: string | null }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            await saveTpoEmailAction(fd);
            toast("Email saved.");
          } catch (err) {
            toast((err as Error).message, "error");
          }
        })
      }
      className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3"
    >
      <div className="flex-1">
        <label className="text-xs text-muted mb-1.5 block">Email for student documents</label>
        <input
          name="tpoEmail"
          type="email"
          defaultValue={defaultValue}
          placeholder={fallback ? `Leave blank to use ${fallback}` : "e.g. placement@yourcollege.edu"}
          autoComplete="off"
          className="w-full rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-brand-300"
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
