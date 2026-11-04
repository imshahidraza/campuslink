"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDriveAction } from "@/lib/actions/drives";
import { Button } from "@/components/ui/Button";
import { Sparkles } from "lucide-react";

export function CreateDriveForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          try {
            const drive = await createDriveAction(formData);
            router.push(`/recruiter/drives/${drive.id}`);
          } catch (err) {
            setError((err as Error).message);
          }
        });
      }}
      className="space-y-5"
    >
      <Field label="Job role" name="jobRole" placeholder="e.g. Software Development Engineer" required />

      <div>
        <label className="text-xs text-muted mb-1.5 block">Job description</label>
        <textarea
          name="jobDescriptionRaw"
          rows={8}
          required
          placeholder="Paste the full job description. Gemma will extract the required and preferred skills and a short summary."
          className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm text-ink focus:outline-none focus:border-brand-300"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Minimum CGPA" name="minCgpa" placeholder="e.g. 7.0" />
        <Field label="Max backlogs" name="maxBacklogs" placeholder="e.g. 0" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Specialization"
          hint="Enter 'All' to allow candidates from any specialization."
          name="eligibleBranches"
          placeholder="e.g. Data Science, Cloud Computing or All"
        />
        <Field label="Graduation years (comma-separated)" name="eligibleGradYears" placeholder="e.g. 2026" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Drive date" name="driveDate" type="date" />
        <Field label="Apply by (optional)" name="applyDeadline" type="date" />
      </div>
      <Field label="Venue" name="venue" placeholder="Seminar Hall or Online" />

      {error && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}

      <Button type="submit" disabled={isPending}>
        <Sparkles className="h-4 w-4" />
        {isPending ? "Analyzing JD with Gemma..." : "Create drive"}
      </Button>
    </form>
  );
}

function Field({
  label,
  hint,
  name,
  placeholder,
  required,
  type = "text",
}: {
  label: string;
  hint?: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted mb-1 block">{label}</label>
      {hint && <p className="text-[11px] text-muted/80 mb-1.5 leading-snug">{hint}</p>}
      {!hint && <div className="mb-0.5" />}
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-brand-300"
      />
    </div>
  );
}
