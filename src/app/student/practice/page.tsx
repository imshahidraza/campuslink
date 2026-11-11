import { requireStudentOrRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/Card";
import { MockInterviewPanel } from "@/components/dashboard/MockInterviewPanel";

export default async function PracticePage() {
  const { student } = await requireStudentOrRedirect();
  // Drives the student can see: the open ones, plus any they applied to.
  const drives = await prisma.drive.findMany({
    where: {
      OR: [{ status: { in: ["OPEN", "IN_PROGRESS"] } }, { applications: { some: { studentId: student.id } } }],
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { id: true, jobRole: true, companyName: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Interview Practice</h1>
      <p className="text-muted text-sm mt-1">
        Pick a drive and the AI writes practice interview questions from its job description. It is practice only: nothing is saved or shown to anyone.
      </p>
      <Card className="mt-6">
        <CardContent className="pt-5">
          <MockInterviewPanel drives={drives.map((d) => ({ id: d.id, label: `${d.jobRole} at ${d.companyName}` }))} />
        </CardContent>
      </Card>
    </div>
  );
}
