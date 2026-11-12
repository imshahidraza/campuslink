"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { assertCanManageDrive } from "@/lib/access";
import { guard } from "@/lib/actionResult";
import { checkRateLimit } from "@/lib/rateLimit";
import { draftScreeningQuestions } from "@/lib/ai";
import { checkPublishable, type DraftQuestion } from "@/lib/screening";

/* The recruiter's side of a drive's text screening interview. Every action checks who is asking, that the drive
 * is theirs, and that it is in the right state, on the server. */

function refresh(driveId: string) {
  revalidatePath(`/recruiter/drives/${driveId}`);
}

async function loadOwnDrive(driveId: unknown) {
  const session = await getSession();
  assertRole(session, "RECRUITER");
  if (typeof driveId !== "string" || !driveId) throw new Error("Drive not found.");
  const drive = await prisma.drive.findUnique({
    where: { id: driveId },
    select: {
      id: true,
      recruiterId: true,
      companyName: true,
      jobRole: true,
      jobDescriptionRaw: true,
      jdSummary: true,
      jdRequiredSkills: true,
      jdPreferredSkills: true,
      screeningStatus: true,
    },
  });
  if (!drive) throw new Error("Drive not found.");
  await assertCanManageDrive(session, drive.recruiterId); // also needs the recruiter to be approved
  return { session, drive };
}

/** Drafts (or re-drafts) the questions with the AI. The old draft is replaced. Published questions are never replaced. */
async function runDraft(driveId: string) {
  const { session, drive } = await loadOwnDrive(driveId);
  if (drive.screeningStatus === "PUBLISHED") throw new Error("These questions are already published, so they can't be replaced.");

  const limit = checkRateLimit(`screening-draft:${session.userId}`, 4, 10 * 60_000);
  if (!limit.allowed) throw new Error("Please wait a few minutes before drafting again.");

  const questions = await draftScreeningQuestions({
    jobRole: drive.jobRole,
    companyName: drive.companyName,
    summary: drive.jdSummary || "",
    requiredSkills: drive.jdRequiredSkills,
    preferredSkills: drive.jdPreferredSkills,
    jobDescription: drive.jobDescriptionRaw,
  });

  await prisma.$transaction(async (tx) => {
    // The state is checked again here: someone may have published while the AI was thinking.
    const moved = await tx.drive.updateMany({
      where: { id: drive.id, screeningStatus: { in: ["NONE", "DRAFT"] } },
      data: { screeningStatus: "DRAFT" },
    });
    if (moved.count === 0) throw new Error("These questions were published in the meantime.");
    await tx.screeningQuestion.deleteMany({ where: { driveId: drive.id } });
    await tx.screeningQuestion.createMany({
      data: questions.map((q: DraftQuestion, i: number) => ({
        driveId: drive.id,
        position: i,
        kind: q.kind,
        prompt: q.prompt,
        options: q.options,
        correctIndex: q.correctIndex,
        lookFor: q.lookFor,
      })),
    });
  });
  refresh(drive.id);
}

/** The recruiter has read the draft and approves it. From now on students can take it. */
async function runPublish(driveId: string) {
  const { drive } = await loadOwnDrive(driveId);
  if (drive.screeningStatus !== "DRAFT") throw new Error("Draft the questions first.");

  const rows = await prisma.screeningQuestion.findMany({ where: { driveId: drive.id }, orderBy: { position: "asc" } });
  const check = checkPublishable(
    rows.map((r) => ({ kind: r.kind, prompt: r.prompt, options: r.options, correctIndex: r.correctIndex, lookFor: r.lookFor }))
  );
  if (!check.ok) throw new Error(check.message);

  const changed = await prisma.drive.updateMany({
    where: { id: drive.id, screeningStatus: "DRAFT" },
    data: { screeningStatus: "PUBLISHED" },
  });
  if (changed.count === 0) throw new Error("This was already published. Please refresh the page.");
  refresh(drive.id);
}

export async function draftScreeningAction(driveId: string) {
  return guard(() => runDraft(driveId));
}

export async function publishScreeningAction(driveId: string) {
  return guard(() => runPublish(driveId));
}
