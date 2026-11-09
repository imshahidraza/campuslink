"use client";

import { useState, useTransition } from "react";
import { studentComputeMatchAction } from "@/lib/actions/matching";
import { applyToDriveAction, withdrawApplicationAction } from "@/lib/actions/apply";
import { useToast } from "@/components/ui/Toast";
import { journeyLabel } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { AiWaitNote } from "@/components/ui/Loader";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Sparkles, MapPin, Calendar, Lock, Award, Clock } from "lucide-react";

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
  ineligibleFixes,
  specialConsideration,
  alreadyJoined,
  joinedCompany,
  existing,
  application,
}: {
  drive: {
    id: string;
    companyName: string;
    jobRole: string;
    jdSummary: string | null;
    jdRequiredSkills: string[];
    venue: string | null;
    driveDate: string | null;
    status: string;
    applyDeadline: string | null;
  };
  eligible: boolean;
  ineligibleReasons: string[];
  ineligibleFixes?: { problem: string; fix: string }[];
  specialConsideration?: boolean;
  alreadyJoined?: boolean;
  joinedCompany?: string | null;
  existing: ExistingApp | null;
  application: { stage: string; documentsVerified: boolean } | null;
}) {
  const { toast } = useToast();
  const [appStage, setAppStage] = useState<string | null>(application?.stage ?? null);
  const hasApplied = appStage !== null && appStage !== "WITHDRAWN";
  const [deadlinePassed] = useState(() => (drive.applyDeadline ? new Date(drive.applyDeadline).getTime() < Date.now() : false));
  const canApply = eligible && drive.status === "OPEN" && !deadlinePassed && !hasApplied && !alreadyJoined;

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

  function handleApply() {
    setError(null);
    startTransition(async () => {
      try {
        await applyToDriveAction(drive.id);
        setAppStage("ELIGIBLE");
        toast(`Applied to ${drive.jobRole} at ${drive.companyName}.`);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function handleWithdraw() {
    setError(null);
    startTransition(async () => {
      try {
        await withdrawApplicationAction(drive.id);
        setAppStage("WITHDRAWN");
        toast("Application withdrawn.", "info");
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

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
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
          {drive.applyDeadline && (
            <span className={`flex items-center gap-1 ${deadlinePassed ? "text-rose-600" : ""}`}>
              <Clock className="h-3.5 w-3.5" /> Apply by {fmtDate(drive.applyDeadline)}
            </span>
          )}
        </div>

        {eligible && specialConsideration && (
          <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
            <Award className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              Your placement cell recommended you for this drive, even though it is outside the usual eligibility
              rules. This doesn&apos;t guarantee selection. The recruiter still reviews your profile like everyone
              else&apos;s.
            </p>
          </div>
        )}

        {!eligible && (
          <div className="mt-4 rounded-xl bg-surface border border-border-soft p-4">
            <p className="text-sm text-ink flex items-center gap-1.5 font-medium">
              <Lock className="h-3.5 w-3.5 text-muted" /> Why you are not eligible
            </p>
            {ineligibleFixes && ineligibleFixes.length > 0 ? (
              <div className="mt-2 space-y-2.5">
                {ineligibleFixes.map((f, i) => (
                  <div key={i} className="text-xs">
                    <p className="text-ink">{f.problem}</p>
                    <p className="text-muted mt-0.5">{f.fix}</p>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="mt-2 space-y-1 text-xs text-muted list-disc list-inside">
                {ineligibleReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {eligible && error && <p className="mt-3 text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}

        {eligible && !result?.matchExplanation && (
          <Button onClick={handleMatch} disabled={isPending} size="sm" variant="secondary" className="mt-4">
            <Sparkles className="h-3.5 w-3.5" />
            {isPending ? "Matching with Gemma..." : "See my AI fit"}
          </Button>
        )}
        {eligible && isPending && <div className="mt-2"><AiWaitNote show /></div>}

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
              {isPending ? "Re-matching..." : "Run the match again"}
            </Button>
          </div>
        )}

        {eligible && (
          <div className="mt-4 pt-4 border-t border-border-soft">
            {hasApplied ? (
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone="brand">{journeyLabel(appStage as string, Boolean(application?.documentsVerified))}</Badge>
                {appStage === "ELIGIBLE" ? (
                  <Button size="sm" variant="ghost" disabled={isPending} onClick={handleWithdraw}>
                    {isPending ? "Withdrawing..." : "Withdraw application"}
                  </Button>
                ) : (
                  <span className="text-xs text-muted">Follow it on your Placement Journey page.</span>
                )}
              </div>
            ) : alreadyJoined ? (
              <div className="flex flex-col items-start gap-1.5">
                <Button
                  size="sm"
                  disabled
                  title="You can't apply to another job after joining a company."
                  className="opacity-50 cursor-not-allowed"
                >
                  Already joined a company
                </Button>
                <span className="text-xs text-muted">
                  {joinedCompany ? `You joined ${joinedCompany}, so you` : "You"} can&apos;t apply to another job.
                </span>
              </div>
            ) : canApply ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" disabled={isPending} onClick={handleApply}>
                  {isPending ? "Applying..." : appStage === "WITHDRAWN" ? "Apply again" : "Apply"}
                </Button>
                <span className="text-xs text-muted">
                  The recruiter sees your profile only after you apply.
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted">
                {drive.status !== "OPEN"
                  ? "This drive is not open for applications right now."
                  : deadlinePassed
                    ? "The last date to apply has passed."
                    : ""}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
