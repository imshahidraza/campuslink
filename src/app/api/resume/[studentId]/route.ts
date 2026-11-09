import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * Serves a resume PDF — but only to someone allowed to see it:
 *  - the student themself,
 *  - any TPO,
 *  - a recruiter, only if the student applied to one of THAT recruiter's drives.
 * Everything else gets the same "not found" so ids can't be probed.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const notFound = () => NextResponse.json({ error: "Resume not found." }, { status: 404 });

  let allowed = false;
  if (session.role === "TPO") {
    allowed = true;
  } else if (session.role === "STUDENT") {
    const me = await prisma.student.findUnique({ where: { userId: session.userId }, select: { id: true } });
    allowed = me?.id === studentId;
  } else if (session.role === "RECRUITER") {
    const rec = await prisma.recruiter.findUnique({ where: { userId: session.userId }, select: { id: true } });
    if (rec) {
      const link = await prisma.application.findFirst({
        where: { studentId, drive: { recruiterId: rec.id } },
        select: { id: true },
      });
      allowed = !!link;
    }
  }
  if (!allowed) return notFound();

  const resume = await prisma.resume.findUnique({ where: { studentId } });
  if (!resume) return notFound();

  return new NextResponse(new Uint8Array(resume.data), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${resume.fileName.replace(/"/g, "")}"`,
      "Content-Length": String(resume.data.length),
      "X-Content-Type-Options": "nosniff",
      // Personal data: never cache it in a shared or browser cache.
      "Cache-Control": "private, no-store",
    },
  });
}
