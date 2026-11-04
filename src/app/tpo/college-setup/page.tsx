import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { CollegeSetupForm } from "@/components/dashboard/CollegeSetupForm";
import { TpoEmailForm } from "@/components/dashboard/TpoEmailForm";
import { getDocumentsEmail } from "@/lib/college";

export default async function CollegeSetupPage() {
  const [specializations, college, docsEmail] = await Promise.all([
    prisma.specialization.findMany({ orderBy: { name: "asc" } }),
    prisma.college.findFirst({ orderBy: { createdAt: "asc" }, select: { tpoEmail: true } }),
    getDocumentsEmail(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">College Setup</h1>
      <p className="text-muted text-sm mt-1">
        Set up the programs and specializations your college offers. Students pick from this list on their profile, and
        it is used to filter drive eligibility.
      </p>

      <Card className="mt-8 max-w-3xl">
        <CardHeader>
          <CardTitle>Programs and specializations</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <CollegeSetupForm initialSpecializations={specializations} />
        </CardContent>
      </Card>

      <Card className="mt-6 max-w-3xl">
        <CardHeader>
          <CardTitle>Documents email</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <p className="text-xs text-muted mb-4 leading-relaxed">
            After a student accepts an offer, they are asked to email their documents here for verification.
            {docsEmail && !college?.tpoEmail ? ` Right now this is your account email, ${docsEmail}.` : ""}
          </p>
          <TpoEmailForm defaultValue={college?.tpoEmail ?? ""} fallback={docsEmail} />
        </CardContent>
      </Card>
    </div>
  );
}
