"use client";

import { useState, useTransition } from "react";
import { updateApplicationStageAction } from "@/lib/actions/matching";
import { Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { stageLabel } from "@/lib/utils";
import { Award } from "lucide-react";

interface Props {
  application: {
    id: string;
    stage: string;
    fitScore: number | null;
    matchedSkills: string[];
    missingSkills: string[];
    relevantProjects: string[];
    matchExplanation: string | null;
    specialConsideration?: boolean;
    specialConsiderationNote?: string | null;
    student: { rollNo: string; branch: string; githubUrl: string | null; user: { name: string } };
  };
}

const stageTone: Record<string, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  ELIGIBLE: "neutral",
  SHORTLISTED: "brand",
  INTERVIEW: "warning",
  SELECTED: "success",
  OFFER: "success",
  REJECTED: "danger",
};

export function RecruiterCandidateRow({ application }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border-soft py-4 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">{application.student.user.name}</p>
          <p className="text-xs text-muted">
            {application.student.rollNo} · {application.student.branch}
          </p>
          {application.specialConsiderationNote && (
            <p className="text-xs text-amber-700 mt-1 italic">&quot;{application.specialConsiderationNote}&quot;</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {application.specialConsideration && (
            <Badge tone="warning" className="flex items-center gap-1">
              <Award className="h-3 w-3" /> TPO Recommended
            </Badge>
          )}
          {application.fitScore != null && (
            <span className="text-sm font-semibold text-brand-600">{application.fitScore}</span>
          )}
          <Badge tone={stageTone[application.stage] || "neutral"}>{stageLabel(application.stage)}</Badge>
          {application.matchExplanation && (
            <button onClick={() => setExpanded((e) => !e)} className="text-xs text-brand-500 hover:text-brand-600">
              {expanded ? "Hide" : "Why?"}
            </button>
          )}
        </div>
      </div>

      {expanded && application.matchExplanation && (
        <div className="mt-3 rounded-lg bg-surface border border-border-soft p-3 text-sm text-muted">
          {application.matchExplanation}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {application.matchedSkills.map((s) => (
              <Badge key={s} tone="success">
                ✓ {s}
              </Badge>
            ))}
            {application.missingSkills.map((s) => (
              <Badge key={s} tone="warning">
                {s}
              </Badge>
            ))}
          </div>
          {application.relevantProjects.length > 0 && (
            <p className="mt-2 text-xs">
              <span className="font-medium text-ink">Relevant projects: </span>
              {application.relevantProjects.join(", ")}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={isPending}
          onClick={() => startTransition(async () => { await updateApplicationStageAction(application.id, "SHORTLISTED"); toast("Candidate shortlisted."); })}
        >
          Shortlist
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => startTransition(async () => { await updateApplicationStageAction(application.id, "REJECTED"); toast("Candidate passed.", "info"); })}
        >
          Pass
        </Button>
      </div>
    </div>
  );
}
