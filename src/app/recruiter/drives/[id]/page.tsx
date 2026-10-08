import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { DriveStatusControl, BulkMatchButton } from "@/components/dashboard/DriveDetailControls";
import { RecruiterCandidateRow } from "@/components/dashboard/RecruiterCandidateRow";
import { stageLabel } from "@/lib/utils";
import { Pencil, Award } from "lucide-react";

export default async function RecruiterDriveDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const drive = await prisma.drive.findUnique({
    where: { id },
    include: {
      applications: {
        include: { student: { include: { user: true } } },
        orderBy: { fitScore: "desc" },
      },
    },
  });
  if (!drive) notFound();

  const recommended = drive.applications.filter((a) => a.specialConsideration);
  const others = drive.applications.filter((a) => !a.specialConsideration);

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{drive.jobRole}</h1>
          <p className="text-muted text-sm mt-1">Posted {new Date(drive.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge tone="brand">{stageLabel(drive.status)}</Badge>
          <LinkButton href={`/recruiter/drives/${drive.id}/edit`} variant="secondary" size="sm">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </LinkButton>
        </div>
      </div>

      <div className="mt-6">
        <DriveStatusControl driveId={drive.id} status={drive.status} />
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-1 h-fit">
          <CardHeader>
            <CardTitle>Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted leading-relaxed">{drive.jdSummary}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {drive.jdRequiredSkills.map((s) => (
                <Badge key={s} tone="brand">
                  {s}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-5">
          {recommended.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader className="flex flex-row items-center gap-2">
                <Award className="h-4 w-4 text-amber-600" />
                <CardTitle>TPO Recommended ({recommended.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted -mt-2 mb-2">
                  Specially recommended by your placement cell — doesn&apos;t meet the automatic eligibility
                  rules, but worth a look based on their profile. Your decision either way.
                </p>
                {recommended.map((app) => (
                  <RecruiterCandidateRow key={app.id} application={app} />
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Candidates ({others.length})</CardTitle>
              <BulkMatchButton driveId={drive.id} />
            </CardHeader>
            <CardContent>
              {others.length === 0 && (
                <p className="text-sm text-muted">
                  No candidates matched yet. Run AI matching to score eligible students against this JD.
                </p>
              )}
              {others.map((app) => (
                <RecruiterCandidateRow key={app.id} application={app} />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
