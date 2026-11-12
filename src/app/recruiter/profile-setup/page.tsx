import Link from "next/link";
import { requireRecruiterOrRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ProfileSetupForm } from "@/components/dashboard/ProfileSetupForm";

export default async function ProfileSetupPage() {
  const { session, recruiter } = await requireRecruiterOrRedirect();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId }, select: { name: true } });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Profile setup</h1>
      <p className="text-muted text-sm mt-1">
        Tell students and the placement cell who you are. Your company name here is shown on your Overview. To show the
        people behind your company, use{" "}
        <Link href="/recruiter/profile" className="text-blue-600 underline underline-offset-2 hover:text-blue-800">
          Company Profile
        </Link>
        .
      </p>

      <Card className="mt-8 max-w-2xl">
        <CardHeader>
          <CardTitle>Your details</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileSetupForm
            defaults={{
              name: user.name,
              contactRole: recruiter.contactRole || "",
              companyName: recruiter.companyName,
              industry: recruiter.industry || "",
              website: recruiter.website || "",
              companyDesc: recruiter.companyDesc || "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
