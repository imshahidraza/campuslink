import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/Card";

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-ink">{label}</span>
        <span className="text-muted">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function AnalyticsPage() {
  const students = await prisma.student.findMany();

  const branchStats = new Map<string, { total: number; placed: number }>();
  const gapCounts = new Map<string, number>();

  for (const s of students) {
    const b = branchStats.get(s.branch) || { total: 0, placed: 0 };
    b.total++;
    if (["OFFER_ACCEPTED", "JOINED", "OFFER_RECEIVED"].includes(s.placementStatus)) b.placed++;
    branchStats.set(s.branch, b);

    for (const gap of s.skillGaps) {
      gapCounts.set(gap, (gapCounts.get(gap) || 0) + 1);
    }
  }

  const branchRows = Array.from(branchStats.entries()).map(([branch, v]) => ({
    branch,
    rate: v.total > 0 ? Math.round((v.placed / v.total) * 100) : 0,
    total: v.total,
    placed: v.placed,
  }));

  const topGaps = Array.from(gapCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maxGap = topGaps[0]?.[1] || 1;

  const atRisk = students.filter(
    (s) => s.readinessLevel === "NOT_READY" && s.placementStatus === "UNPLACED"
  );

  const drivesByStatus = await prisma.drive.groupBy({ by: ["status"], _count: true });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Analytics</h1>
      <p className="text-muted text-sm mt-1">Specialization-wise outcomes, common skill gaps, and at-risk students.</p>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Placement rate by specialization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {branchRows.map((r) => (
              <Bar key={r.branch} label={`${r.branch} (${r.placed}/${r.total})`} value={r.rate} max={100} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Most common skill gaps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {topGaps.length === 0 && <p className="text-sm text-muted">Run readiness analysis for students to see this.</p>}
            {topGaps.map(([gap, count]) => (
              <Bar key={gap} label={gap} value={count} max={maxGap} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Drives by status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {drivesByStatus.map((d) => (
              <Badge key={d.status} tone="brand">
                {d.status.replace("_", " ")}: {d._count}
              </Badge>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>At-risk students ({atRisk.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {atRisk.length === 0 && <p className="text-sm text-muted">None flagged right now.</p>}
            {atRisk.map((s) => (
              <p key={s.id} className="text-sm text-muted">
                <span className="text-ink font-medium">{s.rollNo}</span> · {s.branch} · CGPA{" "}
                {s.cgpa.toFixed(2)}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
