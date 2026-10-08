"use client";

import { useState, useTransition } from "react";
import { studentComputeMatchAction } from "@/lib/actions/matching";
import { Button } from "@/components/ui/Button";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Sparkles, MapPin, Calendar, Lock, Award } from "lucide-react";

interface ExistingApp {
  fitScore: number | null;
  matchedSkills: string[];
  missingSkills: string[];
  matchExplanation: string | null;
}

export function StudentDriveCard({
  drive,
  eligible,
  ineligibleReasons,
  specialConsideration,
  existing,
}: {
  drive: {
    id: string;
    companyName: string;
    jobRole: string;
    jdSummary: string | null;
    jdRequiredSkills: string[];
    venue: string | null;
    driveDate: string | null;
  };
  eligible: boolean;
  ineligibleReasons: string[];
  specialConsideration?: boolean;
  existing: ExistingApp | null;
}) {
  const [result, setResult] = useState<ExistingApp | null>(existing);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleMatch() {
    setError(null);
    startTransition(async () => {
      try {
        const app = await studentComputeMatchAction(drive.id);
        setResult({
          fitScore: app.fitScore,
          matchedSkills: app.matchedSkills,
          missingSkills: app.missingSkills,
          matchExplanation: app.matchExplanation,
        });
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <Card className={!eligible ? "opacity-80" : undefined}>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">{drive.jobRole}</CardTitle>
          <p className="text-sm text-muted">{drive.companyName}</p>
        </div>
        {eligible ? (
          result?.fitScore != null && (
            <div className="text-right">
              <p className="text-xl font-semibold text-brand-600">{result.fitScore}</p>
              <p className="text-[11px] text-muted">Fit score</p>
            </div>
          )
        ) : (
          <Badge tone="neutral" className="shrink-0">
            Not eligible
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {drive.jdSummary && <p className="text-sm text-muted leading-relaxed">{drive.jdSummary}</p>}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {drive.jdRequiredSkills.slice(0, 6).map((s) => (
            <Badge key={s} tone="neutral">
              {s}
            </Badge>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-4 text-xs text-muted">
          {drive.venue && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {drive.venue}
            </span>
          )}
          {drive.driveDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> {new Date(drive.driveDate).toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
        </div>

        {eligible && specialConsideration && (
          <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
            <Award className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              Your placement cell specially recommended you for this drive, even though it falls outside the
              usual eligibility criteria. This doesn&apos;t guarantee selection — the recruiter still reviews
              your profile like everyone else&apos;s.
            </p>
          </div>
        )}

        {!eligible && (
          <div className="mt-4 rounded-xl bg-surface border border-border-soft p-4">
            <p className="text-sm text-ink flex items-center gap-1.5 font-medium">
              <Lock className="h-3.5 w-3.5 text-muted" /> Why you&apos;re not eligible
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted list-disc list-inside">
              {ineligibleReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {eligible && error && <p className="mt-3 text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}

        {eligible && !result?.matchExplanation && (
          <Button onClick={handleMatch} disabled={isPending} size="sm" className="mt-4">
            <Sparkles className="h-3.5 w-3.5" />
            {isPending ? "Matching with Gemma..." : "See my AI fit"}
          </Button>
        )}

        {eligible && result?.matchExplanation && (
          <div className="mt-4 rounded-xl bg-surface border border-border-soft p-4 space-y-2">
            <p className="text-sm text-ink leading-relaxed">{result.matchExplanation}</p>
            <div className="flex flex-wrap gap-1.5">
              {result.matchedSkills.map((s) => (
                <Badge key={s} tone="success">
                  ✓ {s}
                </Badge>
              ))}
              {result.missingSkills.map((s) => (
                <Badge key={s} tone="warning">
                  {s}
                </Badge>
              ))}
            </div>
            <Button onClick={handleMatch} disabled={isPending} size="sm" variant="ghost">
              {isPending ? "Re-matching..." : "Re-run match"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
