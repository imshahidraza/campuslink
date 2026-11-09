"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { parseResume, analyzeReadiness, generatePrepPlan, generateRoadmap, reviewResume } from "@/lib/ai";
import { checkEligibility, rankSkillGaps } from "@/lib/rules";

type Project = { title: string; description: string; tech: string[] };

/** Reads the project cards sent by the profile form (a JSON array) and keeps only clean, size-limited entries. */
function parseProjectsInput(raw: string): Project[] | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON: keep what was typed as a single project rather than losing it.
    return [{ title: "Projects", description: text.slice(0, 800), tech: [] }];
  }
  if (!Array.isArray(parsed)) return undefined;
  return parsed
    .slice(0, 10)
    .map((p): Project => {
      const o = (p ?? {}) as Record<string, unknown>;
      const tech = Array.isArray(o.tech) ? o.tech.map((t) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 12) : [];
      return {
        title: String(o.title ?? "").trim().slice(0, 120),
        description: String(o.description ?? "").trim().slice(0, 800),
        tech,
      };
    })
    .filter((p) => p.title || p.description);
}

async function requireStudent() {
  const session = await getSession();
  assertRole(session, "STUDENT");
  const student = await prisma.student.findUnique({ where: { userId: session.userId } });
  if (!student) throw new Error("Student profile not found.");
  return student;
}

export async function updateStudentBasics(formData: FormData) {
  const student = await requireStudent();

  const skills = String(formData.get("skills") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const certifications = String(formData.get("certifications") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const courses = String(formData.get("courses") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const preferredRoles = String(formData.get("preferredRoles") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await prisma.student.update({
    where: { id: student.id },
    data: {
      skills,
      certifications,
      courses,
      preferredRoles,
      githubUrl: String(formData.get("githubUrl") || "") || null,
      linkedinUrl: String(formData.get("linkedinUrl") || "") || null,
      portfolioUrl: String(formData.get("portfolioUrl") || "") || null,
      projects: parseProjectsInput(String(formData.get("projects") || "")),
    },
  });

  revalidatePath("/student/profile");
}

export async function parseResumeAction(resumeText: string) {
  const student = await requireStudent();
  const parsed = await parseResume(resumeText);

  await prisma.student.update({
    where: { id: student.id },
    data: {
      resumeText,
      resumeSkills: parsed.skills,
      skills: Array.from(new Set([...student.skills, ...parsed.skills, ...parsed.technologies])),
      certifications: Array.from(new Set([...student.certifications, ...parsed.certifications])),
      projects: parsed.projects as unknown as object,
      experience: parsed.experience as unknown as object,
    },
  });

  revalidatePath("/student/profile");
  return parsed;
}

/** Student removes their uploaded resume PDF (the AI-parsed skills on the profile are left as they are). */
export async function deleteResumeAction() {
  const student = await requireStudent();
  await prisma.resume.deleteMany({ where: { studentId: student.id } });
  revalidatePath("/student/profile");
}

export async function runReadinessAnalysisAction() {
  const student = await requireStudent();

  const projectsText = Array.isArray(student.projects)
    ? (student.projects as { title: string; description: string }[])
        .map((p) => `${p.title}: ${p.description}`)
        .join("; ")
    : "";
  const experienceText = Array.isArray(student.experience)
    ? (student.experience as { title: string; org: string; description: string }[])
        .map((e) => `${e.title} at ${e.org}: ${e.description}`)
        .join("; ")
    : "";

  const result = await analyzeReadiness({
    cgpa: student.cgpa,
    backlogs: student.backlogs,
    aptitudeScore: student.aptitudeScore,
    reasoningScore: student.reasoningScore,
    verbalScore: student.verbalScore,
    communicationScore: student.communicationScore,
    skills: student.skills,
    projects: projectsText,
    certifications: student.certifications,
    experience: experienceText,
    preferredRoles: student.preferredRoles,
  });

  await prisma.student.update({
    where: { id: student.id },
    data: {
      readinessLevel: result.readinessLevel,
      readinessSummary: result.summary,
      strengths: result.strengths,
      skillGaps: result.skillGaps,
      improvementAreas: result.improvementAreas,
      readinessUpdatedAt: new Date(),
    },
  });

  revalidatePath("/student/readiness");
  revalidatePath("/student");
  return result;
}

/**
 * "Skills to learn next": rules rank which skills the student lacks across the open drives they're
 * eligible for; AI only writes the how-to-learn plan for the top few. Cached on the student.
 */
export async function generateRoadmapAction() {
  const student = await requireStudent();

  const [drives, apps] = await Promise.all([
    prisma.drive.findMany({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.application.findMany({ where: { studentId: student.id, specialConsideration: true }, select: { driveId: true } }),
  ]);
  const special = new Set(apps.map((a) => a.driveId));
  const reachable = drives.filter(
    (d) =>
      special.has(d.id) ||
      checkEligibility(student, {
        minCgpa: d.minCgpa,
        maxBacklogs: d.maxBacklogs,
        eligibleBranches: d.eligibleBranches,
        eligibleGradYears: d.eligibleGradYears,
      }).eligible
  );

  const gaps = rankSkillGaps(
    [...student.skills, ...student.resumeSkills],
    reachable.map((d) => ({ jobRole: d.jobRole, requiredSkills: d.jdRequiredSkills }))
  ).slice(0, 5);

  if (gaps.length === 0) {
    const empty = { steps: [], basedOn: [] };
    await prisma.student.update({ where: { id: student.id }, data: { roadmap: empty, roadmapUpdatedAt: new Date() } });
    revalidatePath("/student/readiness");
    return empty;
  }

  const result = await generateRoadmap({ gaps, currentSkills: student.skills });
  const saved = { steps: (result.steps ?? []).slice(0, 5), basedOn: gaps };
  await prisma.student.update({ where: { id: student.id }, data: { roadmap: saved, roadmapUpdatedAt: new Date() } });
  revalidatePath("/student/readiness");
  return saved;
}

/** AI feedback on the student's own resume text. Cached on the student. */
export async function reviewResumeAction() {
  const student = await requireStudent();
  if (!student.resumeText || student.resumeText.trim().length < 40) {
    throw new Error("Upload your resume PDF (or paste its text) and parse it first.");
  }
  const fb = await reviewResume(student.resumeText);
  const saved = {
    strengths: (fb.strengths ?? []).slice(0, 4),
    improvements: (fb.improvements ?? []).slice(0, 6),
  };
  await prisma.student.update({ where: { id: student.id }, data: { resumeFeedback: saved, resumeFeedbackAt: new Date() } });
  revalidatePath("/student/profile");
  return saved;
}

export async function generatePrepPlanAction(targetRole: string) {
  const student = await requireStudent();
  return generatePrepPlan({ skillGaps: student.skillGaps, targetRole });
}

export async function markNotificationReadAction(notificationId: string) {
  const student = await requireStudent();
  await prisma.notification.updateMany({
    where: { id: notificationId, studentId: student.id },
    data: { read: true },
  });
  revalidatePath("/student/notifications");
}
