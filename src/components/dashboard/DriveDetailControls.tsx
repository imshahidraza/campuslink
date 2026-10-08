"use client";

import { useState, useTransition } from "react";
import { updateDriveStatusAction, tpoUpdateEligibilityAction } from "@/lib/actions/drives";
import { runBulkMatchingForDriveAction } from "@/lib/actions/matching";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Sparkles } from "lucide-react";

export function DriveStatusControl({ driveId, status }: { driveId: string; status: string }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const statuses = ["DRAFT", "OPEN", "IN_PROGRESS", "CLOSED"] as const;

  return (
    <div className="flex items-center gap-2">
      {statuses.map((s) => (
        <button
          key={s}
          disabled={isPending || s === status}
          onClick={() =>
            startTransition(async () => {
              await updateDriveStatusAction(driveId, s);
              toast(`Drive status set to ${s.replace("_", " ")}.`);
            })
          }
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            s === status
              ? "bg-brand-500 text-white border-brand-500"
              : "border-border-soft text-muted hover:border-brand-300"
          }`}
        >
          {s.replace("_", " ")}
        </button>
      ))}
    </div>
  );
}

export function BulkMatchButton({ driveId }: { driveId: string }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ totalEligible: number; processed: number; errors: string[] } | null>(
    null
  );

  return (
    <div>
      <Button
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const r = await runBulkMatchingForDriveAction(driveId);
            setResult(r);
            toast(`Matched ${r.processed}/${r.totalEligible} eligible students.`);
          })
        }
      >
        <Sparkles className="h-4 w-4" />
        {isPending ? "Running AI matching..." : "Run AI matching for all eligible students"}
      </Button>
      {isPending && (
        <p className="text-xs text-muted mt-2">
          Calling Gemma once per eligible student — this can take a while locally. Feel free to wait.
        </p>
      )}
      {result && (
        <p className="text-xs text-muted mt-2">
          Matched {result.processed}/{result.totalEligible} eligible students.
          {result.errors.length > 0 && ` ${result.errors.length} failed.`}
        </p>
      )}
    </div>
  );
}

export function EligibilityForm({
  driveId,
  defaults,
}: {
  driveId: string;
  defaults: { minCgpa: string; maxBacklogs: string; eligibleBranches: string; eligibleGradYears: string };
}) {
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);
  return (
    <form
      action={async (formData) => {
        try {
          await tpoUpdateEligibilityAction(driveId, formData);
          setSaved(true);
          toast("Eligibility rules saved.");
          setTimeout(() => setSaved(false), 2000);
        } catch (err) {
          toast((err as Error).message || "Couldn't save — try again.", "error");
        }
      }}
      className="grid grid-cols-2 gap-3"
    >
      <input
        name="minCgpa"
        defaultValue={defaults.minCgpa}
        placeholder="Min CGPA"
        className="rounded-lg border border-border-soft px-3 py-2 text-sm"
      />
      <input
        name="maxBacklogs"
        defaultValue={defaults.maxBacklogs}
        placeholder="Max backlogs"
        className="rounded-lg border border-border-soft px-3 py-2 text-sm"
      />
      <input
        name="eligibleBranches"
        defaultValue={defaults.eligibleBranches}
        placeholder="Eligible specializations (comma-separated)"
        className="col-span-2 rounded-lg border border-border-soft px-3 py-2 text-sm"
      />
      <input
        name="eligibleGradYears"
        defaultValue={defaults.eligibleGradYears}
        placeholder="Eligible grad years (comma-separated)"
        className="col-span-2 rounded-lg border border-border-soft px-3 py-2 text-sm"
      />
      <div className="col-span-2 flex items-center gap-3">
        <Button type="submit" size="sm" variant="secondary">
          Save eligibility rules
        </Button>
        {saved && <span className="text-xs text-emerald-600">Saved.</span>}
      </div>
    </form>
  );
}
