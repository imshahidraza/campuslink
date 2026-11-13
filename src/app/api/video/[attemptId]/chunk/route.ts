import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/origin";
import { checkRateLimit } from "@/lib/rateLimit";
import { MAX_CHUNK_BYTES, MAX_CHUNKS, MAX_TOTAL_BYTES, UPLOAD_GRACE_MS, mimeFamily, sniffVideoContainer } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * One piece of a student's recording. Only the student who owns the attempt may send it, only while the attempt is in
 * progress, only up to the deadline plus a short upload time, and every piece is checked for size and number.
 * Sending the same piece again (a retry after a bad connection) is accepted once and acknowledged again.
 */
export async function POST(req: Request, ctx: { params: Promise<{ attemptId: string }> }) {
  if (!isSameOrigin(req)) return fail(403, "Not allowed.");
  const session = await getSession();
  if (!session || session.role !== "STUDENT") return fail(401, "Please sign in again.");
  if (!checkRateLimit(`video-chunk:${session.userId}`, 300, 60_000).allowed) return fail(429, "Too many uploads. Please wait a moment.");

  const { attemptId } = await ctx.params;
  const seq = Number(new URL(req.url).searchParams.get("seq"));
  if (!Number.isInteger(seq) || seq < 0 || seq >= MAX_CHUNKS) return fail(400, "Bad piece number.");

  const declared = Number(req.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared < 1) return fail(411, "The size of the piece is missing.");
  if (declared > MAX_CHUNK_BYTES) return fail(413, "That piece is too large.");

  const attempt = await prisma.videoAttempt.findUnique({
    where: { id: attemptId },
    select: { id: true, status: true, deadlineAt: true, byteSize: true, mimeType: true, application: { select: { student: { select: { userId: true } } } } },
  });
  // Someone else's attempt looks the same as one that does not exist.
  if (!attempt || attempt.application.student.userId !== session.userId) return fail(404, "Not found.");
  if (attempt.status !== "IN_PROGRESS") return fail(409, "This interview has already ended.");
  if (Date.now() > attempt.deadlineAt.getTime() + UPLOAD_GRACE_MS) return fail(409, "The time for uploading has ended.");

  const body = new Uint8Array(await req.arrayBuffer());
  if (body.length < 1 || body.length > MAX_CHUNK_BYTES || body.length !== declared) return fail(400, "The piece is not complete.");
  if (attempt.byteSize + body.length > MAX_TOTAL_BYTES) return fail(413, "The recording is larger than allowed.");
  // The first piece must really be a video file of the kind the browser said it was recording.
  if (seq === 0 && sniffVideoContainer(body) !== mimeFamily(attempt.mimeType)) return fail(415, "That is not a valid video recording.");

  try {
    await prisma.$transaction([
      prisma.videoChunk.create({ data: { attemptId, kind: "RAW", seq, size: body.length, data: body } }),
      prisma.videoAttempt.update({ where: { id: attemptId }, data: { lastChunkAt: new Date(), chunkCount: { increment: 1 }, byteSize: { increment: body.length } } }),
    ]);
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      const have = await prisma.videoChunk.findUnique({ where: { attemptId_kind_seq: { attemptId, kind: "RAW", seq } }, select: { size: true } });
      if (have && have.size === body.length) {
        await prisma.videoAttempt.updateMany({ where: { id: attemptId, status: "IN_PROGRESS" }, data: { lastChunkAt: new Date() } });
        return NextResponse.json({ ok: true, duplicate: true }, { headers: { "Cache-Control": "no-store" } });
      }
      return fail(409, "A different piece with this number is already stored.");
    }
    console.error("video chunk store failed:", err instanceof Error ? err.message : "unknown error");
    return fail(500, "The piece could not be stored. Please try again.");
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
