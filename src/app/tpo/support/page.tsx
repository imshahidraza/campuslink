import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { SupportRow, type SupportItem } from "@/components/dashboard/SupportRow";
import { fmtDate } from "@/lib/format";
import { RISK_RULES } from "@/lib/risk";

export default async function SupportListPage() {
  const rows = await prisma.escalation.findMany({
    include: { student: { include: { user: { select: { name: true } } } } },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const items: SupportItem[] = rows.map((r) => ({
    id: r.id,
    rollNo: r.student.rollNo,
    name: r.student.user.name,
    branch: r.student.branch,
    cgpa: r.student.cgpa,
    reasons: r.reasons,
    status: r.status,
    mentorName: r.mentorName,
    note: r.note,
    assignedOn: r.assignedAt ? fmtDate(r.assignedAt) : null,
  }));
  const open = items.filter((i) => i.status === "OPEN");
  const assigned = items.filter((i) => i.status === "ASSIGNED");
  const resolved = items.filter((i) => i.status === "RESOLVED");
  const mentorNames = Array.from(new Set(items.map((i) => i.mentorName).filter((m): m is string => Boolean(m)))).sort();

  // How many students each mentor is looking after right now.
  const load = new Map<string, number>();
  for (const i of assigned) if (i.mentorName) load.set(i.mentorName, (load.get(i.mentorName) ?? 0) + 1);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Support list</h1>
      <p className="text-muted text-sm mt-1">
        Students the rules flag as at risk of finishing the season without a job. The rules only flag; you choose who mentors each student.
      </p>

      <Card className="mt-6">
        <CardContent className="pt-5">
          <p className="text-xs font-medium text-ink">A student is flagged when they are not placed and any of these is true</p>
          <ul className="mt-2 text-xs text-muted list-disc pl-5 space-y-1">
            <li>their readiness analysis says &quot;Not ready&quot;</li>
            <li>they were not selected in {RISK_RULES.rejectionsWithNothingActive} or more drives and have nothing in progress</li>
            <li>they have applied to nothing although an open drive they are eligible for has been open for {RISK_RULES.noApplicationAfterDays}+ days</li>
          </ul>
          <p className="text-xs text-muted mt-2">The list updates by itself, or press &quot;Run checks now&quot; on the Overview page. A student who gets placed is resolved automatically.</p>
        </CardContent>
      </Card>

      <div className="mt-5 grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-5"><p className="text-xl font-semibold text-ink">{open.length}</p><p className="text-xs text-muted mt-1">Need a mentor</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xl font-semibold text-ink">{assigned.length}</p><p className="text-xs text-muted mt-1">Mentor assigned</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xl font-semibold text-ink">{resolved.length}</p><p className="text-xs text-muted mt-1">Resolved</p></CardContent></Card>
      </div>

      {load.size > 0 && (
        <p className="text-xs text-muted mt-4">
          Mentor load: {Array.from(load.entries()).map(([m, n]) => `${m} (${n})`).join(" · ")}
        </p>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Needs a mentor ({open.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {open.length === 0 && <p className="text-sm text-muted">Nobody is waiting for a mentor.</p>}
          {open.map((i) => (
            <SupportRow key={i.id} item={i} mentorNames={mentorNames} />
          ))}
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Mentor assigned ({assigned.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {assigned.length === 0 && <p className="text-sm text-muted">No students have a mentor yet.</p>}
          {assigned.map((i) => (
            <SupportRow key={i.id} item={i} mentorNames={mentorNames} />
          ))}
        </CardContent>
      </Card>

      {resolved.length > 0 && (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Resolved ({resolved.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {resolved.map((i) => (
              <SupportRow key={i.id} item={i} mentorNames={mentorNames} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
