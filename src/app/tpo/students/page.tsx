import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { StudentEditRow } from "@/components/dashboard/StudentEditRow";
import { Plus, ClipboardList, Search } from "lucide-react";

const PAGE_SIZE = 40;

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const page = Math.max(1, Number(sp.page) || 1);

  const studentWhere = q
    ? {
        OR: [
          { rollNo: { contains: q, mode: "insensitive" as const } },
          { user: { name: { contains: q, mode: "insensitive" as const } } },
          { branch: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const pendingWhere = q
    ? {
        OR: [
          { rollNo: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
          { branch: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [students, studentCount, pending, pendingCount] = await Promise.all([
    prisma.student.findMany({
      where: studentWhere,
      include: { user: { select: { name: true } } },
      orderBy: { rollNo: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.student.count(),
    prisma.pendingStudent.findMany({ where: pendingWhere, orderBy: { rollNo: "asc" }, take: 300 }),
    prisma.pendingStudent.count(),
  ]);
  const matchingStudents = q ? await prisma.student.count({ where: studentWhere }) : studentCount;
  const pages = Math.max(1, Math.ceil(matchingStudents / PAGE_SIZE));
  const link = (p: number) => `/tpo/students?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) }).toString()}`;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Students</h1>
          <p className="text-muted text-sm mt-1">
            {studentCount} registered, {pendingCount} waiting to sign up.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href="/tpo/students/scores" variant="secondary" size="sm">
            <ClipboardList className="h-4 w-4" /> Assessment scores
          </LinkButton>
          <LinkButton href="/tpo/students/add" size="sm">
            <Plus className="h-4 w-4" /> Add students
          </LinkButton>
        </div>
      </div>

      <form action="/tpo/students" className="mt-6 flex max-w-md items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by roll number, name or specialization"
            className="w-full rounded-xl border border-border-soft bg-white pl-9 pr-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-300"
          />
        </div>
        <button type="submit" className="rounded-xl border border-border-soft bg-white px-3 py-2 text-sm text-ink hover:bg-surface-2">
          Search
        </button>
      </form>

      {pending.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Waiting to sign up ({pending.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto scrollbar-thin">
            <p className="text-xs text-muted mb-3">
              These students were imported but have not created an account yet. You can fix any detail with Edit.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted border-b border-border-soft">
                  <th className="pb-3 pr-3 font-medium">Roll no.</th>
                  <th className="pb-3 pr-3 font-medium">Name</th>
                  <th className="pb-3 pr-3 font-medium">Program</th>
                  <th className="pb-3 pr-3 font-medium">Specialization</th>
                  <th className="pb-3 pr-3 font-medium">CGPA</th>
                  <th className="pb-3 pr-3 font-medium">Scores</th>
                  <th className="pb-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((s) => (
                  <StudentEditRow key={s.id} kind="pending" student={s} />
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
        <CardContent className="overflow-x-auto scrollbar-thin">
          {students.length === 0 ? (
            <p className="text-sm text-muted">
              {q
                ? "No registered student matches your search."
                : "No one has signed up yet. Add students first, then ask them to sign up with their roll number."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted border-b border-border-soft">
                  <th className="pb-3 pr-3 font-medium">Roll no.</th>
                  <th className="pb-3 pr-3 font-medium">Name</th>
                  <th className="pb-3 pr-3 font-medium">Program</th>
                  <th className="pb-3 pr-3 font-medium">Specialization</th>
                  <th className="pb-3 pr-3 font-medium">CGPA</th>
                  <th className="pb-3 pr-3 font-medium">Backlogs</th>
                  <th className="pb-3 pr-3 font-medium">Scores</th>
                  <th className="pb-3 pr-3 font-medium">Readiness</th>
                  <th className="pb-3 pr-3 font-medium">Status</th>
                  <th className="pb-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <StudentEditRow
                    key={s.id}
                    kind="registered"
                    student={{ ...s, name: s.user.name, program: s.program }}
                  />
                ))}
              </tbody>
            </table>
          )}
          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted">
              <span>
                Page {page} of {pages}
              </span>
              <div className="flex gap-3">
                {page > 1 && (
                  <Link href={link(page - 1)} className="text-brand-500 hover:text-brand-600">
                    Previous
                  </Link>
                )}
                {page < pages && (
                  <Link href={link(page + 1)} className="text-brand-500 hover:text-brand-600">
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
