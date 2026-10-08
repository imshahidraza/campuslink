import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/Card";

export default async function RecruitersPage() {
  const recruiters = await prisma.recruiter.findMany({
    include: { user: true, drives: true },
    orderBy: { companyName: "asc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Recruiters</h1>
      <p className="text-muted text-sm mt-1">{recruiters.length} recruiter accounts.</p>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-5">
        {recruiters.map((r) => (
          <Card key={r.id}>
            <CardContent className="pt-5">
              <p className="text-sm font-semibold text-ink">{r.companyName}</p>
              <p className="text-xs text-muted mt-1">{r.industry}</p>
              <p className="text-sm text-muted mt-3 leading-relaxed">{r.companyDesc}</p>
              <p className="text-xs text-muted mt-3">
                {r.drives.length} drive{r.drives.length === 1 ? "" : "s"} · contact {r.user.email}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
