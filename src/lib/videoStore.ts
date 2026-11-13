import { prisma } from "./prisma";
import { FINAL_SEGMENT_BYTES } from "./video";

/**
 * The recording lives in PostgreSQL, as rows of bytes (VideoChunk). While the student is recording, each piece the
 * browser hands over is one RAW row. When the interview ends, the pieces are joined, rewritten so the video can be
 * searched (done by the speech service), and stored again as FINAL rows of 1 MiB each. Playback reads only the
 * rows a request needs, so a 60 MB recording is never held in memory just to play it.
 */

/** Pieces that arrived without a gap, counting from the first one. */
export async function rawRun(attemptId: string): Promise<{ count: number; bytes: number; received: number }> {
  const rows = await prisma.videoChunk.findMany({ where: { attemptId, kind: "RAW" }, select: { seq: true, size: true }, orderBy: { seq: "asc" } });
  let count = 0;
  let bytes = 0;
  for (const r of rows) {
    if (r.seq !== count) break;
    count++;
    bytes += r.size;
  }
  return { count, bytes, received: rows.length };
}

/** Joins the pieces of one kind (the first `count`, in order) into one buffer. Read in small batches so the database isn't flooded. */
export async function assemble(attemptId: string, kind: "RAW" | "FINAL", count: number): Promise<Buffer> {
  const parts: Buffer[] = [];
  for (let from = 0; from < count; from += 16) {
    const rows = await prisma.videoChunk.findMany({
      where: { attemptId, kind, seq: { gte: from, lt: Math.min(count, from + 16) } },
      select: { seq: true, data: true },
      orderBy: { seq: "asc" },
    });
    for (const r of rows) parts.push(Buffer.from(r.data));
  }
  return Buffer.concat(parts);
}

export async function hasFinal(attemptId: string): Promise<boolean> {
  return (await prisma.videoChunk.count({ where: { attemptId, kind: "FINAL" } })) > 0;
}

/**
 * Stores the finished (searchable) recording and removes the RAW pieces, in ONE transaction: either the new
 * recording is fully there and the old pieces gone, or nothing changed.
 */
export async function replaceWithFinal(attemptId: string, bytes: Buffer, durationSec: number) {
  const segments: { seq: number; size: number; data: Buffer }[] = [];
  for (let off = 0, seq = 0; off < bytes.length; off += FINAL_SEGMENT_BYTES, seq++) {
    const data = bytes.subarray(off, Math.min(bytes.length, off + FINAL_SEGMENT_BYTES));
    segments.push({ seq, size: data.length, data });
  }
  await prisma.$transaction(
    async (tx) => {
      await tx.videoChunk.deleteMany({ where: { attemptId, kind: "FINAL" } });
      for (let i = 0; i < segments.length; i += 8) {
        await tx.videoChunk.createMany({
          data: segments.slice(i, i + 8).map((s) => ({ attemptId, kind: "FINAL" as const, seq: s.seq, size: s.size, data: new Uint8Array(s.data) })),
        });
      }
      await tx.videoChunk.deleteMany({ where: { attemptId, kind: "RAW" } });
      await tx.videoAttempt.update({ where: { id: attemptId }, data: { byteSize: bytes.length, durationSec, remuxStatus: "DONE" } });
    },
    { timeout: 180_000, maxWait: 20_000 }
  );
}

export interface RecordingIndex {
  kind: "RAW" | "FINAL";
  total: number;
  rows: { seq: number; size: number }[];
}

/** What to play: the searchable FINAL recording if it exists, otherwise the RAW pieces that arrived without a gap. */
export async function recordingIndex(attemptId: string): Promise<RecordingIndex | null> {
  for (const kind of ["FINAL", "RAW"] as const) {
    const rows = await prisma.videoChunk.findMany({ where: { attemptId, kind }, select: { seq: true, size: true }, orderBy: { seq: "asc" } });
    if (rows.length === 0) continue;
    const run: { seq: number; size: number }[] = [];
    for (const r of rows) {
      if (r.seq !== run.length) break;
      run.push(r);
    }
    if (run.length === 0) continue;
    return { kind, rows: run, total: run.reduce((n, r) => n + r.size, 0) };
  }
  return null;
}

/** A stream of bytes [start, end] (inclusive) of the recording, reading one row at a time. */
export function streamRange(attemptId: string, index: RecordingIndex, start: number, end: number): ReadableStream<Uint8Array> {
  // Which rows overlap the range, and where each begins.
  const plan: { seq: number; from: number; to: number }[] = [];
  let offset = 0;
  for (const r of index.rows) {
    const rowStart = offset;
    const rowEnd = offset + r.size - 1;
    offset += r.size;
    if (rowEnd < start) continue;
    if (rowStart > end) break;
    plan.push({ seq: r.seq, from: Math.max(start, rowStart) - rowStart, to: Math.min(end, rowEnd) - rowStart });
  }
  let i = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i >= plan.length) {
        controller.close();
        return;
      }
      const p = plan[i++];
      const row = await prisma.videoChunk.findUnique({
        where: { attemptId_kind_seq: { attemptId, kind: index.kind, seq: p.seq } },
        select: { data: true },
      });
      if (!row) {
        controller.error(new Error("A part of the recording is missing."));
        return;
      }
      controller.enqueue(new Uint8Array(row.data.subarray(p.from, p.to + 1)));
    },
  });
}

/** Removes the recording itself. The transcripts, marks and the access log stay. */
export async function deleteRecordingData(attemptId: string) {
  await prisma.$transaction([
    prisma.videoChunk.deleteMany({ where: { attemptId } }),
    prisma.videoAttempt.update({ where: { id: attemptId }, data: { recordingDeletedAt: new Date(), byteSize: 0, chunkCount: 0 } }),
  ]);
}
