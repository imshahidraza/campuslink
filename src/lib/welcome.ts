import { cookies } from "next/headers";

/**
 * A new random number is saved at every sign-in (login or sign-up). The Overview page turns it into one warm
 * sentence, so the sentence changes each time someone signs in but does not flicker while they browse.
 * It is not a secret and gives no access to anything.
 */
const WELCOME_COOKIE = "campuslink_welcome";

export async function setWelcomeCookie() {
  const store = await cookies();
  store.set(WELCOME_COOKIE, String(Math.floor(Math.random() * 10000)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getWelcomeNumber(): Promise<number> {
  const store = await cookies();
  const n = Number(store.get(WELCOME_COOKIE)?.value);
  return Number.isFinite(n) ? n : 0;
}
