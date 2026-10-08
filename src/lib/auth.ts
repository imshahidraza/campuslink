import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const COOKIE_NAME = "campuslink_session";

if (JWT_SECRET === "dev-secret-change-me") {
  console.warn(
    "\n⚠️  JWT_SECRET is still the default placeholder. Anyone who knows this value can forge a " +
      "login session for any account. Set a random JWT_SECRET in .env before this app is reachable " +
      "by anyone other than you on localhost.\n"
  );
}

export interface SessionPayload {
  userId: string;
  role: "STUDENT" | "TPO" | "RECRUITER";
  email: string;
  name: string;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = signSession(payload);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * For student pages: redirects to /login if there's no session, and redirects
 * to the cookie-clearing route if the session is valid but stale (its
 * student record was deleted — e.g. after a DB reset) instead of crashing
 * with a Prisma "record not found" error.
 */
export async function requireStudentOrRedirect() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "STUDENT") redirect("/login");
  const student = await prisma.student.findUnique({ where: { userId: session.userId } });
  if (!student) redirect("/api/auth/clear-session");
  return { session, student };
}

/** Same idea as requireStudentOrRedirect, for recruiter pages. */
export async function requireRecruiterOrRedirect() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "RECRUITER") redirect("/login");
  const recruiter = await prisma.recruiter.findUnique({ where: { userId: session.userId } });
  if (!recruiter) redirect("/api/auth/clear-session");
  return { session, recruiter };
}

const ROLE_LABEL: Record<SessionPayload["role"], string> = {
  STUDENT: "a Student",
  TPO: "Placement Cell (TPO)",
  RECRUITER: "a Recruiter",
};

/**
 * Throws a clear, specific error for server actions gated to one role —
 * "you're signed out" vs "you're signed in as the wrong role" (usually
 * because a different account logged in in another tab and replaced this
 * browser's shared session cookie) — instead of an opaque "Not authorized."
 */
export function assertRole(session: SessionPayload | null, expected: SessionPayload["role"]): asserts session is SessionPayload {
  if (!session) {
    throw new Error(`You've been signed out. Please sign in again as ${ROLE_LABEL[expected]}.`);
  }
  if (session.role !== expected) {
    throw new Error(
      `You're currently signed in as ${ROLE_LABEL[session.role]}, not ${ROLE_LABEL[expected]}. ` +
        "If you have another tab open with a different account, that login replaced this one — sign out and back in with the right account."
    );
  }
}

/** Like assertRole, but for actions allowed to more than one role (e.g. TPO or Recruiter). */
export function assertAnyRole(
  session: SessionPayload | null,
  expected: SessionPayload["role"][]
): asserts session is SessionPayload {
  if (!session) {
    throw new Error(`You've been signed out. Please sign in again as ${expected.map((r) => ROLE_LABEL[r]).join(" or ")}.`);
  }
  if (!expected.includes(session.role)) {
    throw new Error(
      `You're currently signed in as ${ROLE_LABEL[session.role]}, which can't do this. ` +
        "If you have another tab open with a different account, that login replaced this one — sign out and back in with the right account."
    );
  }
}

/** Loads the session plus the related Student/Recruiter row, if any. */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  if (session.role === "STUDENT") {
    const student = await prisma.student.findUnique({ where: { userId: session.userId } });
    return { session, student, recruiter: null };
  }
  if (session.role === "RECRUITER") {
    const recruiter = await prisma.recruiter.findUnique({ where: { userId: session.userId } });
    return { session, student: null, recruiter };
  }
  return { session, student: null, recruiter: null };
}
