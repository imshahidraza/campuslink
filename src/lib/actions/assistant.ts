"use server";

import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { guard } from "@/lib/actionResult";
import { checkRateLimit } from "@/lib/rateLimit";
import { wordEligibilityAnswer, generateMockInterview, type MockInterview } from "@/lib/ai";
import {
  buildFacts,
  detectIntent,
  factsForModel,
  findDrivesMentioned,
  isFaithful,
  summarize,
  type DriveFacts,
  type Intent,
} from "@/lib/assistant";

/* The eligibility assistant and the mock interview. Both are for the signed-in student only and read only
 * that student's own record, so there is no id to tamper with. Both are rate limited, because they can use the AI. */

const MAX_QUESTION = 300;

async function loadContext(userId: string, question: string) {
  const student = await prisma.student.findUniqueOrThrow({ where: { userId } });
  const [drives, applications] = await Promise.all([
    prisma.drive.findMany({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, orderBy: { createdAt: "desc" }, take: 60 }),
    prisma.application.findMany({ where: { studentId: student.id }, select: { driveId: true, stage: true, specialConsideration: true } }),
  ]);
  const appByDrive = new Map(applications.map((a) => [a.driveId, a]));
  const mentioned = findDrivesMentioned(question, drives);
  const intent: Intent = detectIntent(question, mentioned.length);
  const targets = mentioned.length > 0 ? mentioned : drives;
  const now = new Date();
  const facts: DriveFacts[] = targets.map((d) => buildFacts(d, student, appByDrive.get(d.id) ?? null, now));
  return { intent, facts };
}

function cleanQuestion(q: unknown): string {
  if (typeof q !== "string") throw new Error("Please type your question.");
  const t = q.replace(/\s+/g, " ").trim();
  if (t.length < 2) throw new Error("Please type your question.");
  if (t.length > MAX_QUESTION) throw new Error(`Please keep your question under ${MAX_QUESTION} characters.`);
  return t;
}

export interface AssistantReply {
  intent: Intent;
  summary: string;
  facts: DriveFacts[];
}

async function runAsk(question: string): Promise<AssistantReply> {
  const session = await getSession();
  assertRole(session, "STUDENT");
  if (!checkRateLimit(`assistant:${session.userId}`, 20, 60_000).allowed) throw new Error("You are asking very quickly. Please wait a moment.");
  const q = cleanQuestion(question);
  const { intent, facts } = await loadContext(session.userId, q);
  return { intent, summary: summarize(intent, facts), facts: facts.slice(0, 30) };
}

/** The exact answer, from the rules. Fast, and it never depends on the AI. */
export async function askEligibilityAction(question: string) {
  return guard(() => runAsk(question));
}

async function runWord(question: string): Promise<{ friendly: string | null }> {
  const session = await getSession();
  assertRole(session, "STUDENT");
  if (!checkRateLimit(`assistant-ai:${session.userId}`, 8, 60_000).allowed) return { friendly: null };
  const q = cleanQuestion(question);
  const { intent, facts } = await loadContext(session.userId, q);
  if (facts.length === 0) return { friendly: null };
  const factsText = factsForModel(intent, facts);
  const wording = await wordEligibilityAnswer(factsText);
  // If the AI added a number or changed a verdict, throw its wording away and keep the exact answer alone.
  return { friendly: isFaithful(wording, factsText, facts) ? wording : null };
}

/** The same answer in friendlier words from the local AI. Optional: if the AI is off or strays, the exact answer stands. */
export async function wordEligibilityAnswerAction(question: string) {
  const r = await guard(() => runWord(question));
  return r.ok ? r.data : { friendly: null };
}

/* ---------- Mock interview ---------- */

async function runMock(driveId: string): Promise<MockInterview> {
  const session = await getSession();
  assertRole(session, "STUDENT");
  if (typeof driveId !== "string" || driveId.length > 40) throw new Error("Please choose a drive.");
  if (!checkRateLimit(`mock:${session.userId}`, 4, 5 * 60_000).allowed) throw new Error("Please wait a few minutes before making another set of questions.");

  const student = await prisma.student.findUniqueOrThrow({ where: { userId: session.userId } });
  const drive = await prisma.drive.findUnique({ where: { id: driveId } });
  if (!drive) throw new Error("That drive was not found.");
  const [application, match] = await Promise.all([
    prisma.application.findUnique({ where: { studentId_driveId: { studentId: student.id, driveId } }, select: { id: true, missingSkills: true } }),
    prisma.driveMatch.findUnique({ where: { studentId_driveId: { studentId: student.id, driveId } }, select: { missingSkills: true } }),
  ]);
  // A student may practise for drives they can see (open ones) or ones they applied to, and nothing else.
  const visible = drive.status === "OPEN" || drive.status === "IN_PROGRESS" || application !== null;
  if (!visible) throw new Error("That drive is not available.");

  return generateMockInterview({
    jobRole: drive.jobRole,
    companyName: drive.companyName,
    summary: drive.jdSummary ?? "",
    requiredSkills: drive.jdRequiredSkills,
    preferredSkills: drive.jdPreferredSkills,
    jobDescription: drive.jobDescriptionRaw,
    missingSkills: (match?.missingSkills ?? application?.missingSkills ?? []).slice(0, 8),
  });
}

export async function generateMockInterviewAction(driveId: string) {
  return guard(() => runMock(driveId));
}
