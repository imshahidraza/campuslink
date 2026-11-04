"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole, assertAnyRole } from "@/lib/auth";
import { parseJobDescription } from "@/lib/ai";
import { assertCanManageDrive, requireApprovedRecruiter } from "@/lib/access";
import { parseSpecializationList } from "@/lib/normalize";

/** Only an approved recruiter can create or change drives. */
async function requireRecruiter() {
  const session = await getSession();
  assertRole(session, "RECRUITER");
  return requireApprovedRecruiter(session.userId);
}

/** Last moment to apply: the end of the chosen day, India time. Empty means no deadline. */
function parseDeadline(raw: FormDataEntryValue | null): Date | null {
  const v = String(raw || "").trim();
  if (!v) return null;
  const d = new Date(`${v}T23:59:59+05:30`);
  if (Number.isNaN(d.getTime())) throw new Error("Please choose a valid apply-by date.");
  return d;
}

function parseEligibilityFields(formData: FormData) {
  return {
    minCgpa: formData.get("minCgpa") ? Number(formData.get("minCgpa")) : null,
    maxBacklogs: formData.get("maxBacklogs") ? Number(formData.get("maxBacklogs")) : null,
    // "All" (any casing) means any specialization can apply, stored as an empty list.
    eligibleBranches: parseSpecializationList(String(formData.get("eligibleBranches") || "")),
    eligibleGradYears: String(formData.get("eligibleGradYears") || "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => isValidYear(n)),
  };
}
function isValidYear(n: number) {
  return Number.isFinite(n) && n > 1990 && n < 2100;
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
  const { minCgpa, maxBacklogs, eligibleBranches, eligibleGradYears } = parseEligibilityFields(formData);
  const driveDate = formData.get("driveDate") ? new Date(String(formData.get("driveDate"))) : null;
  const venue = String(formData.get("venue") || "") || null;
  const applyDeadline = parseDeadline(formData.get("applyDeadline"));

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
      applyDeadline,
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

  await assertCanManageDrive(session, drive.recruiterId);

  const jobRole = String(formData.get("jobRole") || "");
  const jobDescriptionRaw = String(formData.get("jobDescriptionRaw") || "");
  const { minCgpa, maxBacklogs, eligibleBranches, eligibleGradYears } = parseEligibilityFields(formData);
  const driveDate = formData.get("driveDate") ? new Date(String(formData.get("driveDate"))) : null;
  const venue = String(formData.get("venue") || "") || null;
  const applyDeadline = parseDeadline(formData.get("applyDeadline"));

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
      applyDeadline,
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
  await assertCanManageDrive(session, previous.recruiterId);
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
  const { minCgpa, maxBacklogs, eligibleBranches, eligibleGradYears } = parseEligibilityFields(formData);

  await prisma.drive.update({
    where: { id: driveId },
    data: { minCgpa, maxBacklogs, eligibleBranches, eligibleGradYears },
  });

  revalidatePath(`/tpo/drives/${driveId}`);
  revalidatePath("/student/drives");
}
