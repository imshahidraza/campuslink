import { requireStudentOrRedirect } from "@/lib/auth";
import { ReadinessPanel } from "@/components/dashboard/ReadinessPanel";
import { RoadmapCard, type RoadmapData } from "@/components/dashboard/RoadmapCard";

export default async function ReadinessPage() {
  const { student } = await requireStudentOrRedirect();

  const existing = student.readinessLevel
    ? {
        readinessLevel: student.readinessLevel,
        summary: student.readinessSummary || "",
        strengths: student.strengths,
        skillGaps: student.skillGaps,
        improvementAreas: student.improvementAreas,
      }
    : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Placement Readiness</h1>
      <p className="text-muted text-sm mt-1">
        AI-analyzed from your academic record and profile — not a prediction, a snapshot to help you improve.
      </p>
      <div className="mt-8">
        <ReadinessPanel existing={existing} preferredRoles={student.preferredRoles} />
      </div>
      <div className="mt-5">
        <RoadmapCard
          existing={(student.roadmap as RoadmapData | null) ?? null}
          updatedAt={student.roadmapUpdatedAt ? student.roadmapUpdatedAt.toISOString() : null}
        />
      </div>
    </div>
  );
}
