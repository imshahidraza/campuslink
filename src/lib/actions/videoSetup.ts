"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { assertCanManageDrive } from "@/lib/access";
import { guard } from "@/lib/actionResult";
import { checkRateLimit } from "@/lib/rateLimit";
import { draftVideoQuestions } from "@/lib/ai";
import { cleanVideoQuestionEdit, VIDEO_QUESTION_COUNT } from "@/lib/video";

/* The recruiter's side of a drive's video interview: five spoken questions. Every action checks who is asking,
 * that the drive is theirs, and that it is in the right state, on the server. */

function refresh(driveId: string) {
  revalidatePath(`/recruiter/drives/${driveId}`);
}

async function loadOwnDrive(driveId: unknown) {
  const session = await getSession();
  assertRole(session, "RECRUITER");
  if (typeof driveId !== "string" || !driveId) throw new Error("Drive not found.");
  const drive = await prisma.drive.findUnique({
    where: { id: driveId },
    select: { id: true, recruiterId: true, companyName: true, jobRole: true, jobDescriptionRaw: true, jdSummary: true, jdRequiredSkills: true, videoStatus: true },
  });
  if (!drive) throw new Error("Drive not found.");
  await assertCanManageDrive(session, drive.recruiterId); // also needs the recruiter to be approved
  return { session, drive };
}

/** Replaces the draft with five questions. Published questions are never replaced. */
async function replaceDraft(driveId: string, questions: { prompt: string; expected: string | null }[]) {
  await prisma.$transaction(async (tx) => {
    // The state is checked again here: someone may have published while the AI was thinking.
    const moved = await tx.drive.updateMany({ where: { id: driveId, videoStatus: { in: ["NONE", "DRAFT"] } }, data: { videoStatus: "DRAFT" } });
    if (moved.count === 0) throw new Error("These questions were published in the meantime.");
    await tx.videoQuestion.deleteMany({ where: { driveId } });
    await tx.videoQuestion.createMany({ data: questions.map((q, i) => ({ driveId, position: i, prompt: q.prompt, expected: q.expected })) });
  });
  refresh(driveId);
}

async function runDraft(driveId: unknown) {
  const { session, drive } = await loadOwnDrive(driveId);
  if (drive.videoStatus === "PUBLISHED") throw new Error("These questions are already published, so they can't be replaced.");
  if (!checkRateLimit(`video-draft:${session.userId}`, 4, 10 * 60_000).allowed) throw new Error("Please wait a few minutes before drafting again.");
  const questions = await draftVideoQuestions({
    jobRole: drive.jobRole,
    companyName: drive.companyName,
    summary: drive.jdSummary || "",
    requiredSkills: drive.jdRequiredSkills,
    jobDescription: drive.jobDescriptionRaw,
  });
  await replaceDraft(drive.id, questions);
}

/** For when the AI is not available: five empty questions that the recruiter writes. */
async function runBlank(driveId: unknown) {
  const { drive } = await loadOwnDrive(driveId);
  if (drive.videoStatus === "PUBLISHED") throw new Error("These questions are already published, so they can't be replaced.");
  await replaceDraft(drive.id, Array.from({ length: VIDEO_QUESTION_COUNT }, () => ({ prompt: "", expected: null })));
}

async function runUpdate(driveId: unknown, questionId: unknown, input: unknown) {
  const { drive } = await loadOwnDrive(driveId);
  if (drive.videoStatus === "PUBLISHED") throw new Error("Published questions can't be changed.");
  if (typeof questionId !== "string") throw new Error("Question not found.");
  const checked = cleanVideoQuestionEdit((typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>);
  if (!checked.ok) throw new Error(checked.message);
  const changed = await prisma.videoQuestion.updateMany({
    where: { id: questionId, driveId: drive.id, drive: { videoStatus: { not: "PUBLISHED" } } },
    data: { prompt: checked.question.prompt, expected: checked.question.expected },
  });
  if (changed.count === 0) throw new Error("Question not found, or it was published in the meantime.");
  refresh(drive.id);
}

/** The recruiter has read the five questions and approves them. From now on students can take it. */
async function runPublish(driveId: unknown) {
  const { drive } = await loadOwnDrive(driveId);
  if (drive.videoStatus !== "DRAFT") throw new Error("Draft the questions first.");
  const rows = await prisma.videoQuestion.findMany({ where: { driveId: drive.id }, orderBy: { position: "asc" } });
  if (rows.length !== VIDEO_QUESTION_COUNT) throw new Error(`The video interview needs exactly ${VIDEO_QUESTION_COUNT} questions.`);
  for (const [i, r] of rows.entries()) {
    const ok = cleanVideoQuestionEdit({ prompt: r.prompt, expected: r.expected ?? "" });
    if (!ok.ok) throw new Error(`Question ${i + 1}: ${ok.message}`);
  }
  const changed = await prisma.drive.updateMany({ where: { id: drive.id, videoStatus: "DRAFT" }, data: { videoStatus: "PUBLISHED" } });
  if (changed.count === 0) throw new Error("This was already published. Please refresh the page.");

  const applicants = await prisma.application.findMany({
    where: { driveId: drive.id, stage: { in: ["ELIGIBLE", "SHORTLISTED", "INTERVIEW"] } },
    select: { studentId: true },
    take: 1000,
  });
  if (applicants.length > 0) {
    await prisma.notification.createMany({
      data: applicants.map((a) => ({
        studentId: a.studentId,
        type: "GENERAL" as const,
        title: `Video interview for ${drive.jobRole} at ${drive.companyName}`,
        message: "Please take the short recorded video interview from Drives & Matching. You need a computer with a camera and a microphone. The recruiter can shortlist you only after you finish it.",
      })),
    });
  }
  refresh(drive.id);
  revalidatePath("/student/notifications");
  revalidatePath("/student/drives");
}

export async function draftVideoQuestionsAction(driveId: string) {
  return guard(() => runDraft(driveId));
}
export async function startBlankVideoDraftAction(driveId: string) {
  return guard(() => runBlank(driveId));
}
export async function updateVideoQuestionAction(driveId: string, questionId: string, input: unknown) {
  return guard(() => runUpdate(driveId, questionId, input));
}
export async function publishVideoQuestionsAction(driveId: string) {
  return guard(() => runPublish(driveId));
}
