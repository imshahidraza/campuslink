import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * Serves a key person's photo, but only to someone allowed to see it:
 *  - the placement cell (TPO), always,
 *  - the recruiter who owns it,
 *  - students, only once the placement cell has approved that recruiter.
 * Everyone else gets the same "not found", so ids can't be probed.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const notFound = () => NextResponse.json({ error: "Photo not found." }, { status: 404 });

  const person = await prisma.keyPerson.findUnique({
    where: { id },
    select: { recruiter: { select: { userId: true, status: true } }, photo: true },
  });
  if (!person || !person.photo) return notFound();

  let allowed = false;
  if (session.role === "TPO") allowed = true;
  else if (session.role === "RECRUITER") allowed = person.recruiter.userId === session.userId;
  else if (session.role === "STUDENT") allowed = person.recruiter.status === "APPROVED";
  if (!allowed) return notFound();

  return new NextResponse(new Uint8Array(person.photo.data), {
    status: 200,
    headers: {
      "Content-Type": person.photo.mimeType,
      "Content-Length": String(person.photo.data.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=300",
    },
  });
}
