import { prisma } from "./prisma";
import type { SessionPayload } from "./auth";

/**
 * A TPO may manage any drive at the college. A recruiter may manage only the drives they created.
 * Call this in every server action that acts on a drive by id, so ownership is enforced on the
 * server and not just by what the screen happens to show.
 */
export async function assertCanManageDrive(session: SessionPayload, driveRecruiterId: string) {
  if (session.role === "TPO") return;
  if (session.role === "RECRUITER") {
    const recruiter = await prisma.recruiter.findUnique({ where: { userId: session.userId }, select: { id: true } });
    if (recruiter && recruiter.id === driveRecruiterId) return;
    throw new Error("You can only manage your own drives.");
  }
  throw new Error("Not authorized.");
}
