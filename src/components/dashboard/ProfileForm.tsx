"use client";

import { updateStudentBasics } from "@/lib/actions/student";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

interface ProjectItem {
  title: string;
  description: string;
  tech: string;
}

interface Props {
  defaults: {
    skills: string[];
    certifications: string[];
    courses: string[];
    preferredRoles: string[];
    githubUrl: string | null;
    linkedinUrl: string | null;
    portfolioUrl: string | null;
    projects: { title: string; description: string; tech?: string[] }[];
  };
}

const fieldCls =
  "w-full rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-brand-300";

export function ProfileForm({ defaults }: Props) {
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);
  const [projects, setProjects] = useState<ProjectItem[]>(
    defaults.projects.map((p) => ({ title: p.title, description: p.description, tech: (p.tech ?? []).join(", ") }))
  );

  function update(i: number, patch: Partial<ProjectItem>) {
    setProjects((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  const projectsJson = JSON.stringify(
    projects.map((p) => ({
      title: p.title,
      description: p.description,
      tech: p.tech
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    }))
  );

  return (
    <form
      action={async (formData) => {
        try {
          await updateStudentBasics(formData);
          setSaved(true);
          toast("Profile saved.");
          setTimeout(() => setSaved(false), 2500);
        } catch (err) {
          toast((err as Error).message || "Could not save. Please try again.", "error");
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
        label="Preferred roles or domains (comma-separated)"
        name="preferredRoles"
        defaultValue={defaults.preferredRoles.join(", ")}
      />

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-muted">Projects</label>
          <button
            type="button"
            onClick={() => setProjects((prev) => [...prev, { title: "", description: "", tech: "" }])}
            disabled={projects.length >= 10}
            className="inline-flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add project
          </button>
        </div>
        <input type="hidden" name="projects" value={projectsJson} />

        {projects.length === 0 && (
          <p className="text-xs text-muted rounded-xl border border-dashed border-border-soft px-4 py-4">
            No projects yet. Add one by hand, or upload your resume above and they will be filled in for you.
          </p>
        )}

        <div className="space-y-3">
          {projects.map((p, i) => (
            <div key={i} className="rounded-xl border border-border-soft bg-surface p-4 space-y-3">
              <div className="flex items-start gap-2">
                <input
                  value={p.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  placeholder="Project title"
                  maxLength={120}
                  className="flex-1 rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-300"
                />
                <button
                  type="button"
                  onClick={() => setProjects((prev) => prev.filter((_, idx) => idx !== i))}
                  className="p-2 text-muted hover:text-rose-600"
                  aria-label={`Remove project ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <textarea
                value={p.description}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder="What did you build, and what was your part?"
                rows={3}
                maxLength={800}
                className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-300"
              />
              <input
                value={p.tech}
                onChange={(e) => update(i, { tech: e.target.value })}
                placeholder="Technologies used (comma-separated), optional"
                className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-300"
              />
            </div>
          ))}
        </div>
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
      <input name={name} defaultValue={defaultValue} className={fieldCls} />
    </div>
  );
}
