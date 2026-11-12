/**
 * For routes that accept uploads: if the browser says which site the request came from, it must be this site.
 * (Login cookies are also SameSite=Lax, so this is a second lock, not the only one.)
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
