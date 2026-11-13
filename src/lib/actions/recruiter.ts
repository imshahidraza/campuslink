"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole, setSessionCookie } from "@/lib/auth";
import { guard } from "@/lib/actionResult";
import { parseWebUrl } from "@/lib/safeUrl";
import { cleanText, MAX_KEY_PEOPLE } from "@/lib/keyPeopleShared";

/** Longer free text (the "About" box): keeps line breaks, drops other control characters. */
function cleanParagraph(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  return input.replace(/\r\n/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ").trim().slice(0, max);
}

/** The recruiter's own details and their company's details (the "Profile setup" page). */
async function runSaveProfileSetup(formData: FormData) {
  const session = await getSession();
  assertRole(session, "RECRUITER");
  const recruiter = await prisma.recruiter.findUniqueOrThrow({ where: { userId: session.userId } });

  const name = cleanText(formData.get("name"), 80);
  const contactRole = cleanText(formData.get("contactRole"), 60);
  const companyName = cleanText(formData.get("companyName"), 120);
  const industry = cleanText(formData.get("industry"), 80);
  const about = cleanParagraph(formData.get("companyDesc"), 2000);

  if (!name) throw new Error("Please enter your name.");
  if (!companyName) throw new Error("Please enter the company name.");
  const site = parseWebUrl(formData.get("website"), "website address");
  if (!site.ok) throw new Error(site.message);

  await prisma.$transaction([
    prisma.user.update({ where: { id: session.userId }, data: { name } }),
    prisma.recruiter.update({
      where: { id: recruiter.id },
      data: {
        companyName,
        contactRole: contactRole || null,
        industry: industry || null,
        website: site.url,
        companyDesc: about || null,
      },
    }),
  ]);

  // The name in the menu and the welcome banner comes from the sign-in cookie, so refresh it.
  if (name !== session.name) {
    await setSessionCookie({ userId: session.userId, role: session.role, email: session.email, name });
  }

  revalidatePath("/recruiter", "layout");
  revalidatePath("/tpo/recruiters");
  revalidatePath("/student/drives");
}

/** Removes one of the recruiter's key people (and their photo). */
async function runRemoveKeyPerson(position: number) {
  const session = await getSession();
  assertRole(session, "RECRUITER");
  if (!Number.isInteger(position) || position < 0 || position >= MAX_KEY_PEOPLE) throw new Error("That person was not found.");
  const recruiter = await prisma.recruiter.findUniqueOrThrow({ where: { userId: session.userId }, select: { id: true } });
  await prisma.keyPerson.deleteMany({ where: { recruiterId: recruiter.id, position } });
  revalidatePath("/recruiter/profile");
  revalidatePath("/tpo/recruiters");
  revalidatePath("/student/drives");
}

export async function saveProfileSetupAction(formData: FormData) {
  return guard(() => runSaveProfileSetup(formData));
}

export async function removeKeyPersonAction(position: number) {
  return guard(() => runRemoveKeyPerson(position));
}
