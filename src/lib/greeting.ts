/**
 * The greeting on every Overview page: "Good morning" / "Good afternoon" / "Good evening" by Indian time,
 * then the name, then one warm sentence that changes with each sign-in and always ends with "Welcome to C-Link."
 * The sentence is picked from fixed lists (no AI), so it is instant and always professional.
 */

export type WelcomeRole = "STUDENT" | "TPO" | "RECRUITER";

export function greetingFor(now: Date = new Date()): "Good morning" | "Good afternoon" | "Good evening" {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(now)
  );
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

/** The fixed ending. It is added by the page, never by these lists, so it can't be left out. */
export const WELCOME_ENDING = "Welcome to C-Link.";

const PHRASES: Record<WelcomeRole, string[]> = {
  RECRUITER: [
    "It is a pleasure to have you with us.",
    "We are glad to see you again.",
    "Great talent is waiting to meet you.",
    "Wishing you a productive day of hiring.",
    "Your next great hire starts here.",
    "Thank you for partnering with our campus.",
    "Everything you need to hire well is right here.",
    "Delighted to have you on board.",
    "Let us help you find the right people for your team.",
    "We appreciate your time and trust.",
  ],
  STUDENT: [
    "We are delighted to see you again.",
    "Your next opportunity starts here.",
    "Every step you take today builds your career.",
    "Wishing you a focused and productive day.",
    "Great things are ahead of you.",
    "Your journey from campus to career continues here.",
    "It is wonderful to have you back.",
    "Prepare well and apply with confidence.",
    "Your effort today shapes your tomorrow.",
    "We are here to support your placement journey.",
  ],
  TPO: [
    "Thank you for everything you do for your students.",
    "It is a pleasure to have you with us.",
    "Your placement desk, all in one place.",
    "Wishing you a smooth and productive day.",
    "Every placement begins with your guidance.",
    "We are glad to see you again.",
    "Your students' careers are in good hands.",
    "Everything you need to guide your campus is right here.",
    "We appreciate the work you do each day.",
    "Delighted to have you on board.",
  ],
};

/** n is a whole number saved at sign-in; the same n always gives the same sentence for the rest of that sign-in. */
export function phraseFor(role: WelcomeRole, n: number): string {
  const list = PHRASES[role];
  const i = Number.isFinite(n) ? Math.abs(Math.trunc(n)) % list.length : 0;
  return list[i];
}
