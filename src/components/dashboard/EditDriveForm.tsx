"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDriveAction } from "@/lib/actions/drives";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Sparkles } from "lucide-react";

interface Props {
  driveId: string;
  defaults: {
    jobRole: string;
    jobDescriptionRaw: string;
    minCgpa: string;
    maxBacklogs: string;
    eligibleBranches: string;
    eligibleGradYears: string;
    driveDate: string;
    venue: string;
  };
}

export function EditDriveForm({ driveId, defaults }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          try {
            const { jdReanalyzed } = await updateDriveAction(driveId, formData);
            toast(jdReanalyzed ? "Drive updated — JD re-analyzed with AI." : "Drive updated.");
            router.push(`/recruiter/drives/${driveId}`);
            router.refresh();
          } catch (err) {
            setError((err as Error).message);
            toast((err as Error).message, "error");
          }
        });
      }}
      className="space-y-5"
    >
      <Field label="Job role" name="jobRole" defaultValue={defaults.jobRole} required />

      <div>
        <label className="text-xs text-muted mb-1.5 block">Job description</label>
        <textarea
          name="jobDescriptionRaw"
          rows={8}
          required
          defaultValue={defaults.jobDescriptionRaw}
          className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm text-ink focus:outline-none focus:border-brand-300"
        />
        <p className="text-xs text-muted mt-1.5">
          Only changed if you edit this text — Gemma re-extracts required/preferred skills when it does.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Minimum CGPA" name="minCgpa" defaultValue={defaults.minCgpa} />
        <Field label="Max backlogs" name="maxBacklogs" defaultValue={defaults.maxBacklogs} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Eligible specializations (comma-separated)" name="eligibleBranches" defaultValue={defaults.eligibleBranches} />
        <Field label="Eligible grad years (comma-separated)" name="eligibleGradYears" defaultValue={defaults.eligibleGradYears} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Drive date" name="driveDate" type="date" defaultValue={defaults.driveDate} />
        <Field label="Venue" name="venue" defaultValue={defaults.venue} />
      </div>

      {error && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}

      <Button type="submit" disabled={isPending}>
        <Sparkles className="h-4 w-4" />
        {isPending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted mb-1.5 block">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-brand-300"
      />
    </div>
  );
}
