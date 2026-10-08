import { requireRecruiterOrRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { stageLabel } from "@/lib/utils";
import { Plus } from "lucide-react";

export default async function RecruiterOverview() {
  const { session, recruiter: recruiterBase } = await requireRecruiterOrRedirect();
  const recruiter = await prisma.recruiter.findUniqueOrThrow({
    where: { id: recruiterBase.id },
    include: { drives: { include: { applications: true }, orderBy: { createdAt: "desc" } } },
  });

  const totalApplications = recruiter.drives.reduce((sum, d) => sum + d.applications.length, 0);
  const shortlisted = recruiter.drives.reduce(
    (sum, d) => sum + d.applications.filter((a) => a.stage === "SHORTLISTED").length,
    0
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{recruiter.companyName}</h1>
          <p className="text-muted text-sm mt-1">Welcome back, {session.name}.</p>
        </div>
        <LinkButton href="/recruiter/drives/new" size="sm">
          <Plus className="h-4 w-4" /> New drive
        </LinkButton>
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xl font-semibold text-ink">{recruiter.drives.length}</p>
            <p className="text-xs text-muted mt-1">Drives posted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xl font-semibold text-ink">{totalApplications}</p>
            <p className="text-xs text-muted mt-1">Candidates matched</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xl font-semibold text-ink">{shortlisted}</p>
            <p className="text-xs text-muted mt-1">Shortlisted</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Your drives</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recruiter.drives.length === 0 && (
            <p className="text-sm text-muted">No drives posted yet — create your first one.</p>
          )}
          {recruiter.drives.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-2 border-b border-border-soft last:border-0">
              <div>
                <p className="text-sm font-medium text-ink">{d.jobRole}</p>
                <p className="text-xs text-muted">{d.applications.length} candidates</p>
              </div>
              <Badge tone="brand">{stageLabel(d.status)}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
