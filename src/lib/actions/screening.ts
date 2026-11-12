"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { assertCanManageDrive } from "@/lib/access";
import { guard } from "@/lib/actionResult";
import { checkRateLimit } from "@/lib/rateLimit";
import { draftScreeningQuestions, commentOnWrittenAnswers } from "@/lib/ai";
import {
  checkPublishable,
  cleanAnswers,
  cleanQuestionEdit,
  MAX_MCQ,
  MIN_MINUTES,
  MAX_MINUTES,
  type DraftQuestion,
  type QuestionKindName,
} from "@/lib/screening";
import { settleApplication, settleDrive } from "@/lib/screeningAttempt";
import type { Prisma } from "@prisma/client";

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
      status: true,
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

  // Students who already applied are told to take it. Students who apply later see it on the drive card.
  const applicants = await prisma.application.findMany({
    where: { driveId: drive.id, stage: { in: ["ELIGIBLE", "SHORTLISTED", "INTERVIEW"] } },
    select: { studentId: true },
    take: 1000,
  });
  if (applicants.length > 0) {
    await prisma.notification.createMany({
      data: applicants.map((a) => ({
        studentId: a.studentId,
        type: "GENERAL" as const,
        title: `Screening interview for ${drive.jobRole} at ${drive.companyName}`,
        message: "Please take the short text interview from Drives & Matching. The recruiter can shortlist you only after you finish it.",
      })),
    });
  }
  refresh(drive.id);
  revalidatePath("/student/notifications");
  revalidatePath("/student/drives");
}

export async function draftScreeningAction(driveId: string) {
  return guard(() => runDraft(driveId));
}

export async function publishScreeningAction(driveId: string) {
  return guard(() => runPublish(driveId));
}

/* ---------- Editing the draft, settings ---------- */

/** Edits one question of a draft. Published questions can't be edited. */
async function runUpdateQuestion(driveId: string, questionId: unknown, kind: unknown, input: unknown) {
  const { drive } = await loadOwnDrive(driveId);
  if (drive.screeningStatus === "PUBLISHED") throw new Error("Published questions can't be changed.");
  if (typeof questionId !== "string" || (kind !== "MCQ" && kind !== "SHORT")) throw new Error("Question not found.");
  const checked = cleanQuestionEdit(kind as QuestionKindName, (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>);
  if (!checked.ok) throw new Error(checked.message);
  const q = checked.question;
  // The kind and the drive are part of the match, so a question of another drive or kind can't be touched.
  const changed = await prisma.screeningQuestion.updateMany({
    where: { id: questionId, driveId: drive.id, kind: q.kind, drive: { screeningStatus: { not: "PUBLISHED" } } },
    data: { prompt: q.prompt, options: q.options, correctIndex: q.correctIndex, lookFor: q.lookFor },
  });
  if (changed.count === 0) throw new Error("Question not found, or it was published in the meantime.");
  refresh(drive.id);
}

async function runRemoveQuestion(driveId: string, questionId: unknown) {
  const { drive } = await loadOwnDrive(driveId);
  if (drive.screeningStatus === "PUBLISHED") throw new Error("Published questions can't be removed.");
  if (typeof questionId !== "string") throw new Error("Question not found.");
  const gone = await prisma.screeningQuestion.deleteMany({
    where: { id: questionId, driveId: drive.id, drive: { screeningStatus: { not: "PUBLISHED" } } },
  });
  if (gone.count === 0) throw new Error("Question not found, or it was published in the meantime.");
  refresh(drive.id);
}

/**
 * The time limit can be set until the questions are published. The minimum score is the recruiter's own filter
 * and can be changed any time: it only sorts the results, it never removes anyone.
 */
async function runSaveSettings(driveId: string, input: unknown) {
  const { drive } = await loadOwnDrive(driveId);
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const data: Prisma.DriveUpdateInput = {};

  if (raw.minutes !== undefined && raw.minutes !== "") {
    if (drive.screeningStatus === "PUBLISHED") throw new Error("The time limit can't be changed after publishing.");
    const m = Number(raw.minutes);
    if (!Number.isInteger(m) || m < MIN_MINUTES || m > MAX_MINUTES) throw new Error(`The time limit must be a whole number from ${MIN_MINUTES} to ${MAX_MINUTES} minutes.`);
    data.screeningMinutes = m;
  }

  if (raw.minScore !== undefined) {
    if (raw.minScore === "" || raw.minScore === null) {
      data.screeningMinScore = null;
    } else {
      const n = Number(raw.minScore);
      const mcqCount = await prisma.screeningQuestion.count({ where: { driveId: drive.id, kind: "MCQ" } });
      const top = mcqCount > 0 ? mcqCount : MAX_MCQ;
      if (!Number.isInteger(n) || n < 0 || n > top) throw new Error(`The minimum score must be a whole number from 0 to ${top}.`);
      data.screeningMinScore = n === 0 ? null : n;
    }
  }
  if (Object.keys(data).length === 0) return;
  await prisma.drive.update({ where: { id: drive.id }, data });
  refresh(drive.id);
}

export async function updateScreeningQuestionAction(driveId: string, questionId: string, kind: string, input: unknown) {
  return guard(() => runUpdateQuestion(driveId, questionId, kind, input));
}
export async function removeScreeningQuestionAction(driveId: string, questionId: string) {
  return guard(() => runRemoveQuestion(driveId, questionId));
}
export async function saveScreeningSettingsAction(driveId: string, input: unknown) {
  return guard(() => runSaveSettings(driveId, input));
}

/* ---------- Reading a student's answers, AI comments ---------- */

async function loadOwnApplication(applicationId: unknown) {
  const session = await getSession();
  assertRole(session, "RECRUITER");
  if (typeof applicationId !== "string" || !applicationId) throw new Error("Application not found.");
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      stage: true,
      drive: { select: { id: true, recruiterId: true, jobRole: true, screeningStatus: true } },
    },
  });
  if (!application) throw new Error("Application not found.");
  await assertCanManageDrive(session, application.drive.recruiterId); // a recruiter can only open their own drive's students
  return { session, application };
}

