import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { CreateDriveForm } from "@/components/dashboard/CreateDriveForm";

export default function NewDrivePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Post a New Drive</h1>
      <p className="text-muted text-sm mt-1">
        Paste the JD as-is — Gemma structures it into required/preferred skills automatically.
      </p>

      <Card className="mt-8 max-w-2xl">
        <CardHeader>
          <CardTitle>Drive details</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateDriveForm />
        </CardContent>
      </Card>
    </div>
  );
}
