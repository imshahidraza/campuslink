import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, Badge } from "@/components/ui/Card";
import { stageLabel } from "@/lib/utils";

export default async function TpoDrivesPage() {
  const drives = await prisma.drive.findMany({
    include: { recruiter: true, applications: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Drives</h1>
      <p className="text-muted text-sm mt-1">Review eligibility rules, run AI matching, and manage each drive.</p>

      <div className="mt-8 space-y-3">
        {drives.map((d) => (
          <Link key={d.id} href={`/tpo/drives/${d.id}`}>
            <Card className="hover:border-brand-300 transition-colors">
              <CardContent className="pt-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {d.jobRole} <span className="text-muted font-normal">· {d.companyName}</span>
                  </p>
                  <p className="text-xs text-muted mt-1">{d.applications.length} applications</p>
                </div>
                <Badge tone="brand">{stageLabel(d.status)}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {drives.length === 0 && <p className="text-sm text-muted">No drives yet.</p>}
      </div>
    </div>
  );
}
