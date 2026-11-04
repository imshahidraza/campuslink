"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole, assertAnyRole } from "@/lib/auth";
import { matchCandidateToJob } from "@/lib/ai";
import { checkEligibility, OFFER_PIPELINE_STAGES } from "@/lib/rules";
import { assertCanManageDrive } from "@/lib/access";
import { placementCellLabel } from "@/lib/college";
import { refreshPlacementStatus } from "@/lib/placement";
import type { Student } from "@prisma/client";

function projectsToText(student: Student): string {
  return Array.isArray(student.projects)
    ? (student.projects as { title: string; description: string }[])
        .map((p) => `${p.title}: ${p.description}`)
        .join("; ")
    : "";
}

function experienceToText(student: Student): string {
  return Array.isArray(student.experience)
    ? (student.experience as { title: string; org: string; description: string }[])
        .map((e) => `${e.title} at ${e.org}: ${e.description}`)
        .join("; ")
    : "";
}

function assessmentSummary(student: Student): string {
  const parts = [];
  if (student.aptitudeScore != null) parts.push(`Aptitude ${student.aptitudeScore}`);
  if (student.reasoningScore != null) parts.push(`Reasoning ${student.reasoningScore}`);
  if (student.verbalScore != null) parts.push(`Verbal ${student.verbalScore}`);
  if (student.communicationScore != null) parts.push(`Communication ${student.communicationScore}`);
  return parts.length ? parts.join(", ") : "No assessment scores on file";
}

export interface MatchResult {
  fitScore: number | null;
  matchedSkills: string[];
  missingSkills: string[];
  relevantProjects: string[];
  matchExplanation: string | null;
}

/**
 * Runs (or re-runs) the AI match for one student against one drive.
 * The result is saved as the student's private DriveMatch. It becomes visible to a recruiter only
 * once the student applies (or the placement cell specially recommends them), and if an
 * application already exists it is refreshed too.
 */
export async function computeMatchForStudentDrive(studentId: string, driveId: string): Promise<MatchResult> {
  const [student, drive] = await Promise.all([
    prisma.student.findUniqueOrThrow({ where: { id: studentId } }),
    prisma.drive.findUniqueOrThrow({ where: { id: driveId } }),
  ]);

  const match = await matchCandidateToJob({
    studentSkills: student.skills,
    studentProjects: projectsToText(student),
    studentCertifications: student.certifications,
    studentExperience: experienceToText(student),
    assessmentSummary: assessmentSummary(student),
    requiredSkills: drive.jdRequiredSkills,
    preferredSkills: drive.jdPreferredSkills,
    jobSummary: drive.jdSummary || drive.jobDescriptionRaw.slice(0, 500),
  });

  const values = {
    fitScore: match.fitScore,
    matchedSkills: match.matchedSkills,
    missingSkills: match.missingSkills,
    relevantProjects: match.relevantProjects,
    matchExplanation: match.explanation,
  };

  await prisma.driveMatch.upsert({
    where: { studentId_driveId: { studentId, driveId } },
    create: { studentId, driveId, ...values },
    update: values,
  });
  await prisma.application.updateMany({ where: { studentId, driveId }, data: values });

  revalidatePath("/student/drives");
  revalidatePath(`/tpo/drives/${driveId}`);
  revalidatePath(`/recruiter/drives/${driveId}`);
  return values;
}

/** Student-triggered: see how well they fit a drive they are eligible for. This does not apply for them. */
export async function studentComputeMatchAction(driveId: string) {
  const session = await getSession();
  assertRole(session, "STUDENT");
  const student = await prisma.student.findUniqueOrThrow({ where: { userId: session.userId } });
  const drive = await prisma.drive.findUniqueOrThrow({ where: { id: driveId } });

  const eligibility = checkEligibility(student, {
    minCgpa: drive.minCgpa,
    maxBacklogs: drive.maxBacklogs,
    eligibleBranches: drive.eligibleBranches,
    eligibleGradYears: drive.eligibleGradYears,
  });

  if (!eligibility.eligible) {
    const existing = await prisma.application.findUnique({
      where: { studentId_driveId: { studentId: student.id, driveId } },
    });
    if (!existing?.specialConsideration) {
      throw new Error(`You're not eligible for this drive: ${eligibility.reasons.join("; ")}`);
    }
    // Has a Special Consideration flag for this drive, so they may see and refresh their own fit.
  }

  return computeMatchForStudentDrive(student.id, driveId);
}

