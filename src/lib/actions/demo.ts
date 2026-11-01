"use server";

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { checkEligibility } from "@/lib/rules";

/** Every demo account uses this email domain, so demo data can be found and removed cleanly. */
const DEMO_DOMAIN = "demo.clink.local";

async function requireTpo() {
  const session = await getSession();
  assertRole(session, "TPO");
}

interface DemoStudent {
  roll: string;
  name: string;
  program: "MCA" | "MBA";
  branch: string;
  cgpa: number;
  backlogs: number;
  year: number;
  skills: string[];
  scores: [number, number, number, number]; // aptitude, reasoning, verbal, communication
}

const STUDENTS: DemoStudent[] = [
  { roll: "21MC101", name: "Riya Sharma", program: "MCA", branch: "COMPUTER APPLICATIONS", cgpa: 8.7, backlogs: 0, year: 2027, skills: ["Python", "SQL", "JavaScript", "Git"], scores: [88, 84, 79, 90] },
  { roll: "21MC102", name: "Aman Verma", program: "MCA", branch: "COMPUTER APPLICATIONS", cgpa: 6.2, backlogs: 1, year: 2027, skills: ["Python", "HTML"], scores: [60, 65, 58, 70] },
  { roll: "21MC103", name: "Priya Nair", program: "MCA", branch: "COMPUTER APPLICATIONS", cgpa: 7.8, backlogs: 0, year: 2027, skills: ["Java", "SQL", "Git"], scores: [82, 78, 80, 85] },
  { roll: "21MB104", name: "Karthik Rao", program: "MBA", branch: "SYSTEMS", cgpa: 8.1, backlogs: 0, year: 2027, skills: ["Excel", "SQL", "Data Analysis"], scores: [85, 80, 83, 88] },
  { roll: "21MB105", name: "Sneha Iyer", program: "MBA", branch: "SYSTEMS", cgpa: 6.5, backlogs: 0, year: 2027, skills: ["Excel", "Communication"], scores: [79, 82, 88, 91] },
  { roll: "21MB106", name: "Arjun Mehta", program: "MBA", branch: "MARKETING", cgpa: 8.9, backlogs: 0, year: 2027, skills: ["Excel", "Communication", "Data Analysis"], scores: [90, 88, 85, 80] },
  { roll: "21MC107", name: "Fatima Khan", program: "MCA", branch: "COMPUTER APPLICATIONS", cgpa: 9.1, backlogs: 0, year: 2027, skills: ["Python", "SQL", "JavaScript", "Git", "React"], scores: [95, 92, 90, 94] },
  { roll: "21MC108", name: "Dev Patel", program: "MCA", branch: "COMPUTER APPLICATIONS", cgpa: 7.0, backlogs: 0, year: 2028, skills: ["JavaScript", "HTML"], scores: [75, 70, 72, 78] },
  { roll: "21MB109", name: "Ananya Gupta", program: "MBA", branch: "SYSTEMS", cgpa: 7.5, backlogs: 0, year: 2027, skills: ["Excel", "SQL", "Communication"], scores: [83, 79, 81, 84] },
  { roll: "21MB110", name: "Rohan Das", program: "MBA", branch: "FINANCE", cgpa: 8.0, backlogs: 0, year: 2027, skills: ["Excel", "Data Analysis"], scores: [86, 83, 85, 82] },
];

const DRIVES = [
  {
    jobRole: "Software Developer",
    skills: ["Python", "SQL", "JavaScript", "Git"],
    minCgpa: 7,
    branches: ["COMPUTER APPLICATIONS"],
    summary: "Entry-level developer building internal tools. Looking for solid Python/JavaScript and SQL fundamentals.",
  },
  {
    jobRole: "Business Analyst",
    skills: ["Excel", "SQL", "Communication", "Data Analysis"],
    minCgpa: 6.5,
    branches: ["SYSTEMS", "MARKETING", "FINANCE"],
    summary: "Analyst role working with business teams to turn data into decisions. Clear communication matters as much as the numbers.",
  },
];

export async function demoStatusAction() {
  await requireTpo();
  const demoUsers = await prisma.user.count({ where: { email: { endsWith: `@${DEMO_DOMAIN}` } } });
  const realStudents = await prisma.student.count({ where: { user: { email: { not: { endsWith: `@${DEMO_DOMAIN}` } } } } });
  return { demoLoaded: demoUsers > 0, realStudents };
}

