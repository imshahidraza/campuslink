/**
 * Exact rules for the in-app reminders. No AI and no clock tricks: each function takes the current
 * time as an argument so the same input always gives the same answer, and so it can be tested.
 * Reminders appear as notifications inside C-Link. Nothing is sent by email or SMS.
 */

export const DOCUMENT_DEADLINE_DAYS = 7; // a student has this long after accepting to send documents
export const DOCUMENT_REMINDER_DAYS_BEFORE = 2; // reminder goes out when the deadline is this close
export const OFFER_FOLLOW_UP_AFTER_DAYS = 3; // an unanswered offer is "pending" after this long
export const OFFER_FOLLOW_UP_EVERY_DAYS = 3; // and the prompt repeats at this gap
export const OFFER_FOLLOW_UP_MAX = 3; // but never more than this many times

const DAY = 86_400_000;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY);
}

export interface DocReminderState {
  stage: string;
  documentsVerified: boolean;
  documentsDueAt: Date | null;
  docReminderSentAt: Date | null;
  docOverdueSentAt: Date | null;
}

/**
 * What a student with an accepted offer should be told about their document deadline right now:
 * "none" (nothing to do), "soon" (due within 2 days, not reminded yet) or "overdue" (past due, not told yet).
 */
export function documentReminderDue(a: DocReminderState, now: Date): "none" | "soon" | "overdue" {
  if (a.stage !== "OFFER_ACCEPTED" || a.documentsVerified || !a.documentsDueAt) return "none";
  const msLeft = a.documentsDueAt.getTime() - now.getTime();
  if (msLeft < 0) return a.docOverdueSentAt ? "none" : "overdue";
  if (msLeft <= DOCUMENT_REMINDER_DAYS_BEFORE * DAY) return a.docReminderSentAt ? "none" : "soon";
  return "none";
}

export interface FollowUpState {
  stage: string;
  offerSentAt: Date | null;
  offerFollowUpAt: Date | null;
  offerFollowUpCount: number;
}

/**
 * True when an offer has waited for the student longer than it should and a prompt is due (max 3, 3 days apart).
 * `opts` lets a demo shorten the waiting time (see OFFER_FOLLOW_UP_DAYS in .env.example).
 */
export function offerFollowUpDue(a: FollowUpState, now: Date, opts: { afterDays?: number; everyDays?: number } = {}): boolean {
  const afterDays = opts.afterDays ?? OFFER_FOLLOW_UP_AFTER_DAYS;
  const everyDays = opts.everyDays ?? OFFER_FOLLOW_UP_EVERY_DAYS;
  if (a.stage !== "OFFER_SENT" || !a.offerSentAt) return false;
  if (a.offerFollowUpCount >= OFFER_FOLLOW_UP_MAX) return false;
  if (now.getTime() - a.offerSentAt.getTime() < afterDays * DAY) return false;
  if (a.offerFollowUpAt && now.getTime() - a.offerFollowUpAt.getTime() < everyDays * DAY) return false;
  return true;
}
