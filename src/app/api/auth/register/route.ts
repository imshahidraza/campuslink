import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";
import { safeErrorMessage } from "@/lib/safeError";
import { normalizePhone } from "@/lib/phone";

const base = {
  name: z.string().trim().min(2, "Please enter your full name.").max(100),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(200),
  password: z.string().min(6, "Password must be at least 6 characters.").max(200),
};

// TPO and Recruiter accounts must give a phone number (stored unverified, used as
// an alternative sign-in). Normalized so formatting differences can't create duplicates.
const phoneField = z
  .string()
  .trim()
  .min(1, "Please enter your phone number.")
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Please enter a valid phone number." });
      return z.NEVER;
    }
    return n;
  });

const schema = z.discriminatedUnion("role", [
  // Students no longer type academic data — it comes from the TPO's pending roster,
  // matched by roll number. This keeps CGPA/backlogs/program TPO-verified.
  z.object({
    role: z.literal("STUDENT"),
    ...base,
    rollNo: z.string().trim().min(1, "Please enter your roll number.").max(50),
  }),
  // First TPO for this deployment names the college (+ optional email domain for
  // student verification); every TPO after that just joins the existing one.
  z.object({
    role: z.literal("TPO"),
    ...base,
    phone: phoneField,
    collegeName: z.string().trim().max(200).optional(),
    collegeEmailDomain: z.string().trim().max(200).optional(),
  }),
  z.object({
    role: z.literal("RECRUITER"),
    ...base,
    phone: phoneField,
    companyName: z.string().trim().min(2, "Please enter your company name.").max(200),
    industry: z.string().trim().max(100).optional(),
  }),
]);

function normalizeDomain(input: string) {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^@/, "").replace(/\/.*$/, "");
}

export async function POST(req: NextRequest) {
  // Looser than login's limit — signup is a rarer action, but still worth
  // capping to stop automated mass account creation.
  const limit = checkRateLimit(`register:${clientKey(req)}`, 8, 10 * 60_000); // 8 per 10 min / IP
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many signup attempts. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }
  const data = parsed.data;

  const passwordHash = await bcrypt.hash(data.password, 10);

  try {
    const user = await prisma.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { email: data.email } })) {
        throw new Error("An account with this email already exists. Try signing in.");
      }

      const phone = data.role === "STUDENT" ? null : data.phone;
      if (phone && (await tx.user.findUnique({ where: { phone } }))) {
        throw new Error("An account with this phone number already exists. Try signing in.");
      }

      const created = await tx.user.create({
        data: { email: data.email, phone, password: passwordHash, role: data.role, name: data.name },
      });

      if (data.role === "TPO") {
        const existingCollege = await tx.college.findFirst({ orderBy: { createdAt: "asc" } });
        if (!existingCollege) {
          const name = data.collegeName?.trim();
          if (!name) throw new Error("Please enter your college's name.");
          await tx.college.create({
            data: {
              name,
              emailDomain: data.collegeEmailDomain ? normalizeDomain(data.collegeEmailDomain) : null,
            },
          });
        }
      }

      if (data.role === "STUDENT") {
        const pending = await tx.pendingStudent.findUnique({ where: { rollNo: data.rollNo.trim() } });
        if (!pending) {
          throw new Error(
            "No record found for that roll number. Ask your placement cell to add you, then try again."
          );
        }

        const college = await tx.college.findFirst({ orderBy: { createdAt: "asc" } });
        if (college?.emailDomain) {
          const emailDomain = data.email.split("@")[1]?.toLowerCase();
          if (emailDomain !== college.emailDomain) {
            throw new Error(`Please sign up with your college email (@${college.emailDomain}).`);
          }
        }

        await tx.student.create({
          data: {
            userId: created.id,
            rollNo: pending.rollNo,
            program: pending.program,
            branch: pending.branch,
            cgpa: pending.cgpa,
            backlogs: pending.backlogs,
            graduationYear: pending.graduationYear,
          },
        });
        await tx.pendingStudent.delete({ where: { id: pending.id } });
      }

      if (data.role === "RECRUITER") {
        await tx.recruiter.create({
          data: { userId: created.id, companyName: data.companyName, industry: data.industry || null },
        });
      }
      return created;
    });

    await setSessionCookie({ userId: user.id, role: user.role, email: user.email, name: user.name });
    const redirectPath = user.role === "STUDENT" ? "/student" : user.role === "TPO" ? "/tpo" : "/recruiter";
    return NextResponse.json({ ok: true, redirectPath });
  } catch (err) {
    // A unique-constraint race (two simultaneous signups, same email/roll number)
    // surfaces as a raw Prisma error, not one of our own thrown messages — give
    // it a friendly, specific response instead of falling through to the generic one.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "That email, phone number or roll number was just registered by someone else. Please try again." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 400 });
  }
}
