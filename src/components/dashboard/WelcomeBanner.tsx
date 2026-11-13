import type { ReactNode } from "react";
import { greetingFor, phraseFor, WELCOME_ENDING, type WelcomeRole } from "@/lib/greeting";
import { getWelcomeNumber } from "@/lib/welcome";

/**
 * The top of every Overview page:
 *   Good afternoon,
 *   <name>
 *   <a warm sentence that changes at each sign-in> Welcome to C-Link.
 * `action` is an optional button shown on the right (for example "New drive").
 */
export async function WelcomeBanner({ role, name, action }: { role: WelcomeRole; name: string; action?: ReactNode }) {
  const greeting = greetingFor();
  const phrase = phraseFor(role, await getWelcomeNumber());

  return (
    <section
      aria-label="Welcome"
      className="rounded-2xl bg-brand-950 px-6 py-6 sm:px-8 sm:py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium tracking-wide text-accent-lime">{greeting},</p>
        <h1 className="mt-1 font-serif text-3xl sm:text-4xl leading-tight text-white break-words">{name}</h1>
        <p className="mt-3 text-sm sm:text-base text-white/65 leading-relaxed">
          {phrase} <span className="text-white font-medium">{WELCOME_ENDING}</span>
        </p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </section>
  );
}
