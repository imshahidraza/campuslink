import { requireRecruiterOrRedirect } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { CompanyProfileForm } from "@/components/dashboard/CompanyProfileForm";

export default async function RecruiterProfilePage() {
  const { recruiter } = await requireRecruiterOrRedirect();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Company Profile</h1>
      <p className="text-muted text-sm mt-1">This is what students see when previewing your drives.</p>

      <Card className="mt-8 max-w-xl">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <CompanyProfileForm
            defaults={{
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
