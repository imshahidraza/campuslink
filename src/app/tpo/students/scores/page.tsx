import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ScoresPasteForm } from "@/components/dashboard/ScoresPasteForm";
import { ArrowLeft } from "lucide-react";

export default function AssessmentScoresPage() {
  return (
    <div>
      <Link href="/tpo/students" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to students
      </Link>
      <h1 className="text-2xl font-semibold text-ink">Assessment Scores</h1>
      <p className="text-muted text-sm mt-1">
        Import aptitude, reasoning, verbal and communication scores from your placement test — these feed
        directly into each student&apos;s AI readiness analysis.
      </p>

      <Card className="mt-8 max-w-3xl">
        <CardHeader>
          <CardTitle>Paste or import scores</CardTitle>
        </CardHeader>
        <CardContent>
          <ScoresPasteForm />
        </CardContent>
      </Card>
    </div>
  );
}
