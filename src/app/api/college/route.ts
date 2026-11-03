import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Tells the signup form whether a college already exists (single-tenant build: there's at most one). */
export async function GET() {
  const college = await prisma.college.findFirst({ orderBy: { createdAt: "asc" } });
  // How a new TPO may sign up: "code" (an admin-set code is required), "first" (no code set, and no
  // college yet, so the first TPO bootstraps it), or "closed" (no code set and a college already exists).
  const tpoSignup = process.env.TPO_SIGNUP_CODE ? "code" : college ? "closed" : "first";
  return NextResponse.json({ college: college ? { name: college.name } : null, tpoSignup });
}
