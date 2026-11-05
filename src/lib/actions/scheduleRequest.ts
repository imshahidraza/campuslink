"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { requireApprovedRecruiter } from "@/lib/access";
import { normalizeSlotName } from "@/lib/normalize";
import { DATE_RE, TIME_RE, toMinutes, parsePanelLines, panelsToText } from "@/lib/schedule";
import { fmtDay } from "@/lib/format";

/**
 * The recruiter and the placement cell agree on the interview days, time window, venue and panels once
 * for each drive. After that the recruiter books each student's time inside that window.
 *
 *   recruiter asks (WAITING_TPO) -> TPO confirms (CONFIRMED)
 *                                -> or TPO suggests other dates (WAITING_RECRUITER) -> recruiter accepts (CONFIRMED)
 *                                                                                   -> or asks again (WAITING_TPO)
 * After it is confirmed, either side can ask for a change. The old window stays in force until the new
 * one is confirmed, so nothing moves silently.
 */

function readDates(formData: FormData): string[] {
  const raw = [...formData.getAll("dates"), formData.get("date1"), formData.get("date2"), formData.get("date3")]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
  const unique = Array.from(new Set(raw));
  if (unique.length === 0) throw new Error("Choose at least one date.");
  if (unique.length > 3) throw new Error("Choose at most three dates.");
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  for (const d of unique) {
    if (!DATE_RE.test(d) || Number.isNaN(new Date(`${d}T00:00:00`).getTime())) throw new Error("One of the dates is not valid.");
    if (d < todayStr) throw new Error("Dates can't be in the past.");
  }
  return unique.sort();
}

function readWindow(formData: FormData) {
  const startTime = String(formData.get("startTime") || "");
  const endTime = String(formData.get("endTime") || "");
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) throw new Error("Choose a start and end time.");
  if (toMinutes(endTime) <= toMinutes(startTime)) throw new Error("The end time must be after the start time.");
  return { startTime, endTime };
}

function readNote(formData: FormData, required = false) {
  const note = String(formData.get("note") || "").trim().slice(0, 600);
  if (required && !note) throw new Error("Please add a short note so the recruiter knows why.");
  return note || null;
}

function datesText(dates: string[]) {
  return dates.map((d) => fmtDay(d)).join(", ");
}

function revalidateAll(driveId: string) {
  revalidatePath("/tpo/scheduling");
  revalidatePath("/tpo");
  revalidatePath("/tpo/notifications");
  revalidatePath("/recruiter/notifications");
  revalidatePath(`/tpo/drives/${driveId}`);
  revalidatePath(`/recruiter/drives/${driveId}`);
}

/** Recruiter asks for interview dates, or asks for a change to the agreed ones. */
export async function requestScheduleAction(driveId: string, formData: FormData) {
  const session = await getSession();
  assertRole(session, "RECRUITER");
  const recruiter = await requireApprovedRecruiter(session.userId);
  const drive = await prisma.drive.findUniqueOrThrow({ where: { id: driveId } });
  if (drive.recruiterId !== recruiter.id) throw new Error("You can only do this for your own drives.");

  const dates = readDates(formData);
  const { startTime, endTime } = readWindow(formData);
  const panelCount = Math.min(20, Math.max(1, Math.round(Number(formData.get("panelCount")) || 1)));
  const note = readNote(formData);

  const existing = await prisma.scheduleRequest.findUnique({ where: { driveId } });
  const isChange = Boolean(existing && existing.agreedDates.length > 0);
  const data = {
    status: "WAITING_TPO" as const,
    dates,
    startTime,
    endTime,
    panelCount,
    note,
    proposedByRole: "RECRUITER" as const,
    // The recruiter does not choose rooms. Clear anything the placement cell suggested earlier.
    venue: null,
    panels: null,
  };
  if (existing) await prisma.scheduleRequest.update({ where: { driveId }, data });
  else await prisma.scheduleRequest.create({ data: { driveId, ...data } });

  await prisma.tpoNotification.create({
    data: {
      type: "INTERVIEW_SCHEDULE",
      title: isChange ? "Interview dates: change requested" : "Interview dates requested",
      message: `${drive.companyName} (${drive.jobRole}) asked for ${datesText(dates)}, ${startTime} to ${endTime}, with ${panelCount} panel${panelCount === 1 ? "" : "s"}.`,
    },
  });
  revalidateAll(driveId);
}

