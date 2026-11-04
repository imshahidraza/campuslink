import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { CreateDriveForm } from "@/components/dashboard/CreateDriveForm";
import { requireRecruiterOrRedirect } from "@/lib/auth";

export default async function NewDrivePage() {
  const { recruiter } = await requireRecruiterOrRedirect();

  if (recruiter.status !== "APPROVED") {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-ink">Post a New Drive</h1>
        <p className="text-muted text-sm mt-2 max-w-xl leading-relaxed">
          You can post drives once the placement cell approves your account. You will see a notification here when
          that happens.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Post a New Drive</h1>
      <p className="text-muted text-sm mt-1">
        Paste the job description as it is. Gemma turns it into required and preferred skills automatically.
      </p>

      <Card className="mt-8 max-w-2xl">
        <CardHeader>
          <CardTitle>Drive details</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <CreateDriveForm />
        </CardContent>
      </Card>
    </div>
  );
}
