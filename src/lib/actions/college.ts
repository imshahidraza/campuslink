"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { splitRow, detectHeaderMapping } from "@/lib/csvParse";
import { Prisma } from "@prisma/client";

async function requireTpo() {
  const session = await getSession();
  assertRole(session, "TPO");
  return session;
}

/**
 * Programs are free text (not a locked list) — a TPO can type anything
 * ("B.Tech", "Bachelor of Technology", "Diploma in..."). To stop "B.Tech"
 * and "b.tech" from becoming two different programs, we check what's
 * already in the catalog case-insensitively and reuse that exact spelling;
 * the first time a program is typed, its casing becomes the canonical one.
 */
async function canonicalizeProgram(typed: string): Promise<string> {
  const trimmed = typed.trim();
  const existing = await prisma.specialization.findFirst({
    where: { program: { equals: trimmed, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
  });
  return existing?.program ?? trimmed;
}

export async function addSpecializationAction(formData: FormData) {
  await requireTpo();

  const programInput = String(formData.get("program") || "").trim();
  const nameRaw = String(formData.get("name") || "").trim();

  if (!programInput) throw new Error("Program can't be empty.");
  if (!nameRaw) throw new Error("Specialization name can't be empty.");

  const program = await canonicalizeProgram(programInput);
  const name = nameRaw.toUpperCase();

  const specialization = await prisma.specialization.upsert({
    where: { program_name: { program, name } },
    update: {},
    create: { program, name },
  });

  revalidatePath("/tpo/college-setup");
  revalidatePath("/tpo");
  revalidatePath("/student/profile");
  return specialization;
}

export async function deleteSpecializationAction(id: string) {
  await requireTpo();
  // deleteMany (not delete) so a missing/stale id is a silent no-op instead of a crash.
  await prisma.specialization.deleteMany({ where: { id } });
  revalidatePath("/tpo/college-setup");
  revalidatePath("/tpo");
  revalidatePath("/student/profile");
}

/** Lists every distinct program currently in the catalog, for the "known programs" datalist. */
export async function listKnownPrograms(): Promise<string[]> {
  const rows = await prisma.specialization.findMany({
    select: { program: true },
    distinct: ["program"],
    orderBy: { program: "asc" },
  });
  return rows.map((r) => r.program);
}

type RosterField = "rollNo" | "name" | "program" | "branch" | "cgpa" | "backlogs" | "graduationYear";

const ROSTER_SYNONYMS: Record<RosterField, string[]> = {
  rollNo: ["roll no", "rollno", "roll number", "registration no", "reg no", "regno", "id", "student id"],
  name: ["name", "student name", "full name"],
  program: ["program", "degree", "course"],
  branch: ["branch", "specialization", "specialisation", "department", "dept", "stream", "major"],
  cgpa: ["cgpa", "gpa", "cpi"],
  backlogs: ["backlogs", "backlog", "arrears", "ats", "active backlogs"],
  graduationYear: ["graduation year", "grad year", "year of passing", "passing year", "year", "batch"],
};

const DEFAULT_ROSTER_ORDER: RosterField[] = [
  "rollNo",
  "name",
  "program",
  "branch",
  "cgpa",
  "backlogs",
  "graduationYear",
];

export async function addStudentRosterAction(rawText: string) {
  await requireTpo();

  const rawLines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return { added: 0, errors: [] };

  // Try to read the first row as a header. If every required field is found
  // (in any order, any naming from the synonym list), skip it as a header
  // row and use its column positions. Otherwise assume there's no header
  // and fall back to the fixed RollNo, Name, Program, Specialization, CGPA,
  // Backlogs, GradYear order — so plain typed/pasted rows still work exactly
  // as before.
  const headerMapping = detectHeaderMapping(splitRow(rawLines[0]), ROSTER_SYNONYMS);
  const mapping: Record<RosterField, number> =
    headerMapping ?? (Object.fromEntries(DEFAULT_ROSTER_ORDER.map((f, i) => [f, i])) as Record<RosterField, number>);
  const dataLines = headerMapping ? rawLines.slice(1) : rawLines;

  const added: string[] = [];
  const errors: string[] = [];

  for (const [i, line] of dataLines.entries()) {
    const cells = splitRow(line);
    const rowLabel = `Row ${i + 1}`;

    const rollNo = cells[mapping.rollNo]?.trim();
    const name = cells[mapping.name]?.trim();
    const programInput = cells[mapping.program]?.trim();
    const branchRaw = cells[mapping.branch]?.trim();
    const cgpaRaw = cells[mapping.cgpa]?.trim();
    const backlogsRaw = cells[mapping.backlogs]?.trim();
    const gradYearRaw = cells[mapping.graduationYear]?.trim();

    if (!rollNo || !name || !programInput || !branchRaw || !cgpaRaw || !backlogsRaw || !gradYearRaw) {
      errors.push(
        `${rowLabel}: missing a value (need Roll No, Name, Program, Specialization, CGPA, Backlogs, Graduation Year).`
      );
      continue;
    }
    const cgpa = Number(cgpaRaw);
    const backlogs = Number(backlogsRaw);
    const graduationYear = Number(gradYearRaw);
    if (Number.isNaN(cgpa) || cgpa < 0 || cgpa > 10) {
      errors.push(`${rowLabel}: CGPA "${cgpaRaw}" must be a number between 0 and 10.`);
      continue;
    }
    if (Number.isNaN(backlogs) || backlogs < 0) {
      errors.push(`${rowLabel}: Backlogs "${backlogsRaw}" must be a non-negative number.`);
      continue;
    }
    if (Number.isNaN(graduationYear)) {
      errors.push(`${rowLabel}: Graduation year "${gradYearRaw}" isn't a valid year.`);
      continue;
    }

    const branch = branchRaw.toUpperCase();
    const program = await canonicalizeProgram(programInput);

    const existingStudent = await prisma.student.findUnique({ where: { rollNo } });
    const existingPending = await prisma.pendingStudent.findUnique({ where: { rollNo } });
    if (existingStudent || existingPending) {
      errors.push(
        `${rowLabel}: Student with this Roll No. already exists` +
          (existingStudent ? " (already registered)." : " (already on the pending roster).")
      );
      continue;
    }

    await prisma.specialization.upsert({
      where: { program_name: { program, name: branch } },
      update: {},
      create: { program, name: branch },
    });

    try {
      await prisma.pendingStudent.create({
        data: { rollNo, name, program, branch, cgpa, backlogs, graduationYear },
      });
      added.push(rollNo);
    } catch (err) {
      // Closes the gap between the check above and this insert — two rosters
      // importing the same roll number at the same moment would otherwise
      // crash instead of showing a clean message. rollNo is @unique in the
      // schema, so this is the database enforcing it, not just app logic.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        errors.push(`${rowLabel}: Student with this Roll No. already exists.`);
      } else {
        throw err;
      }
    }
  }

  revalidatePath("/tpo/students");
  revalidatePath("/tpo/college-setup");
  return { added: added.length, errors };
}

export async function deletePendingStudentAction(id: string) {
  await requireTpo();
  await prisma.pendingStudent.delete({ where: { id } });
  revalidatePath("/tpo/students");
}

/* ---------- Assessment scores (aptitude / reasoning / verbal / communication) ---------- */

type ScoreField = "rollNo" | "aptitude" | "reasoning" | "verbal" | "communication";

const SCORE_SYNONYMS: Record<ScoreField, string[]> = {
  rollNo: ["roll no", "rollno", "roll number", "registration no", "reg no", "regno", "id", "student id"],
  aptitude: ["aptitude", "aptitude score", "quant", "quantitative"],
  reasoning: ["reasoning", "reasoning score", "logical reasoning"],
  verbal: ["verbal", "verbal score", "english"],
  communication: ["communication", "communication score", "comm"],
};

const DEFAULT_SCORE_ORDER: ScoreField[] = ["rollNo", "aptitude", "reasoning", "verbal", "communication"];

export async function addAssessmentScoresAction(rawText: string) {
  await requireTpo();

  const rawLines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return { updated: 0, errors: [] };

  const headerMapping = detectHeaderMapping(splitRow(rawLines[0]), SCORE_SYNONYMS);
  const mapping: Record<ScoreField, number> =
    headerMapping ?? (Object.fromEntries(DEFAULT_SCORE_ORDER.map((f, i) => [f, i])) as Record<ScoreField, number>);
  const dataLines = headerMapping ? rawLines.slice(1) : rawLines;

  const updated: string[] = [];
  const errors: string[] = [];

  function parseScore(raw: string | undefined): number | null {
    if (!raw || !raw.trim()) return null;
    const n = Number(raw.trim());
    return Number.isNaN(n) ? NaN : n;
  }

  for (const [i, line] of dataLines.entries()) {
    const cells = splitRow(line);
    const rowLabel = `Row ${i + 1}`;
    const rollNo = cells[mapping.rollNo]?.trim();

    if (!rollNo) {
      errors.push(`${rowLabel}: missing roll number.`);
      continue;
    }

    const student = await prisma.student.findUnique({ where: { rollNo } });
    if (!student) {
      errors.push(`${rowLabel}: no registered student with roll number "${rollNo}" (they may still be on the pending roster — scores can only be set after signup).`);
      continue;
    }

    const aptitude = parseScore(cells[mapping.aptitude]);
    const reasoning = parseScore(cells[mapping.reasoning]);
    const verbal = parseScore(cells[mapping.verbal]);
    const communication = parseScore(cells[mapping.communication]);

    if ([aptitude, reasoning, verbal, communication].some((v) => Number.isNaN(v))) {
      errors.push(`${rowLabel}: one of the scores for "${rollNo}" isn't a valid number.`);
      continue;
    }

    await prisma.student.update({
      where: { id: student.id },
      data: {
        aptitudeScore: aptitude ?? student.aptitudeScore,
        reasoningScore: reasoning ?? student.reasoningScore,
        verbalScore: verbal ?? student.verbalScore,
        communicationScore: communication ?? student.communicationScore,
      },
    });
    updated.push(rollNo);
  }

  revalidatePath("/tpo/students");
  revalidatePath("/tpo/students/scores");
  return { updated: updated.length, errors };
}