interface FeedbackItem {
  questionId: string;
  comment: string;
}

function readFeedback(v: unknown): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of Array.isArray(v) ? v : []) {
    if (typeof x === "object" && x !== null && typeof (x as FeedbackItem).questionId === "string" && typeof (x as FeedbackItem).comment === "string") {
      m.set((x as FeedbackItem).questionId, (x as FeedbackItem).comment);
    }
  }
  return m;
}

export interface ScreeningDetail {
  submittedAt: string;
  autoSubmitted: boolean;
  correct: number;
  total: number;
  hasComments: boolean;
  questions: {
    id: string;
    kind: QuestionKindName;
    prompt: string;
    options: string[];
    correctIndex: number | null;
    lookFor: string | null;
    answer: number | string | null;
    right: boolean | null;
    comment: string | null;
  }[];
}

async function runDetail(applicationId: unknown): Promise<ScreeningDetail> {
  const { application } = await loadOwnApplication(applicationId);
  await settleApplication(application.id);
  const attempt = await prisma.screeningAttempt.findUnique({ where: { applicationId: application.id } });
  if (!attempt?.submittedAt) throw new Error("This student has not finished the interview yet.");
  const questions = await prisma.screeningQuestion.findMany({ where: { driveId: application.drive.id }, orderBy: { position: "asc" } });
  const answers = cleanAnswers(attempt.answers, questions);
  const comments = readFeedback(attempt.feedback);
  return {
    submittedAt: attempt.submittedAt.toISOString(),
    autoSubmitted: attempt.autoSubmitted,
    correct: attempt.mcqCorrect ?? 0,
    total: attempt.mcqTotal ?? 0,
    hasComments: attempt.feedbackAt !== null,
    questions: questions.map((q) => ({
      id: q.id,
      kind: q.kind,
      prompt: q.prompt,
      options: q.options,
      correctIndex: q.correctIndex,
      lookFor: q.lookFor,
      answer: answers[q.id] ?? null,
      right: q.kind === "MCQ" ? answers[q.id] === q.correctIndex : null,
      comment: comments.get(q.id) ?? null,
    })),
  };
}

