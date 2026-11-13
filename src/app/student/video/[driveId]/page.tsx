import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStudentOrRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/Card";
import { settleVideoApplication } from "@/lib/videoAttempt";
import { VideoInterview } from "@/components/dashboard/VideoInterview";
import { VideoReopened } from "@/components/dashboard/VideoReopened";
import { VideoDoneCard } from "@/components/dashboard/VideoDone";
import type { VideoStage } from "@/lib/video";

export default async function StudentVideoPage({ params }: { params: Promise<{ driveId: string }> }) {
  const { driveId } = await params;
  const { student } = await requireStudentOrRedirect();

  const found = await prisma.application.findUnique({
    where: { studentId_driveId: { studentId: student.id, driveId } },
    select: { id: true },
  });
  if (!found) notFound();
  // If the time ran out while the student was away, close the attempt before showing anything.
  await settleVideoApplication(found.id);

  const application = await prisma.application.findUnique({
    where: { id: found.id },
    select: {
      stage: true,
      videoAttempt: { select: { status: true, endReason: true } },
      drive: { select: { jobRole: true, companyName: true, status: true, videoStatus: true } },
    },
  });
  if (!application || application.stage === "WITHDRAWN" || application.drive.videoStatus !== "PUBLISHED") notFound();

  const { drive, videoAttempt: attempt } = application;
  const title = `${drive.jobRole} at ${drive.companyName}`;

  return (
    <div className="max-w-3xl">
      <Link href="/student/drives" className="text-xs text-brand-500 hover:text-brand-600">
        ← Back to drives
      </Link>
      <h1 className="text-2xl font-semibold text-ink mt-2">Video interview</h1>
      <p className="text-muted text-sm mt-1">{title}</p>

      {!attempt &&
        (["OPEN", "IN_PROGRESS"].includes(drive.status) ? (
          <VideoInterview driveId={driveId} title={title} />
        ) : (
          <Card className="mt-6">
            <CardContent className="pt-5">
              <p className="text-sm text-muted">This drive is not open right now, so the interview can&apos;t be started.</p>
            </CardContent>
          </Card>
        ))}

      {attempt?.status === "IN_PROGRESS" && <VideoReopened driveId={driveId} />}

      {attempt && attempt.status !== "IN_PROGRESS" && <VideoDoneCard stage={attempt.status as VideoStage} reason={attempt.endReason} />}
    </div>
  );
}
