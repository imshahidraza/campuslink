/**
 * Client for the small local speech service in whisper-service/ (faster-whisper + PyAV, running on this PC).
 * It never goes to the internet: the address comes from .env (not from any user), and only this server calls it.
 * Two jobs: "remux" (rewrite the browser's WebM so it has a duration and can be searched) and "transcribe"
 * (turn the stated time windows of the recording into text).
 */

const BASE = (process.env.WHISPER_URL || "http://127.0.0.1:8765").replace(/\/+$/, "");
const KEY = process.env.WHISPER_API_KEY || "";

export class WhisperError extends Error {}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return KEY ? { "x-api-key": KEY, ...extra } : extra;
}

async function call(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new WhisperError(timedOut ? "The speech service took too long." : "The speech service is not running.");
  }
  if (res.status === 401 || res.status === 403) throw new WhisperError("The speech service refused the key. Check WHISPER_API_KEY in .env.");
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { detail?: unknown };
      if (typeof j.detail === "string") detail = j.detail.slice(0, 160);
    } catch {
      /* ignore */
    }
    throw new WhisperError(`The speech service could not do this${detail ? `: ${detail}` : "."}`);
  }
  return res;
}

export async function whisperHealth(): Promise<{ ok: boolean; model?: string; device?: string }> {
  try {
    const res = await call("/health", { method: "GET", headers: headers() }, 4000);
    const j = (await res.json()) as { model_loaded?: boolean; model?: string; device?: string };
    return { ok: Boolean(j.model_loaded), model: j.model, device: j.device };
  } catch {
    return { ok: false };
  }
}

/** Rewrites the recording so it has a proper duration and seek index. The picture and sound are not re-encoded. */
export async function remuxRecording(bytes: Uint8Array): Promise<{ bytes: Buffer; durationSec: number }> {
  const res = await call("/remux", { method: "POST", headers: headers({ "content-type": "application/octet-stream" }), body: bytes as BodyInit }, 10 * 60_000);
  const durationSec = Number(res.headers.get("x-duration-sec"));
  const out = Buffer.from(await res.arrayBuffer());
  if (!Number.isFinite(durationSec) || durationSec <= 0 || out.length < 1000) throw new WhisperError("The speech service returned an unusable file.");
  return { bytes: out, durationSec };
}

export interface WindowText {
  index: number;
  text: string;
  speechSec: number; // how much of the window the recogniser heard speech in
}

/** Turns each (start, end) window of the recording into text. Windows are in seconds on the recording's own timeline. */
export async function transcribeWindows(
  bytes: Uint8Array,
  windows: { index: number; startSec: number; endSec: number }[],
  hint: string
): Promise<WindowText[]> {
  const form = new FormData();
  form.append("windows", JSON.stringify(windows));
  form.append("hint", hint.slice(0, 300));
  form.append("file", new Blob([bytes as BlobPart], { type: "application/octet-stream" }), "recording.webm");
  const res = await call("/transcribe", { method: "POST", headers: headers(), body: form }, 30 * 60_000);
  const j = (await res.json()) as { results?: unknown };
  const out: WindowText[] = [];
  for (const r of Array.isArray(j.results) ? j.results : []) {
    const o = r as Record<string, unknown>;
    if (typeof o.index === "number" && typeof o.text === "string") {
      out.push({ index: o.index, text: o.text.slice(0, 8000), speechSec: typeof o.speech_sec === "number" ? o.speech_sec : 0 });
    }
  }
  return out;
}