/** Writes the AI's comments on one student's written answers. Advice for the recruiter only. */
async function writeComments(applicationId: string, jobRole: string) {
  const attempt = await prisma.screeningAttempt.findUnique({
    where: { applicationId },
    select: { id: true, submittedAt: true, answers: true, application: { select: { drive: { select: { screeningQuestions: { orderBy: { position: "asc" } } } } } } },
  });
  if (!attempt?.submittedAt) throw new Error("This student has not finished the interview yet.");
  const questions = attempt.application.drive.screeningQuestions;
  const answers = cleanAnswers(attempt.answers, questions);
  const shorts = questions.filter((q) => q.kind === "SHORT");

  const feedback: FeedbackItem[] = [];
  const toAsk: { n: number; id: string; question: string; lookFor: string | null; answer: string }[] = [];
  shorts.forEach((q) => {
    const a = answers[q.id];
    if (typeof a === "string" && a.length > 0) toAsk.push({ n: toAsk.length + 1, id: q.id, question: q.prompt, lookFor: q.lookFor, answer: a });
    else feedback.push({ questionId: q.id, comment: "No answer was given." });
  });
  if (toAsk.length > 0) {
    const comments = await commentOnWrittenAnswers({ jobRole, items: toAsk.map((t) => ({ n: t.n, question: t.question, lookFor: t.lookFor, answer: t.answer })) });
    // If the AI wrote nothing at all, nothing is saved, so the recruiter can simply try again later.
    if (comments.size === 0) throw new Error("The AI could not write comments just now. Please try again in a minute.");
    for (const t of toAsk) feedback.push({ questionId: t.id, comment: comments.get(t.n) ?? "The AI did not write a comment for this answer. Please read it yourself." });
  }
  await prisma.screeningAttempt.update({ where: { id: attempt.id }, data: { feedback: feedback as unknown as Prisma.InputJsonValue, feedbackAt: new Date() } });
}

async function runComments(applicationId: unknown) {
  const { session, application } = await loadOwnApplication(applicationId);
  if (!checkRateLimit(`screening-comments:${session.userId}`, 20, 10 * 60_000).allowed) throw new Error("Please wait a few minutes before asking for more comments.");
  await settleApplication(application.id);
  await writeComments(application.id, application.drive.jobRole);
  refresh(application.drive.id);
}

/** AI comments for everyone who finished and has none yet, ten at a time, so one click never holds the AI for long. */
async function runCommentsForDrive(driveId: unknown) {
  const { session, drive } = await loadOwnDrive(driveId as string);
  if (!checkRateLimit(`screening-comments-all:${session.userId}`, 6, 10 * 60_000).allowed) throw new Error("Please wait a few minutes before running this again.");
  await settleDrive(drive.id);
  const pending = await prisma.screeningAttempt.findMany({
    where: { application: { driveId: drive.id }, submittedAt: { not: null }, feedbackAt: null },
    select: { applicationId: true },
    orderBy: { submittedAt: "asc" },
    take: 11,
  });
  const batch = pending.slice(0, 10);
  let done = 0;
  for (const p of batch) {
    await writeComments(p.applicationId, drive.jobRole); // an AI problem stops the run with a clear message; what is done stays done
    done++;
  }
  refresh(drive.id);
  return { done, more: pending.length > 10 };
}

export async function loadScreeningDetailAction(applicationId: string) {
  return guard(() => runDetail(applicationId));
}
export async function generateScreeningCommentsAction(applicationId: string) {
  return guard(() => runComments(applicationId));
}
export async function generateScreeningCommentsForDriveAction(driveId: string) {
  return guard(() => runCommentsForDrive(driveId));
}
