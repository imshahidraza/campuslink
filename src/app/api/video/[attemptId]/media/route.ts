import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { loadAttemptForRecruiter, logVideoAccess } from "@/lib/videoAccess";
import { recordingIndex, streamRange } from "@/lib/videoStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Accept-Ranges": "bytes",
};

function plain(status: number, message: string, extra: Record<string, string> = {}) {
  return new Response(message, { status, headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8", ...extra } });
}

/** "bytes=0-99", "bytes=100-", "bytes=-500". Returns null if it can't be satisfied. */
function parseRange(header: string, total: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) return null;
  return { start, end };
}

/**
 * Plays a recording to the recruiter who owns the drive, and to nobody else. It is never a public address: every
 * request needs a signed-in session, and the ownership of the drive is checked on every request. It supports byte
 * ranges, so the video player can jump to any answer without downloading everything before it.
 */
export async function GET(req: Request, ctx: { params: Promise<{ attemptId: string }> }) {
  const session = await getSession();
  if (!session) return plain(401, "Please sign in.");
  if (!checkRateLimit(`video-media:${session.userId}`, 600, 10 * 60_000).allowed) return plain(429, "Too many requests. Please wait a moment.");

  const { attemptId } = await ctx.params;
  const attempt = await loadAttemptForRecruiter(session, attemptId);
  if (!attempt) return plain(404, "Not found."); // someone else's recording looks the same as one that does not exist
  if (attempt.status === "IN_PROGRESS") return plain(409, "This interview is still being recorded.");
  if (attempt.recordingDeletedAt) return plain(410, "This recording has been deleted.");

  const index = await recordingIndex(attempt.id);
  if (!index || index.total === 0) return plain(404, "No recording is available.");

  const rangeHeader = req.headers.get("range");
  let start = 0;
  let end = index.total - 1;
  let status = 200;
  if (rangeHeader) {
    const r = parseRange(rangeHeader, index.total);
    if (!r) return plain(416, "Range not satisfiable.", { "Content-Range": `bytes */${index.total}` });
    start = r.start;
    end = r.end;
    status = 206;
  }
  // One entry per viewing, not one per piece the player asks for.
  if (start === 0) await logVideoAccess(attempt.id, session, "PLAY");

  const headers: Record<string, string> = {
    ...BASE_HEADERS,
    "Content-Type": "video/webm",
    "Content-Length": String(end - start + 1),
    "Content-Disposition": 'inline; filename="interview.webm"',
  };
  if (status === 206) headers["Content-Range"] = `bytes ${start}-${end}/${index.total}`;
  return new Response(streamRange(attempt.id, index, start, end), { status, headers });
}

