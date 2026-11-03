import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { CollegeSetupForm } from "@/components/dashboard/CollegeSetupForm";

export default async function CollegeSetupPage() {
  const specializations = await prisma.specialization.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">College Setup</h1>
      <p className="text-muted text-sm mt-1">
        Define the programs and specializations offered at your college. Students pick from this list on
        their profile, and it powers drive eligibility filtering.
      </p>

      <Card className="mt-8 max-w-3xl">
        <CardHeader>
          <CardTitle>Programs &amp; specializations</CardTitle>
        </CardHeader>
        <CardContent>
          <CollegeSetupForm initialSpecializations={specializations} />
        </CardContent>
      </Card>
    </div>
  );
}
