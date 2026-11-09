import { normalizeSlotName } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";
import type { AllocationPanel } from "@/lib/rules";

/**
 * Panels, one per line: "Panel A" or "Panel A @ Room 101". Names and rooms are saved in capitals so
 * "panel a" and "PANEL A" are always the same panel.
 */
export function parsePanelLines(raw: string | null | undefined): AllocationPanel[] {
  const seen = new Set<string>();
  const out: AllocationPanel[] = [];
  for (const line of (raw ?? "").split("\n")) {
    const [namePart, venuePart] = line.split("@");
    const name = normalizeSlotName(namePart);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, venue: normalizeSlotName(venuePart) });
  }
  if (out.length > 20) throw new Error("Too many panels (max 20).");
  return out;
}

export function panelsToText(panels: AllocationPanel[]): string {
  return panels.map((p) => (p.venue ? `${p.name} @ ${p.venue}` : p.name)).join("\n");
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^\d{2}:\d{2}$/;

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** The last window the recruiter and the placement cell agreed on for a drive, or null if none yet. */
export async function getAgreedWindow(driveId: string) {
  const req = await prisma.scheduleRequest.findUnique({ where: { driveId } });
  if (!req || req.agreedDates.length === 0 || !req.agreedStart || !req.agreedEnd) return null;
  const panels = parsePanelLines(req.agreedPanels);
  if (panels.length === 0) return null;
  const venue = normalizeSlotName(req.agreedVenue);
  return {
    dates: [...req.agreedDates].sort(),
    start: req.agreedStart,
    end: req.agreedEnd,
    venue,
    // A panel's own room is the only thing treated as a bookable resource. The general venue is just shown.
    panels: panels.map((p) => ({ name: p.name, venue: p.venue })),
  };
}

export type AgreedWindow = NonNullable<Awaited<ReturnType<typeof getAgreedWindow>>>;
