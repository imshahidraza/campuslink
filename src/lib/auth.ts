import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";

const COOKIE_NAME = "campuslink_session";

const WEAK_SECRETS = ["dev-secret-change-me", "change-this-to-any-random-string"];

function isWeakSecret(v: string | undefined) {
  return !v || v.length < 16 || WEAK_SECRETS.includes(v);
}

/**
 * In production a weak/default JWT secret is refused outright (anyone who knows it could forge a login
 * for any account). It's checked lazily, on first use, so `next build` itself doesn't need the secret.
 * In development we only warn, so local setup stays easy.
 */
function getJwtSecret(): string {
  const v = process.env.JWT_SECRET;
  if (isWeakSecret(v)) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "JWT_SECRET is missing, too short, or still a placeholder. Set a long random value, e.g. " +
          'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
      throw new Error("Server is not configured correctly. Please contact the administrator.");
    }
    return v && v.length > 0 ? v : "dev-secret-change-me";
  }
  return v as string;
}

if (process.env.NODE_ENV !== "production" && isWeakSecret(process.env.JWT_SECRET)) {
  console.warn(
    "\n⚠️  JWT_SECRET is a placeholder. Fine for localhost, but set a long random JWT_SECRET in .env " +
      "before anyone else can reach this app (production mode refuses to start sessions without one).\n"
  );
}

export interface SessionPayload {
  userId: string;
  role: "STUDENT" | "TPO" | "RECRUITER";
  email: string;
  name: string;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
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
    return jwt.verify(token, getJwtSecret()) as SessionPayload;
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
