import { prisma } from "./prisma";
import type { SessionPayload } from "./auth";

/**
 * Who may look at a recorded interview: the approved recruiter who owns the drive, and nobody else. A student
 * sees only their own submission status, and the placement cell sees only counts. A request for an attempt that the
 * caller may not see looks exactly like a request for one that does not exist.
 */
export async function loadAttemptForRecruiter(session: SessionPayload | null, attemptId: unknown) {
  if (!session || session.role !== "RECRUITER" || typeof attemptId !== "string" || !attemptId) return null;
  const recruiter = await prisma.recruiter.findUnique({ where: { userId: session.userId }, select: { id: true, status: true } });
  if (!recruiter || recruiter.status !== "APPROVED") return null;
  const attempt = await prisma.videoAttempt.findUnique({
    where: { id: attemptId },
    include: {
      answers: { orderBy: { position: "asc" } },
      application: {
        select: {
          id: true,
          stage: true,
          student: { select: { id: true, rollNo: true, branch: true, user: { select: { name: true } } } },
          drive: { select: { id: true, jobRole: true, companyName: true, recruiterId: true } },
        },
      },
    },
  });
  if (!attempt || attempt.application.drive.recruiterId !== recruiter.id) return null;
  return attempt;
}

/** Writes who looked at a recording. The same person doing the same thing within `dedupeMs` is written once. */
export async function logVideoAccess(attemptId: string, session: SessionPayload, action: string, dedupeMs = 10 * 60_000) {
  if (dedupeMs > 0) {
    const recent = await prisma.videoAccessLog.findFirst({
      where: { attemptId, userId: session.userId, action, createdAt: { gt: new Date(Date.now() - dedupeMs) } },
      select: { id: true },
    });
    if (recent) return;
  }
  await prisma.videoAccessLog.create({ data: { attemptId, userId: session.userId, role: session.role, action } });
}
