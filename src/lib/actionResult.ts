/**
 * Server actions return `{ ok, ... }` instead of throwing for expected problems (a box left empty, a step done
 * out of order). In a production build Next replaces the text of a thrown error with a generic message,
 * so a returned result is the only way the user sees what to fix. Unexpected errors (a database problem, a
 * bug) are turned into one safe sentence, so no internal detail reaches the browser.
 */

import { safeErrorMessage } from "./safeError";
import { OllamaError } from "./ollama";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export async function guard<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof OllamaError) {
      const friendly = /busy|too long/i.test(err.message) ? err.message : "The AI is not available right now. Please try again in a minute.";
      return { ok: false, error: friendly };
    }
    return { ok: false, error: safeErrorMessage(err, "Something went wrong. Please refresh the page and try again.") };
  }
}
