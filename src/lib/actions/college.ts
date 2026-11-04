"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { splitRow, detectHeaderMapping, detectHeaderMappingWithOptional } from "@/lib/csvParse";
import { normalizeRollNo, tidyName } from "@/lib/normalize";
import { Prisma } from "@prisma/client";
import { z } from "zod";

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
type RosterScoreField = "aptitude" | "reasoning" | "verbal" | "communication";

const ROSTER_SYNONYMS: Record<RosterField, string[]> = {
  rollNo: ["roll no", "rollno", "roll number", "registration no", "reg no", "regno", "id", "student id"],
  name: ["name", "student name", "full name"],
  program: ["program", "degree", "course"],
  branch: ["branch", "specialization", "specialisation", "department", "dept", "stream", "major"],
  cgpa: ["cgpa", "gpa", "cpi"],
  backlogs: ["backlogs", "backlog", "arrears", "ats", "active backlogs"],
  graduationYear: ["graduation year", "grad year", "year of passing", "passing year", "year", "batch"],
};

// Assessment scores can come in the same file as the roster. They are optional.
const SCORE_COLUMN_SYNONYMS: Record<RosterScoreField, string[]> = {
  aptitude: ["aptitude", "aptitude score", "quant", "quantitative"],
  reasoning: ["reasoning", "reasoning score", "logical reasoning"],
  verbal: ["verbal", "verbal score", "english"],
  communication: ["communication", "communication score", "comm"],
};

const DEFAULT_ROSTER_ORDER: (RosterField | RosterScoreField)[] = [
  "rollNo",
  "name",
  "program",
  "branch",
  "cgpa",
  "backlogs",
  "graduationYear",
  "aptitude",
  "reasoning",
  "verbal",
  "communication",
];

/** Blank means "no score". Anything else must be a number from 0 to 100. */
function parseScoreCell(raw: string | undefined): number | null | typeof Number.NaN {
  if (raw === undefined || !raw.trim()) return null;
  const n = Number(raw.trim());
  if (Number.isNaN(n) || n < 0 || n > 100) return Number.NaN;
  return Math.round(n);
}

