/**
 * Thin client for a local Ollama server running the Gemma 4 E4B model.
 * All CampusLink AI features (resume understanding, JD understanding,
 * matching, explanations, skill-gap analysis, prep recommendations) go
 * through this single function so the "AI boundary" stays in one place —
 * everything that must be exact (CGPA, branch, backlogs, scheduling...)
 * lives in src/lib/rules.ts instead and never touches the model.
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:e4b";

export class OllamaError extends Error {}

/**
 * Calls Ollama's /api/generate endpoint and asks for strict JSON back.
 * `schemaHint` is a human-readable description of the exact JSON shape
 * we want, embedded in the prompt (Gemma doesn't have a native JSON
 * response_format the way some hosted APIs do, so we enforce it via
 * prompting + a best-effort parse/repair step).
 */
export async function ollamaJSON<T>(params: {
  system: string;
  prompt: string;
  schemaHint: string;
  temperature?: number;
}): Promise<T> {
  const fullPrompt = `${params.system}

You must respond with ONLY valid JSON. No markdown fences, no preamble, no explanation outside the JSON.

Expected JSON shape:
${params.schemaHint}

Input:
${params.prompt}

JSON response:`;

  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: fullPrompt,
        stream: false,
        options: {
          temperature: params.temperature ?? 0.2,
        },
      }),
      // Local model calls can be slow on modest hardware — give it room.
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    throw new OllamaError(
      `Could not reach Ollama at ${OLLAMA_BASE_URL}. Is "ollama serve" running and is "${OLLAMA_MODEL}" pulled? (${
        (err as Error).message
      })`
    );
  }

  if (!res.ok) {
    throw new OllamaError(`Ollama returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const raw: string = data.response ?? "";
  return parseJSONLoose<T>(raw);
}

/** Strips markdown fences / stray text and parses the first JSON object found. */
function parseJSONLoose<T>(raw: string): T {
  let text = raw.trim();
  text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");

  try {
    return JSON.parse(text) as T;
  } catch {
    // Fall back to grabbing the outermost { ... } or [ ... ] block.
    const objMatch = text.match(/\{[\s\S]*\}/);
    const arrMatch = text.match(/\[[\s\S]*\]/);
    const candidate = objMatch?.[0] ?? arrMatch?.[0];
    if (candidate) {
      try {
        return JSON.parse(candidate) as T;
      } catch {
        // fall through
      }
    }
    throw new OllamaError(`Gemma response was not valid JSON:\n${raw.slice(0, 500)}`);
  }
}

export async function ollamaHealthCheck(): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const data = await res.json();
    const hasModel = (data.models || []).some((m: { name: string }) =>
      m.name?.startsWith(OLLAMA_MODEL.split(":")[0])
    );
    return {
      ok: hasModel,
      detail: hasModel
        ? `Connected. "${OLLAMA_MODEL}" available.`
        : `Connected to Ollama, but "${OLLAMA_MODEL}" was not found in "ollama list".`,
    };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}
