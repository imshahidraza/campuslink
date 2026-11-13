"use client";

import { useTransition } from "react";
import { saveProfileSetupAction } from "@/lib/actions/recruiter";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface Props {
  defaults: {
    name: string;
    contactRole: string;
    companyName: string;
    industry: string;
    website: string;
    companyDesc: string;
  };
}

const inputCls =
  "w-full rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-brand-300";

export function ProfileSetupForm({ defaults }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const r = await saveProfileSetupAction(formData);
          if (r.ok) toast("Profile saved.");
          else toast(r.error, "error");
        });
      }}
      className="space-y-6"
    >
      <div>
        <p className="text-xs font-medium text-muted uppercase tracking-wide">About you</p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="ps-name" className="text-xs text-muted mb-1.5 block">Your name</label>
            <input id="ps-name" name="name" required maxLength={80} defaultValue={defaults.name} className={inputCls} />
          </div>
          <div>
            <label htmlFor="ps-role" className="text-xs text-muted mb-1.5 block">Your role</label>
            <input
              id="ps-role"
              name="contactRole"
              maxLength={60}
              defaultValue={defaults.contactRole}
              placeholder="e.g. HR Manager"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-muted uppercase tracking-wide">Your company</p>
        <div className="mt-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ps-company" className="text-xs text-muted mb-1.5 block">Company name</label>
              <input id="ps-company" name="companyName" required maxLength={120} defaultValue={defaults.companyName} className={inputCls} />
            </div>
            <div>
              <label htmlFor="ps-industry" className="text-xs text-muted mb-1.5 block">Industry</label>
              <input
                id="ps-industry"
                name="industry"
                maxLength={80}
                defaultValue={defaults.industry}
                placeholder="e.g. Software or Fintech"
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label htmlFor="ps-site" className="text-xs text-muted mb-1.5 block">Company website</label>
            <input
              id="ps-site"
              name="website"
              type="text"
              inputMode="url"
              maxLength={300}
              defaultValue={defaults.website}
              placeholder="https://www.yourcompany.com"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="ps-about" className="text-xs text-muted mb-1.5 block">About the company</label>
            <textarea id="ps-about" name="companyDesc" rows={5} maxLength={2000} defaultValue={defaults.companyDesc} className={inputCls} />
          </div>
        </div>
      </div>

      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Saving..." : "Save profile"}
      </Button>
    </form>
  );
}
