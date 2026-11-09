import { prisma } from "./prisma";

/** "ABC College" -> "ABC College's". Used in notifications such as "ABC College's placement cell ...". */
export function possessive(name: string): string {
  const n = name.trim();
  return n ? `${n}'s` : "";
}

export async function getCollegeName(): Promise<string | null> {
  const college = await prisma.college.findFirst({ orderBy: { createdAt: "asc" }, select: { name: true } });
  return college?.name?.trim() || null;
}

/** "ABC College's placement cell", or just "The placement cell" if no college name is set yet. */
export async function placementCellLabel(): Promise<string> {
  const name = await getCollegeName();
  return name ? `${possessive(name)} placement cell` : "The placement cell";
}

/** Where students email their documents: the address set in College setup, else the first TPO account's email. */
export async function getDocumentsEmail(): Promise<string | null> {
  const college = await prisma.college.findFirst({ orderBy: { createdAt: "asc" }, select: { tpoEmail: true } });
  if (college?.tpoEmail) return college.tpoEmail;
  const tpo = await prisma.user.findFirst({ where: { role: "TPO" }, orderBy: { createdAt: "asc" }, select: { email: true } });
  return tpo?.email ?? null;
}
