import { requireRecruiterOrRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, Badge } from "@/components/ui/Card";
import { journeyLabel } from "@/lib/utils";

export default async function CandidatesPage() {
  const { recruiter } = await requireRecruiterOrRedirect();

  const applications = await prisma.application.findMany({
    where: { drive: { recruiterId: recruiter.id }, stage: { not: "WITHDRAWN" } },
    include: { student: { include: { user: true } }, drive: true },
    orderBy: { fitScore: "desc" },
    take: 500,
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">All Candidates</h1>
      <p className="text-muted text-sm mt-1">Everyone who applied to your drives, ranked by AI fit score.</p>

      <Card className="mt-8">
        <CardContent className="pt-5 space-y-3">
          {applications.length === 0 && <p className="text-sm text-muted">No one has applied yet.</p>}
          {applications.map((app) => (
            <div key={app.id} className="flex items-center justify-between border-b border-border-soft py-3 last:border-0">
              <div>
                <p className="text-sm font-medium text-ink">{app.student.user.name}</p>
                <p className="text-xs text-muted">
                  {app.drive.jobRole} · {app.student.branch}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {app.fitScore != null && <span className="text-sm font-semibold text-brand-600 whitespace-nowrap">Fit {app.fitScore}/100</span>}
                <Badge tone="brand">{journeyLabel(app.stage, app.documentsVerified)}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
