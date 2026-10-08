"use client";

import { useState, useTransition } from "react";
import { runReadinessAnalysisAction, generatePrepPlanAction } from "@/lib/actions/student";
import { Button } from "@/components/ui/Button";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { readinessLabel } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import type { ReadinessResult, PrepPlan } from "@/lib/ai";

const levelTone: Record<string, "success" | "brand" | "warning" | "danger"> = {
  HIGHLY_READY: "success",
  READY: "brand",
  DEVELOPING: "warning",
  NOT_READY: "danger",
};

export function ReadinessPanel({
  existing,
  preferredRoles,
}: {
  existing: ReadinessResult | null;
  preferredRoles: string[];
}) {
  const [result, setResult] = useState<ReadinessResult | null>(existing);
  const [prep, setPrep] = useState<PrepPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isPrepPending, startPrepTransition] = useTransition();

  function handleAnalyze() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await runReadinessAnalysisAction();
        setResult(r);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function handlePrep() {
    setError(null);
    startPrepTransition(async () => {
      try {
        const plan = await generatePrepPlanAction(preferredRoles[0] || "Software Engineer");
        setPrep(plan);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button onClick={handleAnalyze} disabled={isPending}>
          <Sparkles className="h-4 w-4" />
          {isPending ? "Analyzing with Gemma..." : result ? "Re-run analysis" : "Run readiness analysis"}
        </Button>
        {isPending && (
          <span className="text-xs text-muted">Reading your profile locally — this can take a bit.</span>
        )}
      </div>

      {error && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}

      {result && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Readiness level</CardTitle>
              <Badge tone={levelTone[result.readinessLevel] || "neutral"}>
                {readinessLabel(result.readinessLevel)}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-ink leading-relaxed">{result.summary}</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <ListCard title="Strengths" items={result.strengths} tone="success" />
            <ListCard title="Skill gaps" items={result.skillGaps} tone="warning" />
            <ListCard title="Improvement areas" items={result.improvementAreas} tone="brand" />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Personalized prep plan</CardTitle>
              <Button onClick={handlePrep} disabled={isPrepPending} size="sm" variant="secondary">
                {isPrepPending ? "Generating..." : "Generate plan"}
              </Button>
            </CardHeader>
            {prep && (
              <CardContent className="space-y-3">
                <p className="text-sm text-ink">
                  <span className="font-medium">Focus areas: </span>
                  {prep.focusAreas.join(", ")}
                </p>
                <div className="space-y-2">
                  {prep.recommendations.map((r, i) => (
                    <div key={i} className="text-sm border-b border-border-soft pb-2 last:border-0">
                      <span className="font-medium text-ink">{r.area}: </span>
                      <span className="text-muted">{r.suggestion}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function ListCard({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "success" | "warning" | "brand";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {items.length === 0 && <p className="text-xs text-muted">None identified.</p>}
        {items.map((item, i) => (
          <Badge key={i} tone={tone} className="mr-1.5 mb-1.5">
            {item}
          </Badge>
        ))}
      </CardContent>
    </Card>
  );
}
