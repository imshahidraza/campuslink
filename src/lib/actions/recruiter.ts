"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";

export async function updateRecruiterProfileAction(formData: FormData) {
  const session = await getSession();
  assertRole(session, "RECRUITER");
  const recruiter = await prisma.recruiter.findUniqueOrThrow({ where: { userId: session.userId } });

  await prisma.recruiter.update({
    where: { id: recruiter.id },
    data: {
      companyName: String(formData.get("companyName") || recruiter.companyName),
      companyDesc: String(formData.get("companyDesc") || "") || null,
      website: String(formData.get("website") || "") || null,
      industry: String(formData.get("industry") || "") || null,
    },
  });

  revalidatePath("/recruiter/profile");
  revalidatePath("/recruiter");
}
