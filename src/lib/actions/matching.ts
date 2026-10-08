"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole, assertAnyRole } from "@/lib/auth";
import { matchCandidateToJob } from "@/lib/ai";
import { checkEligibility } from "@/lib/rules";
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

/** Runs (or re-runs) the AI match for one student against one drive and upserts the Application row. */
export async function computeMatchForStudentDrive(studentId: string, driveId: string) {
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

  const application = await prisma.application.upsert({
    where: { studentId_driveId: { studentId, driveId } },
    create: {
      studentId,
      driveId,
      stage: "ELIGIBLE",
      fitScore: match.fitScore,
      matchedSkills: match.matchedSkills,
      missingSkills: match.missingSkills,
      relevantProjects: match.relevantProjects,
      matchExplanation: match.explanation,
    },
    update: {
      fitScore: match.fitScore,
      matchedSkills: match.matchedSkills,
      missingSkills: match.missingSkills,
      relevantProjects: match.relevantProjects,
      matchExplanation: match.explanation,
    },
  });

  revalidatePath("/student/drives");
  revalidatePath(`/tpo/drives/${driveId}`);
  revalidatePath(`/recruiter/drives/${driveId}`);
  return application;
}

/** Student-triggered: compute (or view cached) AI fit for a drive they're eligible for. */
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
    // Has a TPO Special Consideration flag for this drive — allowed to see/refresh their own fit.
  }

  return computeMatchForStudentDrive(student.id, driveId);
}

/** TPO/Recruiter-triggered: run AI matching across every rule-eligible student for a drive. */
export async function runBulkMatchingForDriveAction(driveId: string) {
  const session = await getSession();
  assertAnyRole(session, ["TPO", "RECRUITER"]);

  const drive = await prisma.drive.findUniqueOrThrow({ where: { id: driveId } });
  const students = await prisma.student.findMany({ where: { placementStatus: { not: "JOINED" } } });

  const rule = {
    minCgpa: drive.minCgpa,
    maxBacklogs: drive.maxBacklogs,
    eligibleBranches: drive.eligibleBranches,
    eligibleGradYears: drive.eligibleGradYears,
  };

  const eligible = students.filter((s) => checkEligibility(s, rule).eligible);

  let processed = 0;
  const errors: string[] = [];
  for (const student of eligible) {
    try {
      await computeMatchForStudentDrive(student.id, driveId);
      processed++;
    } catch (err) {
      errors.push(`${student.rollNo}: ${(err as Error).message}`);
    }
  }

  revalidatePath(`/tpo/drives/${driveId}`);
  revalidatePath(`/recruiter/drives/${driveId}`);
  return { totalEligible: eligible.length, processed, errors };
}

export async function updateApplicationStageAction(
  applicationId: string,
  stage: "ELIGIBLE" | "SHORTLISTED" | "INTERVIEW" | "SELECTED" | "OFFER" | "REJECTED"
) {
  const session = await getSession();
  assertAnyRole(session, ["TPO", "RECRUITER"]);
  const app = await prisma.application.update({
    where: { id: applicationId },
    data: { stage },
    include: { student: true, drive: true },
  });

  if (stage === "SHORTLISTED") {
    await prisma.notification.create({
      data: {
        studentId: app.studentId,
        type: "SHORTLIST",
        title: `Shortlisted for ${app.drive.jobRole} at ${app.drive.companyName}`,
        message: `You've been shortlisted. Fit score: ${app.fitScore ?? "N/A"}/100.`,
      },
    });
    await prisma.student.update({ where: { id: app.studentId }, data: { placementStatus: "SHORTLISTED" } });
  }
  if (stage === "SELECTED") {
    await prisma.student.update({ where: { id: app.studentId }, data: { placementStatus: "SELECTED" } });
  }

  revalidatePath(`/tpo/drives/${app.driveId}`);
  revalidatePath(`/recruiter/drives/${app.driveId}`);
  revalidatePath("/student/journey");
  return app;
}

/**
 * TPO Special Consideration: surfaces one named student to the recruiter for
 * this drive even though they fail a rule-based eligibility check (e.g. low
 * CGPA), when their skills/projects justify a look. Deliberately bypasses
 * checkEligibility() for this one student only — bulk matching and every
 * other student's filtering are completely untouched by this.
 * Does NOT change application stage, shortlist, or select — the TPO/recruiter
 * still make every downstream decision exactly as normal.
 */
export async function addSpecialConsiderationAction(driveId: string, studentId: string, note: string) {
  const session = await getSession();
  assertRole(session, "TPO");

  const application = await computeMatchForStudentDrive(studentId, driveId);

  const updated = await prisma.application.update({
    where: { id: application.id },
    data: { specialConsideration: true, specialConsiderationNote: note.trim() || null },
  });

  revalidatePath(`/tpo/drives/${driveId}`);
  revalidatePath(`/recruiter/drives/${driveId}`);
  revalidatePath("/student/drives");
  return updated;
}

/**
 * Undoes a Special Consideration. If the student doesn't independently pass
 * the drive's eligibility rules, their Application is removed entirely (so
 * they go back to being invisible to the recruiter, exactly as if they'd
 * never been flagged). If they DO independently qualify — e.g. the TPO
 * loosened the drive's rules since, or flagged someone who already
 * qualified — only the flag/note is cleared and their application stays,
 * same as any other naturally-eligible candidate.
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

  if (eligibility.eligible) {
    await prisma.application.update({
      where: { id: applicationId },
      data: { specialConsideration: false, specialConsiderationNote: null },
    });
  } else {
    await prisma.application.delete({ where: { id: applicationId } });
  }

  revalidatePath(`/tpo/drives/${application.driveId}`);
  revalidatePath(`/recruiter/drives/${application.driveId}`);
  revalidatePath("/student/drives");
}
