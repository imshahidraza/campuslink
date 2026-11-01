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

// Stages meaning a person actually reviewed the candidate and moved them forward.
const ADVANCED_STAGES = ["SHORTLISTED", "INTERVIEW", "SELECTED", "OFFER_REQUESTED", "OFFER_SENT", "OFFER_ACCEPTED", "JOINED"];

const CGPA_BANDS = [
  { label: "Below 6", min: 0, max: 6 },
  { label: "6 – 7", min: 6, max: 7 },
  { label: "7 – 8", min: 7, max: 8 },
  { label: "8 – 9", min: 8, max: 9 },
  { label: "9 and above", min: 9, max: Infinity },
];

export default async function AnalyticsPage() {
  const [students, applications] = await Promise.all([
    prisma.student.findMany(),
    prisma.application.findMany({ select: { studentId: true, stage: true } }),
  ]);

  // Fairness check: does advancement track CGPA alone, or spread across bands?
  const advancedIds = new Set(applications.filter((a) => ADVANCED_STAGES.includes(a.stage)).map((a) => a.studentId));
  const cgpaBands = CGPA_BANDS.map((band) => {
    const inBand = students.filter((s) => s.cgpa >= band.min && s.cgpa < band.max);
    const advanced = inBand.filter((s) => advancedIds.has(s.id)).length;
    return { label: band.label, total: inBand.length, advanced, rate: inBand.length ? Math.round((advanced / inBand.length) * 100) : 0 };
  });
  const sorted = students.map((s) => s.cgpa).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianCgpa = sorted.length === 0 ? 0 : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const advancedStudents = students.filter((s) => advancedIds.has(s.id));
  const belowMedian = advancedStudents.filter((s) => s.cgpa < medianCgpa).length;
  const belowMedianPct = advancedStudents.length ? Math.round((belowMedian / advancedStudents.length) * 100) : 0;

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
      <p className="text-muted text-sm mt-1">Fairness of selections, specialization-wise outcomes, common skill gaps, and students who need support.</p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Fairness check — is advancement driven by CGPA alone?</CardTitle>
        </CardHeader>
        <CardContent>
          {advancedStudents.length === 0 ? (
            <p className="text-sm text-muted">
              Nobody has been shortlisted yet. Once candidates move past eligibility, this shows whether
              selections spread across CGPA bands or cluster only at the top.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink leading-relaxed">
                <span className="text-2xl font-semibold text-brand-600 mr-1">{belowMedianPct}%</span>
                of students who advanced (shortlisted or beyond) have a CGPA below the cohort median of{" "}
                {medianCgpa.toFixed(2)} — {belowMedian} of {advancedStudents.length}.
              </p>
              <p className="text-xs text-muted mt-1">
                A spread across bands means skills, projects and fit are being weighed — not grades alone.
              </p>
              <div className="mt-6 space-y-4">
                {cgpaBands.map((b) => (
                  <Bar key={b.label} label={`CGPA ${b.label} — ${b.advanced} of ${b.total} advanced`} value={b.rate} max={100} />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
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