/** Loads a small MCA/MBA sample (10 students, 1 recruiter, 2 drives, applications). Refuses if real students exist. */
export async function loadDemoDataAction() {
  await requireTpo();
  const status = await demoStatusAction();
  if (status.demoLoaded) throw new Error("Demo data is already loaded.");
  if (status.realStudents > 0) throw new Error("Real students already exist, so demo data is disabled to keep your data clean.");

  // One random password for all demo accounts, shown once to the TPO — never a fixed default.
  const password = `Demo-${randomBytes(5).toString("hex")}`;
  const hash = await bcrypt.hash(password, 10);

  await prisma.$transaction(
    async (tx) => {
      // Specializations so the sample data lines up with the college setup lists.
      for (const s of STUDENTS) {
        await tx.specialization.upsert({
          where: { program_name: { program: s.program, name: s.branch } },
          create: { program: s.program, name: s.branch },
          update: {},
        });
      }

      const studentIds = new Map<string, string>();
      for (const s of STUDENTS) {
        const user = await tx.user.create({
          data: { email: `${s.roll.toLowerCase()}@${DEMO_DOMAIN}`, password: hash, role: "STUDENT", name: s.name },
        });
        const st = await tx.student.create({
          data: {
            userId: user.id,
            rollNo: s.roll,
            program: s.program,
            branch: s.branch,
            cgpa: s.cgpa,
            backlogs: s.backlogs,
            graduationYear: s.year,
            aptitudeScore: s.scores[0],
            reasoningScore: s.scores[1],
            verbalScore: s.scores[2],
            communicationScore: s.scores[3],
            skills: s.skills,
          },
        });
        studentIds.set(s.roll, st.id);
      }

      const recruiterUser = await tx.user.create({
        data: { email: `recruiter@${DEMO_DOMAIN}`, password: hash, role: "RECRUITER", name: "Demo Recruiter" },
      });
      const recruiter = await tx.recruiter.create({
        data: { userId: recruiterUser.id, companyName: "Demo Technologies", industry: "Software" },
      });

      for (const d of DRIVES) {
        const drive = await tx.drive.create({
          data: {
            recruiterId: recruiter.id,
            companyName: "Demo Technologies",
            jobRole: d.jobRole,
            jobDescriptionRaw: `${d.summary} Required skills: ${d.skills.join(", ")}.`,
            jdRequiredSkills: d.skills,
            jdSummary: d.summary,
            minCgpa: d.minCgpa,
            maxBacklogs: 0,
            eligibleBranches: d.branches,
            eligibleGradYears: [2027],
            status: "OPEN",
            interviewStages: ["Technical", "HR"],
          },
        });

        // Applications for rule-eligible students. Fit score here is plain skill overlap (not AI) and says so.
        const rows = STUDENTS.map((s) => {
          const ok = checkEligibility(
            { cgpa: s.cgpa, backlogs: s.backlogs, branch: s.branch, graduationYear: s.year },
            { minCgpa: d.minCgpa, maxBacklogs: 0, eligibleBranches: d.branches, eligibleGradYears: [2027] }
          ).eligible;
          if (!ok) return null;
          const have = new Set(s.skills.map((x) => x.toLowerCase()));
          const matched = d.skills.filter((x) => have.has(x.toLowerCase()));
          const missing = d.skills.filter((x) => !have.has(x.toLowerCase()));
          return { s, matched, missing, fit: Math.round((matched.length / d.skills.length) * 100) };
        })
          .filter((r): r is NonNullable<typeof r> => r !== null)
          .sort((a, b) => b.fit - a.fit || a.s.roll.localeCompare(b.s.roll));

        const stages = ["SELECTED", "INTERVIEW", "SHORTLISTED", "SHORTLISTED", "REJECTED"] as const;
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const stage = stages[i] ?? "ELIGIBLE";
          await tx.application.create({
            data: {
              studentId: studentIds.get(r.s.roll)!,
              driveId: drive.id,
              stage,
              fitScore: r.fit,
              matchedSkills: r.matched,
              missingSkills: r.missing,
              matchExplanation: `Demo data: matches ${r.matched.length} of ${d.skills.length} required skills.`,
              ...(stage === "REJECTED"
                ? { feedbackNote: "Good fundamentals. Build one project that shows the missing skills, then apply again." }
                : {}),
            },
          });
        }
      }
    },
    { timeout: 60_000 }
  );

  revalidatePath("/tpo", "layout");
  return { password };
}

/** Removes everything demo data created (matched by the demo email domain). Real data is never touched. */
export async function removeDemoDataAction() {
  await requireTpo();
  const demoUsers = await prisma.user.findMany({ where: { email: { endsWith: `@${DEMO_DOMAIN}` } }, select: { id: true } });
  const userIds = demoUsers.map((u) => u.id);
  if (userIds.length === 0) return { removed: 0 };

  const students = await prisma.student.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const recruiters = await prisma.recruiter.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const studentIds = students.map((s) => s.id);
  const recruiterIds = recruiters.map((r) => r.id);
  const drives = await prisma.drive.findMany({ where: { recruiterId: { in: recruiterIds } }, select: { id: true } });
  const driveIds = drives.map((d) => d.id);

  await prisma.$transaction(async (tx) => {
    await tx.interview.deleteMany({ where: { OR: [{ driveId: { in: driveIds } }, { application: { studentId: { in: studentIds } } }] } });
    await tx.application.deleteMany({ where: { OR: [{ driveId: { in: driveIds } }, { studentId: { in: studentIds } }] } });
    await tx.notification.deleteMany({ where: { studentId: { in: studentIds } } });
    await tx.recruiterNotification.deleteMany({ where: { recruiterId: { in: recruiterIds } } });
    await tx.resume.deleteMany({ where: { studentId: { in: studentIds } } });
    await tx.student.deleteMany({ where: { id: { in: studentIds } } });
    await tx.drive.deleteMany({ where: { id: { in: driveIds } } });
    await tx.recruiter.deleteMany({ where: { id: { in: recruiterIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });

  revalidatePath("/tpo", "layout");
  return { removed: userIds.length };
}