/** TPO/Recruiter-triggered: score every applicant of a drive that does not have an AI score yet. */
export async function runBulkMatchingForDriveAction(driveId: string) {
  const session = await getSession();
  assertAnyRole(session, ["TPO", "RECRUITER"]);

  const drive = await prisma.drive.findUniqueOrThrow({ where: { id: driveId } });
  await assertCanManageDrive(session, drive.recruiterId);

  const applicants = await prisma.application.findMany({
    where: { driveId, stage: { not: "WITHDRAWN" } },
    select: { studentId: true, fitScore: true, student: { select: { rollNo: true } } },
    take: 500,
  });
  const todo = applicants.filter((a) => a.fitScore == null);

  let processed = 0;
  const errors: string[] = [];
  for (const a of todo) {
    try {
      await computeMatchForStudentDrive(a.studentId, driveId);
      processed++;
    } catch (err) {
      errors.push(`${a.student.rollNo}: ${(err as Error).message}`);
    }
  }

  revalidatePath(`/tpo/drives/${driveId}`);
  revalidatePath(`/recruiter/drives/${driveId}`);
  return { totalApplicants: applicants.length, needed: todo.length, processed, errors };
}

type HiringStage = "ELIGIBLE" | "SHORTLISTED" | "INTERVIEW" | "SELECTED" | "REJECTED";

// What a recruiter may do next from each stage. The placement cell is not limited to this list
// (it can correct a stage), but nobody can touch a withdrawn application or one in the offer process.
const RECRUITER_NEXT: Record<string, HiringStage[]> = {
  ELIGIBLE: ["SHORTLISTED", "REJECTED"],
  SHORTLISTED: ["SELECTED", "REJECTED"],
  INTERVIEW: ["SELECTED", "REJECTED"],
  SELECTED: ["REJECTED"],
  REJECTED: [],
};

export async function updateApplicationStageAction(applicationId: string, stage: HiringStage, feedbackNote?: string) {
  const session = await getSession();
  assertAnyRole(session, ["TPO", "RECRUITER"]);
  const existing = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { stage: true, drive: { select: { recruiterId: true } } },
  });
  // Recruiters may only act on applications for their own drives (IDOR guard).
  await assertCanManageDrive(session, existing.drive.recruiterId);
  if (existing.stage === "WITHDRAWN") {
    throw new Error("This student withdrew their application, so it can't be changed.");
  }
  // Once a candidate is in the offer process, hiring-stage changes are locked (the Offers page owns it).
  if ((OFFER_PIPELINE_STAGES as readonly string[]).includes(existing.stage)) {
    throw new Error("This candidate is already in the offer process, so their stage can't be changed here.");
  }
  if (session.role === "RECRUITER" && !(RECRUITER_NEXT[existing.stage] ?? []).includes(stage)) {
    throw new Error(`A candidate who is "${existing.stage.toLowerCase()}" can't be moved to "${stage.toLowerCase()}" from here.`);
  }

  const note = stage === "REJECTED" ? feedbackNote?.trim().slice(0, 500) : undefined;
  const app = await prisma.application.update({
    where: { id: applicationId },
    data: { stage, ...(note ? { feedbackNote: note } : {}) },
    include: { student: { include: { user: { select: { name: true } } } }, drive: true },
  });

  if (stage === "SHORTLISTED") {
    await prisma.notification.create({
      data: {
        studentId: app.studentId,
        type: "SHORTLIST",
        title: `Shortlisted for ${app.drive.jobRole} at ${app.drive.companyName}`,
        message: `You have been shortlisted. Fit score: ${app.fitScore ?? "not scored yet"}${app.fitScore != null ? "/100" : ""}.`,
      },
    });
  }
  if (stage === "REJECTED") {
    await prisma.notification.create({
      data: {
        studentId: app.studentId,
        type: "GENERAL",
        title: `Update on your ${app.drive.jobRole} application`,
        message: note || `${app.drive.companyName} did not select you for this role this time. Other drives are still open to you.`,
      },
    });
  }
  if (stage === "SELECTED") {
    await prisma.notification.create({
      data: {
        studentId: app.studentId,
        type: "OFFER_UPDATE",
        title: `You were selected by ${app.drive.companyName}`,
        message: `Congratulations! You were selected for ${app.drive.jobRole}. The company will now request your offer through the placement cell.`,
      },
    });
    if (session.role === "RECRUITER") {
      await prisma.tpoNotification.create({
        data: {
          type: "OFFER_UPDATE",
          title: "A candidate was selected",
          message: `${app.drive.companyName} selected ${app.student.rollNo} (${app.student.user.name}) for ${app.drive.jobRole}. An offer request should follow.`,
        },
      });
    }
  }
  await refreshPlacementStatus(app.studentId);

  revalidatePath(`/tpo/drives/${app.driveId}`);
  revalidatePath(`/recruiter/drives/${app.driveId}`);
  revalidatePath("/recruiter/candidates");
  revalidatePath("/student/journey");
  revalidatePath("/student/notifications");
  revalidatePath("/tpo/notifications");
  return app;
}

