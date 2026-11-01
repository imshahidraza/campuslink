import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { readinessLabel, stageLabel } from "@/lib/utils";
import { PendingStudentRow } from "@/components/dashboard/PendingStudentRow";
import { Plus, ClipboardList } from "lucide-react";

export default async function StudentsPage() {
  const [students, pending] = await Promise.all([
    prisma.student.findMany({ include: { user: true }, orderBy: { rollNo: "asc" } }),
    prisma.pendingStudent.findMany({ orderBy: { rollNo: "asc" } }),
  ]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Students</h1>
          <p className="text-muted text-sm mt-1">
            {students.length} registered · {pending.length} awaiting signup.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LinkButton href="/tpo/students/scores" variant="secondary" size="sm">
            <ClipboardList className="h-4 w-4" /> Assessment scores
          </LinkButton>
          <LinkButton href="/tpo/students/add" size="sm">
            <Plus className="h-4 w-4" /> Add students
          </LinkButton>
        </div>
      </div>

      {pending.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Pending roster — not yet signed up</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted border-b border-border-soft">
                  <th className="pb-3 font-medium">Roll No.</th>
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Program</th>
                  <th className="pb-3 font-medium">Specialization</th>
                  <th className="pb-3 font-medium">CGPA</th>
                  <th className="pb-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((s) => (
                  <PendingStudentRow key={s.id} student={s} />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Registered students</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 overflow-x-auto scrollbar-thin">
          {students.length === 0 ? (
            <p className="text-sm text-muted">
              No one has signed up yet. Add students to the roster above, then share the roll numbers with them.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted border-b border-border-soft">
                  <th className="pb-3 font-medium">Roll No.</th>
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Program</th>
                  <th className="pb-3 font-medium">Specialization</th>
                  <th className="pb-3 font-medium">CGPA</th>
                  <th className="pb-3 font-medium">Backlogs</th>
                  <th className="pb-3 font-medium">Readiness</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-b border-border-soft last:border-0">
                    <td className="py-3 text-ink">{s.rollNo}</td>
                    <td className="py-3 text-ink font-medium">{s.user.name}</td>
                    <td className="py-3 text-muted">{s.program || "—"}</td>
                    <td className="py-3 text-muted">{s.branch}</td>
                    <td className="py-3 text-muted">{s.cgpa.toFixed(2)}</td>
                    <td className="py-3 text-muted">{s.backlogs}</td>
                    <td className="py-3">
                      <Badge tone={s.readinessLevel === "HIGHLY_READY" ? "success" : "neutral"}>
                        {readinessLabel(s.readinessLevel)}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <Badge tone="brand">{stageLabel(s.placementStatus)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
