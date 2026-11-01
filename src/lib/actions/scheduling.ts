"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { autoAllocate, type AllocationPanel, type ScheduledSlot } from "@/lib/rules";

const inputSchema = z.object({
  driveId: z.string().min(1, "Choose a drive."),
  round: z.string().trim().min(1).max(60).default("Interview"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Choose a start time."),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Choose an end time."),
  durationMins: z.coerce.number().int().min(10, "Interviews must be at least 10 minutes.").max(240),
  gapMins: z.coerce.number().int().min(0).max(60),
  breakStart: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  breakEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  // One panel per line: "Panel A" or "Panel A @ Room 101"
  panels: z.string().trim().min(1, "Add at least one panel."),
});

export type AutoScheduleInput = z.input<typeof inputSchema>;

export interface PlanRow {
  applicationId: string;
  studentName: string;
  rollNo: string;
  panel: string;
  venue: string | null;
  scheduledAt: string; // ISO
  durationMins: number;
}
export interface AutoSchedulePlan {
  rows: PlanRow[];
  unscheduled: { studentName: string; rollNo: string; reason: string }[];
  round: string;
  driveId: string;
}

async function requireTpo() {
  const session = await getSession();
  assertRole(session, "TPO");
}

function parsePanels(raw: string): AllocationPanel[] {
  const seen = new Set<string>();
  const out: AllocationPanel[] = [];
  for (const line of raw.split("\n")) {
    const [namePart, venuePart] = line.split("@");
    const name = namePart?.trim().slice(0, 60);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, venue: venuePart?.trim().slice(0, 60) || null });
  }
  if (out.length === 0) throw new Error("Add at least one panel.");
  if (out.length > 20) throw new Error("Too many panels (max 20).");
  return out;
}

/** Builds the plan (does NOT save anything) — used by both preview and confirm so they always agree. */
async function buildPlan(rawInput: AutoScheduleInput) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid input.");
  const input = parsed.data;

  const start = new Date(`${input.date}T${input.startTime}:00`);
  const end = new Date(`${input.date}T${input.endTime}:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error("Invalid date or time.");
  if (end <= start) throw new Error("End time must be after the start time.");

  let breakStart: Date | null = null;
  let breakEnd: Date | null = null;
  if (input.breakStart && input.breakEnd) {
    breakStart = new Date(`${input.date}T${input.breakStart}:00`);
    breakEnd = new Date(`${input.date}T${input.breakEnd}:00`);
    if (breakEnd <= breakStart) throw new Error("Break end must be after break start.");
  }

  const panels = parsePanels(input.panels);

  const drive = await prisma.drive.findUnique({ where: { id: input.driveId } });
  if (!drive) throw new Error("Drive not found.");

  const shortlisted = await prisma.application.findMany({
    where: { driveId: input.driveId, stage: "SHORTLISTED" },
    include: { student: { include: { user: true } } },
    take: 300,
  });
  // Neutral order (roll number) — nobody gets the best slots because of a score.
  shortlisted.sort((a, b) => a.student.rollNo.localeCompare(b.student.rollNo, undefined, { numeric: true }));

  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(start);
  dayEnd.setHours(23, 59, 59, 999);
  const existingRows = await prisma.interview.findMany({
    where: { scheduledAt: { gte: dayStart, lte: dayEnd } },
    include: { application: true },
  });
  const existing: ScheduledSlot[] = existingRows.map((e) => ({
    id: e.id,
    studentId: e.application.studentId,
    venue: e.venue,
    panel: e.panel,
    scheduledAt: e.scheduledAt,
    durationMins: e.durationMins,
  }));

  const result = autoAllocate(
    shortlisted.map((a) => ({ applicationId: a.id, studentId: a.studentId })),
    existing,
    { start, end, durationMins: input.durationMins, gapMins: input.gapMins, breakStart, breakEnd, panels }
  );

  const byApp = new Map(shortlisted.map((a) => [a.id, a]));
  const rows: PlanRow[] = result.slots
    .map((s) => {
      const a = byApp.get(s.applicationId)!;
      return {
        applicationId: s.applicationId,
        studentName: a.student.user.name,
        rollNo: a.student.rollNo,
        panel: s.panel,
        venue: s.venue,
        scheduledAt: s.scheduledAt.toISOString(),
        durationMins: s.durationMins,
      };
    })
    .sort((x, y) => x.scheduledAt.localeCompare(y.scheduledAt) || x.panel.localeCompare(y.panel));

  const unscheduled = result.unscheduled.map((u) => {
    const a = byApp.get(u.applicationId)!;
    return { studentName: a.student.user.name, rollNo: a.student.rollNo, reason: u.reason };
  });

  return { rows, unscheduled, round: input.round, driveId: input.driveId, driveRole: drive.jobRole, shortlistedCount: shortlisted.length };
}

/** Step 1 — show the TPO the proposed timetable. Saves nothing. */
export async function previewAutoScheduleAction(input: AutoScheduleInput): Promise<AutoSchedulePlan> {
  await requireTpo();
  const plan = await buildPlan(input);
  if (plan.shortlistedCount === 0) {
    throw new Error("This drive has no shortlisted candidates waiting for an interview. Shortlist some first.");
  }
  return { rows: plan.rows, unscheduled: plan.unscheduled, round: plan.round, driveId: plan.driveId };
}

/** Step 2 — the TPO confirmed. We rebuild the plan on the server (never trusting the client's copy), save it and notify students. */
export async function confirmAutoScheduleAction(input: AutoScheduleInput) {
  await requireTpo();
  const plan = await buildPlan(input);
  if (plan.rows.length === 0) throw new Error("Nothing to schedule.");

  await prisma.$transaction(async (tx) => {
    for (const row of plan.rows) {
      const app = await tx.application.findUniqueOrThrow({ where: { id: row.applicationId } });
      // Guard against someone scheduling this candidate between preview and confirm.
      if (app.stage !== "SHORTLISTED") continue;
      const at = new Date(row.scheduledAt);
      await tx.interview.create({
        data: {
          driveId: plan.driveId,
          applicationId: row.applicationId,
          stage: plan.round,
          scheduledAt: at,
          durationMins: row.durationMins,
          venue: row.venue,
          panel: row.panel,
          hasConflict: false,
        },
      });
      await tx.application.update({ where: { id: row.applicationId }, data: { stage: "INTERVIEW" } });
      await tx.notification.create({
        data: {
          studentId: app.studentId,
          type: "INTERVIEW_SCHEDULE",
          title: `Interview scheduled: ${plan.round}`,
          message: `Your ${plan.round} for ${plan.driveRole} is scheduled for ${at.toLocaleString()}${row.venue ? ` at ${row.venue}` : ""} (${row.panel}).`,
        },
      });
    }
  });

  revalidatePath("/tpo/scheduling");
  revalidatePath(`/tpo/drives/${plan.driveId}`);
  revalidatePath("/student/journey");
  return { scheduled: plan.rows.length, unscheduled: plan.unscheduled.length };
}
