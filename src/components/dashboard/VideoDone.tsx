import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import type { VideoStage } from "@/lib/video";

/**
 * What a student sees after the interview. It carries no marks, no feedback and no percentage: those are for the
 * recruiter only.
 */
export function VideoDoneCard({ stage, reason }: { stage: VideoStage; reason?: string | null }) {
  if (stage === "INTERRUPTED") {
    return (
      <Card className="mt-6">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 shrink-0 text-amber-600" aria-hidden />
            <div>
              <h2 className="text-lg font-semibold text-ink">Your interview was interrupted</h2>
              <p className="text-sm text-muted mt-2 leading-relaxed">
                {reason === "DEVICE"
                  ? "Your camera or microphone stopped working, so the recording ended. "
                  : reason === "UPLOAD"
                    ? "The recording could not be fully uploaded. "
                    : "The page was closed, refreshed or lost its connection while the interview was running, so the recording stopped. "}
                Everything that was uploaded before that has been saved and the recruiter will be able to review it. If you think
                this was not your fault, please contact the recruiter or the placement cell.
              </p>
              <Link href="/student/drives" className="inline-block mt-4 text-sm text-brand-500 hover:text-brand-600">
                Back to drives
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="mt-6">
      <CardContent className="pt-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold text-ink">Assessment Submitted Successfully</h2>
            <p className="text-sm text-muted mt-2 leading-relaxed">
              Your assessment has been submitted. Your responses will be evaluated, and the recruiter will communicate your result as
              soon as it is available.
            </p>
            <Link href="/student/drives" className="inline-block mt-4 text-sm text-brand-500 hover:text-brand-600">
              Back to drives
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
