import type { PlacementStatus } from "@prisma/client";
import { prisma } from "./prisma";

// How far along each application stage is. The student's overall status is the furthest one.
// Not selected, withdrawn and declined applications don't count: they never mark the student unplaced
// on their own and never block other drives.
const PROGRESS: Record<string, { status: PlacementStatus; rank: number }> = {
  ELIGIBLE: { status: "APPLIED", rank: 1 },
  SHORTLISTED: { status: "SHORTLISTED", rank: 2 },
  INTERVIEW: { status: "INTERVIEW", rank: 3 },
  SELECTED: { status: "SELECTED", rank: 4 },
  OFFER_REQUESTED: { status: "SELECTED", rank: 4 },
  OFFER_SENT: { status: "OFFER_RECEIVED", rank: 5 },
  OFFER_ACCEPTED: { status: "OFFER_ACCEPTED", rank: 6 },
  JOINED: { status: "JOINED", rank: 7 },
};

/** Recomputes Student.placementStatus from all of the student's applications. Call after any stage change. */
export async function refreshPlacementStatus(studentId: string) {
  const apps = await prisma.application.findMany({ where: { studentId }, select: { stage: true } });
  let best: { status: PlacementStatus; rank: number } = { status: "UNPLACED", rank: 0 };
  for (const a of apps) {
    const p = PROGRESS[a.stage];
    if (p && p.rank > best.rank) best = p;
  }
  await prisma.student.update({ where: { id: studentId }, data: { placementStatus: best.status } });
}
