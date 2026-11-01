"use client";

import { useState, useTransition } from "react";
import { Sparkles, Target } from "lucide-react";
import { generateRoadmapAction } from "@/lib/actions/student";
import { Button } from "@/components/ui/Button";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

export interface RoadmapData {
  steps: { skill: string; whyItMatters: string; howToLearn: string; miniProject: string }[];
  basedOn: { skill: string; drives: number; roles: string[] }[];
}

export function RoadmapCard({ existing, updatedAt }: { existing: RoadmapData | null; updatedAt: string | null }) {
  const [data, setData] = useState<RoadmapData | null>(existing);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function build() {
    setError(null);
    startTransition(async () => {
      try {
        setData((await generateRoadmapAction()) as RoadmapData);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Target className="h-4 w-4 text-brand-500" />
        <CardTitle>Skills to learn next</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted">
          We look at the open drives you&apos;re eligible for, find the skills they ask for that your profile doesn&apos;t
          show, and suggest how to start. The ranking is rule-based; AI only writes the learning tips.
        </p>

        {data && data.steps.length === 0 && (
          <p className="mt-4 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
            Nice — your profile already covers every skill listed by the drives you&apos;re eligible for.
          </p>
        )}

        {data && data.steps.length > 0 && (
          <div className="mt-4 space-y-3">
            {data.steps.map((s) => {
              const gap = data.basedOn.find((g) => g.skill.toLowerCase() === s.skill.toLowerCase());
              return (
                <div key={s.skill} className="rounded-xl border border-border-soft bg-surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{s.skill}</p>
                    {gap && (
                      <Badge tone="brand">
                        asked by {gap.drives} drive{gap.drives === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-muted">{s.whyItMatters}</p>
                  <p className="mt-2 text-sm text-ink">
                    <span className="font-medium">How to start: </span>
                    {s.howToLearn}
                  </p>
                  <p className="mt-1 text-sm text-ink">
                    <span className="font-medium">Mini project: </span>
                    {s.miniProject}
                  </p>
                </div>
              );
            })}
            {updatedAt && <p className="text-xs text-muted">Last built {new Date(updatedAt).toLocaleDateString()}.</p>}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={build} disabled={isPending}>
            <Sparkles className="h-3.5 w-3.5" />
            {isPending ? "Thinking with Gemma..." : data ? "Rebuild roadmap" : "Build my roadmap"}
          </Button>
          {isPending && <span className="text-xs text-muted">This can take a minute on local hardware.</span>}
        </div>
      </CardContent>
    </Card>
  );
}
