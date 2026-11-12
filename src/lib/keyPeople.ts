import { prisma } from "./prisma";
import { MAX_KEY_PEOPLE, keyPersonSelect, toKeyPersonView, type KeyPersonView } from "./keyPeopleShared";

/** Server only: loads one recruiter's key people (never the photo bytes). */
export async function loadKeyPeople(recruiterId: string): Promise<KeyPersonView[]> {
  const rows = await prisma.keyPerson.findMany({
    where: { recruiterId },
    orderBy: { position: "asc" },
    take: MAX_KEY_PEOPLE,
    select: keyPersonSelect,
  });
  return rows.map(toKeyPersonView);
}