/**
 * TPO Special Consideration: surfaces one named student to the recruiter for
 * this drive even though they fail a rule-based eligibility check (e.g. low
 * CGPA), when their skills/projects justify a look. Deliberately bypasses
 * checkEligibility() for this one student only; every other student's
 * filtering is untouched. It does NOT shortlist or select anyone: the
 * recruiter still makes every downstream decision.
 */
export async function addSpecialConsiderationAction(driveId: string, studentId: string, note: string) {
  const session = await getSession();
  assertRole(session, "TPO");

  const [drive, student] = await Promise.all([
    prisma.drive.findUniqueOrThrow({ where: { id: driveId } }),
    prisma.student.findUniqueOrThrow({ where: { id: studentId } }),
  ]);
  const cleanNote = note.trim().slice(0, 300);

  const match = await computeMatchForStudentDrive(studentId, driveId);
  const existing = await prisma.application.findUnique({ where: { studentId_driveId: { studentId, driveId } } });
  const data = { ...match, specialConsideration: true, specialConsiderationNote: cleanNote || null };
  const updated = existing
    ? await prisma.application.update({
        where: { id: existing.id },
        // A recommendation also re-opens an application the student had withdrawn.
        data: { ...data, ...(existing.stage === "WITHDRAWN" ? { stage: "ELIGIBLE" as const } : {}) },
      })
    : await prisma.application.create({ data: { studentId, driveId, stage: "ELIGIBLE", ...data } });

  const cell = await placementCellLabel();
  await prisma.recruiterNotification.create({
    data: {
      recruiterId: drive.recruiterId,
      type: "SPECIAL_CONSIDERATION",
      title: `${cell} recommended a candidate`,
      message: `${student.rollNo} was specially recommended for ${drive.jobRole}${cleanNote ? `: "${cleanNote}"` : "."}`,
    },
  });
  await refreshPlacementStatus(studentId);

  revalidatePath(`/tpo/drives/${driveId}`);
  revalidatePath(`/recruiter/drives/${driveId}`);
  revalidatePath("/student/drives");
  revalidatePath("/recruiter/notifications");
  return updated;
}

/**
 * Undoes a Special Consideration. If the student doesn't independently pass the drive's
 * eligibility rules, their Application is removed (they go back to being invisible to the
 * recruiter). If they DO qualify, only the flag and note are cleared.
 */
export async function removeSpecialConsiderationAction(applicationId: string) {
  const session = await getSession();
  assertRole(session, "TPO");

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { student: true, drive: true },
  });

  const eligibility = checkEligibility(application.student, {
    minCgpa: application.drive.minCgpa,
    maxBacklogs: application.drive.maxBacklogs,
    eligibleBranches: application.drive.eligibleBranches,
    eligibleGradYears: application.drive.eligibleGradYears,
  });

  // Only an application nobody has acted on yet can be removed outright; otherwise just clear the flag.
  if (!eligibility.eligible && application.stage === "ELIGIBLE") {
    await prisma.application.delete({ where: { id: applicationId } });
  } else {
    await prisma.application.update({
      where: { id: applicationId },
      data: { specialConsideration: false, specialConsiderationNote: null },
    });
  }
  await refreshPlacementStatus(application.studentId);

  revalidatePath(`/tpo/drives/${application.driveId}`);
  revalidatePath(`/recruiter/drives/${application.driveId}`);
  revalidatePath("/student/drives");
}
