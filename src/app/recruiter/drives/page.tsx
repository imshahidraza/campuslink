import Link from "next/link";
import { requireRecruiterOrRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, Badge } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { stageLabel } from "@/lib/utils";
import { Plus } from "lucide-react";

export default async function RecruiterDrivesPage() {
  const { recruiter: recruiterBase } = await requireRecruiterOrRedirect();
  const recruiter = await prisma.recruiter.findUniqueOrThrow({
    where: { id: recruiterBase.id },
    include: { drives: { include: { applications: true }, orderBy: { createdAt: "desc" } } },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">My Drives</h1>
        <LinkButton href="/recruiter/drives/new" size="sm">
          <Plus className="h-4 w-4" /> New drive
        </LinkButton>
      </div>

      <div className="mt-8 space-y-3">
        {recruiter.drives.map((d) => (
          <Link key={d.id} href={`/recruiter/drives/${d.id}`}>
            <Card className="hover:border-brand-300 transition-colors">
              <CardContent className="pt-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">{d.jobRole}</p>
                  <p className="text-xs text-muted mt-1">{d.applications.length} candidates matched</p>
                </div>
                <Badge tone="brand">{stageLabel(d.status)}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {recruiter.drives.length === 0 && <p className="text-sm text-muted">No drives yet.</p>}
      </div>
    </div>
  );
}
