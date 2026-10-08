import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

/**
 * Handles a stale session cookie: the JWT is still valid but its user/student
 * row no longer exists (e.g. after `prisma migrate reset`). Cookies can only
 * be cleared from a Route Handler or Server Action, not a plain page render,
 * so pages redirect() here instead of clearing the cookie themselves.
 */
export async function GET(req: NextRequest) {
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/login", req.url));
}
