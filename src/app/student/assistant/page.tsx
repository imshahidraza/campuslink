import { requireStudentOrRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/Card";
import { EligibilityChat } from "@/components/dashboard/EligibilityChat";

export default async function AssistantPage() {
  await requireStudentOrRedirect();
  const drives = await prisma.drive.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { companyName: true },
  });
  const companies = Array.from(new Set(drives.map((d) => d.companyName)));
  const suggestions = [
    "Which drives am I eligible for?",
    ...companies.slice(0, 2).flatMap((c) => [`Am I eligible for ${c}?`, `When is the last date to apply for ${c}?`]),
  ].slice(0, 5);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Eligibility Assistant</h1>
      <p className="text-muted text-sm mt-1">
        Ask about the open drives. The answer comes from the exact eligibility rules and your own record. The AI only helps say it in friendlier words.
      </p>
      <Card className="mt-6">
        <CardContent className="pt-5">
          <EligibilityChat suggestions={suggestions} />
        </CardContent>
      </Card>
    </div>
  );
}
