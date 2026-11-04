import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRecruiterOrRedirect } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EditDriveForm } from "@/components/dashboard/EditDriveForm";
import { ArrowLeft } from "lucide-react";

export default async function EditDrivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { recruiter } = await requireRecruiterOrRedirect();

  const drive = await prisma.drive.findUnique({ where: { id } });
  if (!drive || drive.recruiterId !== recruiter.id || recruiter.status !== "APPROVED") notFound();

  return (
    <div>
      <Link
        href={`/recruiter/drives/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to drive
      </Link>
      <h1 className="text-2xl font-semibold text-ink">Edit Drive</h1>
      <p className="text-muted text-sm mt-1">Changes apply straight away. Candidates who already applied keep their scores unless you change the job description.</p>

      <Card className="mt-8 max-w-2xl">
        <CardHeader>
          <CardTitle>Drive details</CardTitle>
        </CardHeader>
        <CardContent>
          <EditDriveForm
            driveId={drive.id}
            defaults={{
              jobRole: drive.jobRole,
              jobDescriptionRaw: drive.jobDescriptionRaw,
              minCgpa: drive.minCgpa?.toString() || "",
              maxBacklogs: drive.maxBacklogs?.toString() || "",
              eligibleBranches: drive.eligibleBranches.length ? drive.eligibleBranches.join(", ") : "All",
              eligibleGradYears: drive.eligibleGradYears.join(", "),
              driveDate: drive.driveDate ? drive.driveDate.toISOString().slice(0, 10) : "",
              applyDeadline: drive.applyDeadline
                ? drive.applyDeadline.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
                : "",
              venue: drive.venue || "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
