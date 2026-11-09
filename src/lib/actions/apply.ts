"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { checkEligibility } from "@/lib/rules";
import { refreshPlacementStatus } from "@/lib/placement";

function revalidateApplyPaths(driveId: string) {
  revalidatePath("/student/drives");
  revalidatePath("/student/journey");
  revalidatePath("/student");
  revalidatePath(`/recruiter/drives/${driveId}`);
  revalidatePath(`/tpo/drives/${driveId}`);
  revalidatePath("/recruiter/candidates");
}

/** The student presses Apply. This is the only thing (besides a TPO recommendation) that puts them in front of a recruiter. */
export async function applyToDriveAction(driveId: string) {
  const session = await getSession();
  assertRole(session, "STUDENT");
  const student = await prisma.student.findUniqueOrThrow({ where: { userId: session.userId } });
  const drive = await prisma.drive.findUniqueOrThrow({ where: { id: driveId } });

  if (drive.status !== "OPEN") throw new Error("This drive is not open for applications.");
  if (drive.applyDeadline && drive.applyDeadline.getTime() < Date.now()) {
    throw new Error("The last date to apply for this drive has passed.");
  }
  if (student.placementStatus === "JOINED") {
    throw new Error("You have already joined a company, so you can't apply to more drives.");
  }

  const existing = await prisma.application.findUnique({
    where: { studentId_driveId: { studentId: student.id, driveId } },
  });

  const eligibility = checkEligibility(student, {
    minCgpa: drive.minCgpa,
    maxBacklogs: drive.maxBacklogs,
    eligibleBranches: drive.eligibleBranches,
    eligibleGradYears: drive.eligibleGradYears,
  });
  if (!eligibility.eligible && !existing?.specialConsideration) {
    throw new Error(`You're not eligible for this drive: ${eligibility.reasons.join("; ")}`);
  }

  if (existing && existing.stage !== "WITHDRAWN") {
    throw new Error("You have already applied to this drive.");
  }

  // Carry over the private AI fit the student may have already checked.
  const match = await prisma.driveMatch.findUnique({ where: { studentId_driveId: { studentId: student.id, driveId } } });
  const matchData = match
    ? {
        fitScore: match.fitScore,
        matchedSkills: match.matchedSkills,
        missingSkills: match.missingSkills,
        relevantProjects: match.relevantProjects,
        matchExplanation: match.matchExplanation,
      }
    : {};

  if (existing) {
    await prisma.application.update({ where: { id: existing.id }, data: { stage: "ELIGIBLE", ...matchData } });
  } else {
    await prisma.application.create({ data: { studentId: student.id, driveId, stage: "ELIGIBLE", ...matchData } });
  }

  await prisma.recruiterNotification.create({
    data: {
      recruiterId: drive.recruiterId,
      type: "GENERAL",
      title: `New application for ${drive.jobRole}`,
      message: `${student.rollNo} applied for ${drive.jobRole}.`,
    },
  });
  await refreshPlacementStatus(student.id);

  revalidateApplyPaths(driveId);
  revalidatePath("/recruiter/notifications");
}

/** A student can take their application back until the recruiter shortlists them. */
export async function withdrawApplicationAction(driveId: string) {
  const session = await getSession();
  assertRole(session, "STUDENT");
  const student = await prisma.student.findUniqueOrThrow({ where: { userId: session.userId } });
  const application = await prisma.application.findUnique({
    where: { studentId_driveId: { studentId: student.id, driveId } },
  });
  if (!application) throw new Error("You haven't applied to this drive.");
  if (application.stage !== "ELIGIBLE") {
    throw new Error("You can only withdraw before the recruiter shortlists you. Please contact your placement cell.");
  }

  await prisma.application.update({ where: { id: application.id }, data: { stage: "WITHDRAWN" } });
  await refreshPlacementStatus(student.id);

  revalidateApplyPaths(driveId);
}
