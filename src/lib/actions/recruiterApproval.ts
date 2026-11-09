"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, assertRole } from "@/lib/auth";
import { placementCellLabel } from "@/lib/college";

async function setStatus(recruiterId: string, status: "APPROVED" | "DECLINED") {
  const session = await getSession();
  assertRole(session, "TPO");

  const recruiter = await prisma.recruiter.findUniqueOrThrow({ where: { id: recruiterId } });
  if (recruiter.status === status) return;

  await prisma.recruiter.update({ where: { id: recruiterId }, data: { status } });
  const cell = await placementCellLabel();
  await prisma.recruiterNotification.create({
    data: {
      recruiterId,
      type: "GENERAL",
      title: status === "APPROVED" ? "Your account is approved" : "Your account was not approved",
      message:
        status === "APPROVED"
          ? `${cell} approved your account. You can now create drives.`
          : `${cell} did not approve your account. Please contact them if you think this is a mistake.`,
    },
  });

  revalidatePath("/tpo/recruiters");
  revalidatePath("/recruiter", "layout");
}

export async function approveRecruiterAction(recruiterId: string) {
  await setStatus(recruiterId, "APPROVED");
}

export async function declineRecruiterAction(recruiterId: string) {
  await setStatus(recruiterId, "DECLINED");
}