export async function addStudentRosterAction(rawText: string) {
  await requireTpo();

  const rawLines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return { added: 0, errors: [] as string[] };
  if (rawLines.length > 2000) return { added: 0, errors: ["Please import at most 2000 students at a time."] };

  // Try to read the first row as a header. If every required field is found (any order, any naming from the
  // synonym list), skip it as a header row and use its column positions. The four score columns are optional.
  // Otherwise assume there's no header and use the fixed order: Roll No, Name, Program, Specialization,
  // CGPA, Backlogs, Graduation Year, then optionally Aptitude, Reasoning, Verbal, Communication.
  const headerMapping = detectHeaderMappingWithOptional(splitRow(rawLines[0]), ROSTER_SYNONYMS, SCORE_COLUMN_SYNONYMS);
  const mapping = (headerMapping ??
    Object.fromEntries(DEFAULT_ROSTER_ORDER.map((f, i) => [f, i]))) as Record<RosterField, number> &
    Partial<Record<RosterScoreField, number>>;
  const dataLines = headerMapping ? rawLines.slice(1) : rawLines;

  const added: string[] = [];
  const errors: string[] = [];

  for (const [i, line] of dataLines.entries()) {
    const cells = splitRow(line);
    const rowLabel = `Row ${i + 1}`;

    const rollNoRaw = cells[mapping.rollNo]?.trim();
    const nameRaw = cells[mapping.name]?.trim();
    const programInput = cells[mapping.program]?.trim();
    const branchRaw = cells[mapping.branch]?.trim();
    const cgpaRaw = cells[mapping.cgpa]?.trim();
    const backlogsRaw = cells[mapping.backlogs]?.trim();
    const gradYearRaw = cells[mapping.graduationYear]?.trim();

    if (!rollNoRaw || !nameRaw || !programInput || !branchRaw || !cgpaRaw || !backlogsRaw || !gradYearRaw) {
      errors.push(
        `${rowLabel}: missing a value (need Roll No, Name, Program, Specialization, CGPA, Backlogs, Graduation Year).`
      );
      continue;
    }
    const rollNo = normalizeRollNo(rollNoRaw);
    const name = tidyName(nameRaw);
    const cgpa = Number(cgpaRaw);
    const backlogs = Number(backlogsRaw);
    const graduationYear = Number(gradYearRaw);
    if (Number.isNaN(cgpa) || cgpa < 0 || cgpa > 10) {
      errors.push(`${rowLabel} (${rollNo}): CGPA "${cgpaRaw}" must be a number between 0 and 10.`);
      continue;
    }
    if (!Number.isInteger(backlogs) || backlogs < 0) {
      errors.push(`${rowLabel} (${rollNo}): Backlogs "${backlogsRaw}" must be a whole number, 0 or more.`);
      continue;
    }
    if (!Number.isInteger(graduationYear) || graduationYear < 1990 || graduationYear > 2100) {
      errors.push(`${rowLabel} (${rollNo}): Graduation year "${gradYearRaw}" isn't a valid year.`);
      continue;
    }

    const scores = {
      aptitudeScore: parseScoreCell(mapping.aptitude !== undefined ? cells[mapping.aptitude] : undefined),
      reasoningScore: parseScoreCell(mapping.reasoning !== undefined ? cells[mapping.reasoning] : undefined),
      verbalScore: parseScoreCell(mapping.verbal !== undefined ? cells[mapping.verbal] : undefined),
      communicationScore: parseScoreCell(mapping.communication !== undefined ? cells[mapping.communication] : undefined),
    };
    if (Object.values(scores).some((v) => Number.isNaN(v))) {
      errors.push(`${rowLabel} (${rollNo}): each score must be a number from 0 to 100, or left blank.`);
      continue;
    }

    const branch = branchRaw.toUpperCase();
    const program = await canonicalizeProgram(programInput);

    const existingStudent = await prisma.student.findUnique({ where: { rollNo } });
    const existingPending = await prisma.pendingStudent.findUnique({ where: { rollNo } });
    if (existingStudent || existingPending) {
      errors.push(
        `${rowLabel} (${rollNo}): this roll number already exists` +
          (existingStudent ? " (already registered)." : " (already on the pending list). Use Edit to change it.")
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
        data: { rollNo, name, program, branch, cgpa, backlogs, graduationYear, ...(scores as Record<string, number | null>) },
      });
      added.push(rollNo);
    } catch (err) {
      // Closes the gap between the check above and this insert (two imports of the same roll number at the
      // same moment). rollNo is @unique in the schema, so this is the database enforcing it.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        errors.push(`${rowLabel} (${rollNo}): this roll number already exists.`);
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
  if (rawLines.length === 0) return { updated: 0, errors: [] as string[] };
  if (rawLines.length > 2000) return { updated: 0, errors: ["Please import at most 2000 rows at a time."] };

  const headerMapping = detectHeaderMapping(splitRow(rawLines[0]), SCORE_SYNONYMS);
  const mapping: Record<ScoreField, number> =
    headerMapping ?? (Object.fromEntries(DEFAULT_SCORE_ORDER.map((f, i) => [f, i])) as Record<ScoreField, number>);
  const dataLines = headerMapping ? rawLines.slice(1) : rawLines;

  const updated: string[] = [];
  const errors: string[] = [];

  for (const [i, line] of dataLines.entries()) {
    const cells = splitRow(line);
    const rowLabel = `Row ${i + 1}`;
    const rollNoRaw = cells[mapping.rollNo]?.trim();

    if (!rollNoRaw) {
      errors.push(`${rowLabel}: missing roll number.`);
      continue;
    }
    const rollNo = normalizeRollNo(rollNoRaw);

    const aptitude = parseScoreCell(cells[mapping.aptitude]);
    const reasoning = parseScoreCell(cells[mapping.reasoning]);
    const verbal = parseScoreCell(cells[mapping.verbal]);
    const communication = parseScoreCell(cells[mapping.communication]);
    if ([aptitude, reasoning, verbal, communication].some((v) => Number.isNaN(v))) {
      errors.push(`${rowLabel} (${rollNo}): each score must be a number from 0 to 100, or left blank.`);
      continue;
    }

    // Scores can be set for a registered student or for someone still on the pending list.
    const student = await prisma.student.findUnique({ where: { rollNo } });
    const pending = student ? null : await prisma.pendingStudent.findUnique({ where: { rollNo } });
    const current = student ?? pending;
    if (!current) {
      errors.push(`${rowLabel}: roll number "${rollNo}" is not in your students list. Add the student first.`);
      continue;
    }

    const data = {
      aptitudeScore: aptitude ?? current.aptitudeScore,
      reasoningScore: reasoning ?? current.reasoningScore,
      verbalScore: verbal ?? current.verbalScore,
      communicationScore: communication ?? current.communicationScore,
    };
    if (student) await prisma.student.update({ where: { id: student.id }, data });
    else if (pending) await prisma.pendingStudent.update({ where: { id: pending.id }, data });
    updated.push(rollNo);
  }

  revalidatePath("/tpo/students");
  revalidatePath("/tpo/students/scores");
  return { updated: updated.length, errors };
}

/* ---------- Editing imported students ---------- */

const editSchema = z.object({
  name: z.string().trim().min(2, "Please enter the student's name.").max(100),
  program: z.string().trim().min(1, "Please enter the program.").max(100),
  branch: z.string().trim().min(1, "Please enter the specialization.").max(100),
  cgpa: z.coerce.number().min(0, "CGPA must be between 0 and 10.").max(10, "CGPA must be between 0 and 10."),
  backlogs: z.coerce.number().int("Backlogs must be a whole number.").min(0, "Backlogs can't be negative."),
  graduationYear: z.coerce.number().int().min(1990, "Enter a valid graduation year.").max(2100, "Enter a valid graduation year."),
});

function scoreField(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0 || n > 100) throw new Error("Scores must be numbers from 0 to 100, or left blank.");
  return Math.round(n);
}

