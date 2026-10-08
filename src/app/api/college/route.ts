import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Tells the signup form whether a college already exists (single-tenant build: there's at most one). */
export async function GET() {
  const college = await prisma.college.findFirst({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ college: college ? { name: college.name } : null });
}
