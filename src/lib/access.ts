import { prisma } from "./prisma";
import type { SessionPayload } from "./auth";

export const RECRUITER_NOT_APPROVED =
  "Your recruiter account is waiting for approval from the placement cell. You can use this once it is approved.";

/** The signed-in recruiter's row, only if the placement cell has approved it. */
export async function requireApprovedRecruiter(userId: string) {
  const recruiter = await prisma.recruiter.findUniqueOrThrow({ where: { userId } });
  if (recruiter.status !== "APPROVED") throw new Error(RECRUITER_NOT_APPROVED);
  return recruiter;
}

/**
 * A TPO may manage any drive at the college. A recruiter may manage only the drives they created,
 * and only while the placement cell has them approved. Call this in every server action that acts
 * on a drive by id, so ownership is enforced on the server and not just by what the screen shows.
 */
export async function assertCanManageDrive(session: SessionPayload, driveRecruiterId: string) {
  if (session.role === "TPO") return;
  if (session.role === "RECRUITER") {
    const recruiter = await prisma.recruiter.findUnique({
      where: { userId: session.userId },
      select: { id: true, status: true },
    });
    if (recruiter && recruiter.id === driveRecruiterId) {
      if (recruiter.status !== "APPROVED") throw new Error(RECRUITER_NOT_APPROVED);
      return;
    }
    throw new Error("You can only manage your own drives.");
  }
  throw new Error("Not authorized.");
}
