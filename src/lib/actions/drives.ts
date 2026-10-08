"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole, assertAnyRole } from "@/lib/auth";
import { parseJobDescription } from "@/lib/ai";

async function requireRecruiter() {
  const session = await getSession();
  assertRole(session, "RECRUITER");
  const recruiter = await prisma.recruiter.findUniqueOrThrow({ where: { userId: session.userId } });
  return recruiter;
}

async function requireTpo() {
  const session = await getSession();
  assertRole(session, "TPO");
  return session;
}

export async function createDriveAction(formData: FormData) {
  const recruiter = await requireRecruiter();

  const jobRole = String(formData.get("jobRole") || "");
  const jobDescriptionRaw = String(formData.get("jobDescriptionRaw") || "");
  const minCgpa = formData.get("minCgpa") ? Number(formData.get("minCgpa")) : null;
  const maxBacklogs = formData.get("maxBacklogs") ? Number(formData.get("maxBacklogs")) : null;
  const eligibleBranches = String(formData.get("eligibleBranches") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const eligibleGradYears = String(formData.get("eligibleGradYears") || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));
  const driveDate = formData.get("driveDate") ? new Date(String(formData.get("driveDate"))) : null;
  const venue = String(formData.get("venue") || "") || null;

  const parsedJD = await parseJobDescription(jobDescriptionRaw, jobRole);

  const drive = await prisma.drive.create({
    data: {
      recruiterId: recruiter.id,
      companyName: recruiter.companyName,
      jobRole,
      jobDescriptionRaw,
      jdRequiredSkills: parsedJD.requiredSkills,
      jdPreferredSkills: parsedJD.preferredSkills,
      jdSummary: parsedJD.summary,
      minCgpa,
      maxBacklogs,
      eligibleBranches,
      eligibleGradYears,
      driveDate,
      venue,
      status: "DRAFT",
    },
  });

  revalidatePath("/recruiter/drives");
  revalidatePath("/tpo/drives");
  return drive;
}

/** Recruiter (owner) or TPO can edit a drive after creation. Re-runs AI JD parsing only if the JD text actually changed. */
export async function updateDriveAction(driveId: string, formData: FormData) {
  const session = await getSession();
  assertAnyRole(session, ["RECRUITER", "TPO"]);

  const drive = await prisma.drive.findUniqueOrThrow({ where: { id: driveId } });

  if (session.role === "RECRUITER") {
    const recruiter = await prisma.recruiter.findUniqueOrThrow({ where: { userId: session.userId } });
    if (drive.recruiterId !== recruiter.id) {
      throw new Error("You can only edit your own drives.");
    }
  }

  const jobRole = String(formData.get("jobRole") || "");
  const jobDescriptionRaw = String(formData.get("jobDescriptionRaw") || "");
  const minCgpa = formData.get("minCgpa") ? Number(formData.get("minCgpa")) : null;
  const maxBacklogs = formData.get("maxBacklogs") ? Number(formData.get("maxBacklogs")) : null;
  const eligibleBranches = String(formData.get("eligibleBranches") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const eligibleGradYears = String(formData.get("eligibleGradYears") || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));
  const driveDate = formData.get("driveDate") ? new Date(String(formData.get("driveDate"))) : null;
  const venue = String(formData.get("venue") || "") || null;

  const jdChanged = jobDescriptionRaw.trim() !== drive.jobDescriptionRaw.trim();
  const parsedJD = jdChanged ? await parseJobDescription(jobDescriptionRaw, jobRole) : null;

  const updated = await prisma.drive.update({
    where: { id: driveId },
    data: {
      jobRole,
      jobDescriptionRaw,
      minCgpa,
      maxBacklogs,
      eligibleBranches,
      eligibleGradYears,
      driveDate,
      venue,
      ...(parsedJD
        ? {
            jdRequiredSkills: parsedJD.requiredSkills,
            jdPreferredSkills: parsedJD.preferredSkills,
            jdSummary: parsedJD.summary,
          }
        : {}),
    },
  });

  revalidatePath("/recruiter/drives");
  revalidatePath(`/recruiter/drives/${driveId}`);
  revalidatePath("/tpo/drives");
  revalidatePath(`/tpo/drives/${driveId}`);
  revalidatePath("/student/drives");
  return { drive: updated, jdReanalyzed: jdChanged };
}

export async function updateDriveStatusAction(
  driveId: string,
  status: "DRAFT" | "OPEN" | "IN_PROGRESS" | "CLOSED"
) {
  const session = await getSession();
  assertAnyRole(session, ["TPO", "RECRUITER"]);
  const previous = await prisma.drive.findUniqueOrThrow({ where: { id: driveId } });
  await prisma.drive.update({ where: { id: driveId }, data: { status } });

  if (status === "OPEN" && previous.status !== "OPEN") {
    const drive = previous;
    const students = await prisma.student.findMany({ where: { placementStatus: { not: "JOINED" } } });
    await prisma.notification.createMany({
      data: students.map((s) => ({
        studentId: s.id,
        type: "DRIVE_ANNOUNCEMENT" as const,
        title: `New drive: ${drive.jobRole} at ${drive.companyName}`,
        message: drive.jdSummary || "A new placement drive has opened. Check your eligibility.",
      })),
    });
  }

  revalidatePath("/recruiter/drives");
  revalidatePath("/tpo/drives");
  revalidatePath(`/tpo/drives/${driveId}`);
  revalidatePath(`/recruiter/drives/${driveId}`);
}

export async function tpoUpdateEligibilityAction(driveId: string, formData: FormData) {
  await requireTpo();
  const minCgpa = formData.get("minCgpa") ? Number(formData.get("minCgpa")) : null;
  const maxBacklogs = formData.get("maxBacklogs") ? Number(formData.get("maxBacklogs")) : null;
  const eligibleBranches = String(formData.get("eligibleBranches") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const eligibleGradYears = String(formData.get("eligibleGradYears") || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));

  await prisma.drive.update({
    where: { id: driveId },
    data: { minCgpa, maxBacklogs, eligibleBranches, eligibleGradYears },
  });

  revalidatePath(`/tpo/drives/${driveId}`);
}
