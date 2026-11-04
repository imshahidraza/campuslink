"use client";

import { useState, useTransition } from "react";
import { updateDriveStatusAction, tpoUpdateEligibilityAction } from "@/lib/actions/drives";
import { runBulkMatchingForDriveAction } from "@/lib/actions/matching";
import { Button } from "@/components/ui/Button";
import { AiWaitNote } from "@/components/ui/Loader";
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
              toast(`Drive status set to ${s.replace("_", " ").toLowerCase()}.`);
            })
          }
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            s === status
              ? "bg-brand-500 text-white border-brand-500"
              : "border-border-soft text-muted hover:border-brand-300"
          }`}
        >
          {s.replace("_", " ").charAt(0) + s.replace("_", " ").slice(1).toLowerCase()}
        </button>
      ))}
    </div>
  );
}

export function BulkMatchButton({ driveId }: { driveId: string }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ totalApplicants: number; needed: number; processed: number; errors: string[] } | null>(
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
            toast(
              r.needed === 0
                ? "Every applicant already has an AI score."
                : `Scored ${r.processed} of ${r.needed} applicants.`
            );
          })
        }
      >
        <Sparkles className="h-4 w-4" />
        {isPending ? "Running AI matching..." : "Run AI matching for applicants"}
      </Button>
      {isPending && (
        <div className="mt-2 space-y-1">
          <AiWaitNote show label="This can take up to a minute for each applicant." />
          <p className="text-xs text-muted">Gemma scores one applicant at a time. You can keep this page open.</p>
        </div>
      )}
      {result && (
        <p className="text-xs text-muted mt-2">
          {result.needed === 0
            ? `All ${result.totalApplicants} applicants already have a score.`
            : `Scored ${result.processed} of ${result.needed} applicants without a score.`}
          {result.errors.length > 0 && ` ${result.errors.length} could not be scored.`}
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
          toast((err as Error).message || "Couldn't save. Please try again.", "error");
        }
      }}
      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
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
      <div className="col-span-2">
        <label className="text-xs text-muted block mb-1">Specialization</label>
        <p className="text-[11px] text-muted/80 mb-1.5 leading-snug">
          Enter &apos;All&apos; to allow candidates from any specialization.
        </p>
        <input
          name="eligibleBranches"
          defaultValue={defaults.eligibleBranches}
          placeholder="e.g. Data Science, Cloud Computing or All"
          className="w-full rounded-lg border border-border-soft px-3 py-2 text-sm"
        />
      </div>
      <div className="col-span-2">
        <label className="text-xs text-muted block mb-1.5">Graduation years (comma-separated)</label>
        <input
          name="eligibleGradYears"
          defaultValue={defaults.eligibleGradYears}
          placeholder="e.g. 2026"
          className="w-full rounded-lg border border-border-soft px-3 py-2 text-sm"
        />
      </div>
      <div className="col-span-2 flex items-center gap-3">
        <Button type="submit" size="sm" variant="secondary">
          Save eligibility rules
        </Button>
        {saved && <span className="text-xs text-emerald-600">Saved.</span>}
      </div>
    </form>
  );
}