/** Placement cell answers: confirm some of the requested dates, or suggest other dates. */
export async function tpoRespondScheduleAction(driveId: string, formData: FormData) {
  const session = await getSession();
  assertRole(session, "TPO");
  const intent = String(formData.get("intent") || "");
  const req = await prisma.scheduleRequest.findUnique({ where: { driveId }, include: { drive: true } });
  if (!req) throw new Error("There is no schedule request for this drive.");

  if (intent === "confirm") {
    if (req.status !== "WAITING_TPO") throw new Error("There is nothing waiting for your confirmation on this drive.");
    const chosen = Array.from(new Set(formData.getAll("agreeDates").map((v) => String(v)))).filter((d) => req.dates.includes(d));
    if (chosen.length === 0) throw new Error("Choose at least one of the requested dates to confirm.");
    const panels = parsePanelLines(String(formData.get("panels") || ""));
    if (panels.length === 0) throw new Error("Add at least one panel, for example: Panel A @ Room 101.");
    const venue = normalizeSlotName(String(formData.get("venue") || ""));
    const panelText = panelsToText(panels);
    await prisma.scheduleRequest.update({
      where: { driveId },
      data: {
        status: "CONFIRMED",
        agreedDates: chosen.sort(),
        agreedStart: req.startTime,
        agreedEnd: req.endTime,
        agreedVenue: venue,
        agreedPanels: panelText,
        dates: chosen.sort(),
        venue,
        panels: panelText,
        proposedByRole: "TPO",
      },
    });
    await prisma.recruiterNotification.create({
      data: {
        recruiterId: req.drive.recruiterId,
        type: "INTERVIEW_SCHEDULE",
        title: "Interview dates confirmed",
        message: `The placement cell confirmed ${datesText(chosen)}, ${req.startTime} to ${req.endTime}, with ${panels.length} panel${panels.length === 1 ? "" : "s"}. You can now book each student's time.`,
      },
    });
  } else if (intent === "counter") {
    if (req.status !== "WAITING_TPO" && req.status !== "CONFIRMED") {
      throw new Error("The recruiter is already looking at a suggestion from you.");
    }
    const dates = readDates(formData);
    const { startTime, endTime } = readWindow(formData);
    const panels = parsePanelLines(String(formData.get("panels") || ""));
    if (panels.length === 0) throw new Error("Add at least one panel, for example: Panel A @ Room 101.");
    const venue = normalizeSlotName(String(formData.get("venue") || ""));
    const note = readNote(formData, true);
    await prisma.scheduleRequest.update({
      where: { driveId },
      data: {
        status: "WAITING_RECRUITER",
        dates,
        startTime,
        endTime,
        venue,
        panels: panelsToText(panels),
        panelCount: panels.length,
        note,
        proposedByRole: "TPO",
      },
    });
    await prisma.recruiterNotification.create({
      data: {
        recruiterId: req.drive.recruiterId,
        type: "INTERVIEW_SCHEDULE",
        title: "The placement cell suggested other dates",
        message: `Suggested: ${datesText(dates)}, ${startTime} to ${endTime}. Note: ${note}. Please accept, or send new dates.`,
      },
    });
  } else {
    throw new Error("Choose Confirm or Suggest other dates.");
  }
  revalidateAll(driveId);
}

/** Recruiter accepts the dates the placement cell suggested. */
export async function recruiterAcceptScheduleAction(driveId: string) {
  const session = await getSession();
  assertRole(session, "RECRUITER");
  const recruiter = await requireApprovedRecruiter(session.userId);
  const req = await prisma.scheduleRequest.findUnique({ where: { driveId }, include: { drive: true } });
  if (!req || req.drive.recruiterId !== recruiter.id) throw new Error("You can only do this for your own drives.");
  if (req.status !== "WAITING_RECRUITER") throw new Error("There is nothing waiting for your answer.");
  if (!req.panels) throw new Error("The suggestion has no panels yet. Ask the placement cell to resend it.");

  await prisma.scheduleRequest.update({
    where: { driveId },
    data: {
      status: "CONFIRMED",
      agreedDates: req.dates,
      agreedStart: req.startTime,
      agreedEnd: req.endTime,
      agreedVenue: req.venue,
      agreedPanels: req.panels,
    },
  });
  await prisma.tpoNotification.create({
    data: {
      type: "INTERVIEW_SCHEDULE",
      title: "Recruiter accepted the interview dates",
      message: `${req.drive.companyName} (${req.drive.jobRole}) accepted ${datesText(req.dates)}, ${req.startTime} to ${req.endTime}.`,
    },
  });
  revalidateAll(driveId);
}