async function readEdit(formData: FormData) {
  const parsed = editSchema.safeParse({
    name: formData.get("name"),
    program: formData.get("program"),
    branch: formData.get("branch"),
    cgpa: formData.get("cgpa"),
    backlogs: formData.get("backlogs"),
    graduationYear: formData.get("graduationYear"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Please check the values.");
  const program = await canonicalizeProgram(parsed.data.program);
  const branch = parsed.data.branch.toUpperCase();
  await prisma.specialization.upsert({
    where: { program_name: { program, name: branch } },
    update: {},
    create: { program, name: branch },
  });
  return {
    name: tidyName(parsed.data.name),
    program,
    branch,
    cgpa: parsed.data.cgpa,
    backlogs: parsed.data.backlogs,
    graduationYear: parsed.data.graduationYear,
    aptitudeScore: scoreField(formData, "aptitudeScore"),
    reasoningScore: scoreField(formData, "reasoningScore"),
    verbalScore: scoreField(formData, "verbalScore"),
    communicationScore: scoreField(formData, "communicationScore"),
  };
}

/** Fix a typo (or add scores) for someone who has not signed up yet. The roll number can be corrected too. */
export async function updatePendingStudentAction(id: string, formData: FormData) {
  await requireTpo();
  const data = await readEdit(formData);
  const rollNo = normalizeRollNo(String(formData.get("rollNo") ?? ""));
  if (!rollNo) throw new Error("Please enter the roll number.");

  const clash =
    (await prisma.student.findUnique({ where: { rollNo } })) ??
    (await prisma.pendingStudent.findFirst({ where: { rollNo, id: { not: id } } }));
  if (clash) throw new Error(`Roll number ${rollNo} already belongs to another student.`);

  await prisma.pendingStudent.update({ where: { id }, data: { rollNo, ...data } });
  revalidatePath("/tpo/students");
}

/**
 * Edit a registered student's official record. Roll number stays fixed because it is their sign-in.
 * Their own profile fields (skills, projects, resume) are not touched.
 */
export async function updateRegisteredStudentAction(studentId: string, formData: FormData) {
  await requireTpo();
  const { name, ...rest } = await readEdit(formData);
  const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: { userId: true } });
  await prisma.$transaction([
    prisma.student.update({ where: { id: studentId }, data: rest }),
    prisma.user.update({ where: { id: student.userId }, data: { name } }),
  ]);
  revalidatePath("/tpo/students");
  revalidatePath("/student", "layout");
}

/** Where students email their documents after accepting an offer. Empty clears it (the TPO account email is used instead). */
export async function saveTpoEmailAction(formData: FormData) {
  await requireTpo();
  const raw = String(formData.get("tpoEmail") ?? "").trim().toLowerCase();
  if (raw && !z.string().email().safeParse(raw).success) throw new Error("Please enter a valid email address.");
  const college = await prisma.college.findFirst({ orderBy: { createdAt: "asc" } });
  if (!college) throw new Error("College details are missing. Please register the placement cell first.");
  await prisma.college.update({ where: { id: college.id }, data: { tpoEmail: raw || null } });
  revalidatePath("/tpo/college-setup");
  revalidatePath("/student/journey");
  revalidatePath("/tpo/offers");
}
