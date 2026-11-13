"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { guard } from "@/lib/actionResult";
import { checkRateLimit } from "@/lib/rateLimit";
import { loadAttemptForRecruiter, logVideoAccess } from "@/lib/videoAccess";
import { resetFailedSteps } from "@/lib/videoAttempt";
import { deleteRecordingData } from "@/lib/videoStore";

/* What a recruiter can do to a recorded interview of their own drive. Each action checks, on the server, that the
 * attempt belongs to a drive of this approved recruiter, and records who did it. */

async function loadMine(attemptId: unknown) {
  const session = await getSession();
  assertRole(session, "RECRUITER");
  const attempt = await loadAttemptForRecruiter(session, attemptId);
  if (!attempt) throw new Error("Interview not found.");
  if (attempt.status === "IN_PROGRESS") throw new Error("This interview is still being recorded.");
  return { session, attempt };
}

function refresh(attemptId: string, driveId: string) {
  revalidatePath(`/recruiter/interviews/${attemptId}`);
  revalidatePath("/recruiter/interviews");
  revalidatePath(`/recruiter/drives/${driveId}`);
}

/** Tries the steps that failed again (speech to text, AI marking). Finished results are never replaced. */
async function runReprocess(attemptId: unknown) {
  const { session, attempt } = await loadMine(attemptId);
  if (attempt.recordingDeletedAt) throw new Error("The recording was deleted, so it can't be processed again.");
  if (!checkRateLimit(`video-reprocess:${session.userId}`, 10, 10 * 60_000).allowed) throw new Error("Please wait a few minutes before trying again.");
  if (attempt.processingStartedAt && Date.now() - attempt.processingStartedAt.getTime() < 10 * 60_000) throw new Error("It is being processed right now. Please wait.");
  await logVideoAccess(attempt.id, session, "REPROCESS", 0);
  await resetFailedSteps(attempt.id);
  refresh(attempt.id, attempt.application.drive.id);
}

/** Deletes the recording itself, early. The transcripts, marks and the access log are kept. */
async function runDeleteRecording(attemptId: unknown) {
  const { session, attempt } = await loadMine(attemptId);
  if (attempt.recordingDeletedAt) throw new Error("The recording is already deleted.");
  await logVideoAccess(attempt.id, session, "DELETE_RECORDING", 0);
  await deleteRecordingData(attempt.id);
  refresh(attempt.id, attempt.application.drive.id);
}

/**
 * Lets the student take the interview again (for example, after their computer failed). The old attempt, its recording
 * and its marks are removed, and the student is told. The recruiter must ask for it on purpose.
 */
async function runAllowRetake(attemptId: unknown) {
  const { session, attempt } = await loadMine(attemptId);
  if (!checkRateLimit(`video-retake:${session.userId}`, 20, 10 * 60_000).allowed) throw new Error("Please wait a few minutes before trying again.");
  const studentId = attempt.application.student.id;
  const drive = attempt.application.drive;
  await prisma.$transaction([
    prisma.videoAttempt.delete({ where: { id: attempt.id } }),
    prisma.notification.create({
      data: {
        studentId,
        type: "GENERAL",
        title: `You can retake the video interview for ${drive.jobRole} at ${drive.companyName}`,
        message: "The recruiter has let you take the video interview again. Open Drives & Matching to start it.",
      },
    }),
  ]);
  console.info("video attempt removed so the student can retake it:", attempt.id);
  refresh(attempt.id, drive.id);
  revalidatePath("/student/drives");
  revalidatePath("/student/notifications");
}

export async function reprocessVideoAction(attemptId: string) {
  return guard(() => runReprocess(attemptId));
}
export async function deleteVideoRecordingAction(attemptId: string) {
  return guard(() => runDeleteRecording(attemptId));
}
export async function allowVideoRetakeAction(attemptId: string) {
  return guard(() => runAllowRetake(attemptId));
}
