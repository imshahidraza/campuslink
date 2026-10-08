"use client";

import { updateStudentBasics } from "@/lib/actions/student";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useState } from "react";

interface Props {
  defaults: {
    skills: string[];
    certifications: string[];
    courses: string[];
    preferredRoles: string[];
    githubUrl: string | null;
    linkedinUrl: string | null;
    portfolioUrl: string | null;
    projectsRaw: string;
  };
}

export function ProfileForm({ defaults }: Props) {
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);

  return (
    <form
      action={async (formData) => {
        try {
          await updateStudentBasics(formData);
          setSaved(true);
          toast("Profile saved.");
          setTimeout(() => setSaved(false), 2500);
        } catch (err) {
          toast((err as Error).message || "Couldn't save — try again.", "error");
        }
      }}
      className="space-y-5"
    >
      <Field label="Skills (comma-separated)" name="skills" defaultValue={defaults.skills.join(", ")} />
      <Field
        label="Certifications (comma-separated)"
        name="certifications"
        defaultValue={defaults.certifications.join(", ")}
      />
      <Field label="Relevant courses (comma-separated)" name="courses" defaultValue={defaults.courses.join(", ")} />
      <Field
        label="Preferred roles / domains (comma-separated)"
        name="preferredRoles"
        defaultValue={defaults.preferredRoles.join(", ")}
      />

      <div>
        <label className="text-xs text-muted mb-1.5 block">Projects (JSON, or leave as-is from resume parsing)</label>
        <textarea
          name="projects"
          rows={4}
          defaultValue={defaults.projectsRaw}
          className="w-full rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm text-ink font-mono focus:outline-none focus:border-brand-300"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="GitHub URL" name="githubUrl" defaultValue={defaults.githubUrl || ""} />
        <Field label="LinkedIn URL" name="linkedinUrl" defaultValue={defaults.linkedinUrl || ""} />
        <Field label="Portfolio URL" name="portfolioUrl" defaultValue={defaults.portfolioUrl || ""} />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm">
          Save profile
        </Button>
        {saved && <span className="text-xs text-emerald-600">Saved.</span>}
      </div>
    </form>
  );
}

function Field({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return (
    <div>
      <label className="text-xs text-muted mb-1.5 block">{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-brand-300"
      />
    </div>
  );
}
