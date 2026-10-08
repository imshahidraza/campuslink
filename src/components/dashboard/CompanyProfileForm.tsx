"use client";

import { useTransition } from "react";
import { updateRecruiterProfileAction } from "@/lib/actions/recruiter";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface Props {
  defaults: { companyName: string; industry: string; website: string; companyDesc: string };
}

export function CompanyProfileForm({ defaults }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          try {
            await updateRecruiterProfileAction(formData);
            toast("Company profile saved.");
          } catch (err) {
            toast((err as Error).message || "Couldn't save — try again.", "error");
          }
        });
      }}
      className="space-y-4"
    >
      <div>
        <label className="text-xs text-muted mb-1.5 block">Company name</label>
        <input
          name="companyName"
          defaultValue={defaults.companyName}
          className="w-full rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-brand-300"
        />
      </div>
      <div>
        <label className="text-xs text-muted mb-1.5 block">Industry</label>
        <input
          name="industry"
          defaultValue={defaults.industry}
          className="w-full rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-brand-300"
        />
      </div>
      <div>
        <label className="text-xs text-muted mb-1.5 block">Website</label>
        <input
          name="website"
          defaultValue={defaults.website}
          className="w-full rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-brand-300"
        />
      </div>
      <div>
        <label className="text-xs text-muted mb-1.5 block">About</label>
        <textarea
          name="companyDesc"
          rows={4}
          defaultValue={defaults.companyDesc}
          className="w-full rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-brand-300"
        />
      </div>
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
