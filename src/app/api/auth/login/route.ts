import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";
import { safeErrorMessage } from "@/lib/safeError";

// Deliberately the SAME message for "no such account" and "wrong password" —
// telling them apart lets an attacker enumerate which emails/roll numbers
// have accounts. A role mismatch is the one case we still name specifically,
// since that's about picking the right tab, not a credential guess.
const INVALID_CREDENTIALS = "Invalid credentials. Please check and try again.";

export async function POST(req: NextRequest) {
  const limit = checkRateLimit(`login:${clientKey(req)}`, 10, 60_000); // 10 attempts/min/IP
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const role = body.role as "STUDENT" | "TPO" | "RECRUITER" | undefined;
    const password = body.password as string | undefined;

    if (!password) {
      return NextResponse.json({ error: "Password is required." }, { status: 400 });
    }

    let user;

    if (role === "STUDENT") {
      // Students log in with roll number + password, not email.
      const rollNo = typeof body.rollNo === "string" ? body.rollNo.trim() : "";
      if (!rollNo) {
        return NextResponse.json({ error: "Roll number is required." }, { status: 400 });
      }
      const student = await prisma.student.findUnique({ where: { rollNo }, include: { user: true } });
      user = student?.user;
    } else {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!email) {
        return NextResponse.json({ error: "Email is required." }, { status: 400 });
      }
      user = (await prisma.user.findUnique({ where: { email } })) ?? undefined;
    }

    if (!user) {
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }

    if (role && user.role !== role) {
      const label = user.role === "TPO" ? "Placement Cell (TPO)" : user.role === "STUDENT" ? "Student" : "Recruiter";
      return NextResponse.json(
        { error: `This account is registered as ${label}. Go back and choose that role.` },
        { status: 403 }
      );
    }

    await setSessionCookie({ userId: user.id, role: user.role, email: user.email, name: user.name });

    const redirectPath = user.role === "STUDENT" ? "/student" : user.role === "TPO" ? "/tpo" : "/recruiter";
    return NextResponse.json({ ok: true, redirectPath });
  } catch (err) {
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}
