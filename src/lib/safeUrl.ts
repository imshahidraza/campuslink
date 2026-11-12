/**
 * Links typed by users (company website, a person's LinkedIn or profile link) are checked here before they are
 * saved, and checked again before they are shown as a clickable link. Only plain web addresses (http or https)
 * pass. "javascript:...", "data:..." and similar can never become a link, whatever is stored in the database.
 * The server never opens these links itself, so there is no outside request to abuse.
 */

const MAX_URL_LENGTH = 300;
const DANGEROUS_SCHEME = /^(javascript|data|vbscript|file|mailto|tel|blob|about):/i;

export type UrlCheck = { ok: true; url: string | null } | { ok: false; message: string };

/** For forms: empty is fine (no link). Anything else must be a real web address. "example.com" becomes https://example.com/. */
export function parseWebUrl(input: unknown, label = "link"): UrlCheck {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return { ok: true, url: null };
  const bad: UrlCheck = { ok: false, message: `Please enter a valid ${label}, for example https://www.example.com` };
  if (raw.length > MAX_URL_LENGTH || /\s/.test(raw)) return bad;
  if (DANGEROUS_SCHEME.test(raw)) return bad;
  if (raw.includes("://") && !/^https?:\/\//i.test(raw)) return bad;

  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return bad;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return bad;
  if (parsed.username || parsed.password) return bad;
  // A real site has a dot in its name ("localhost" and bare words are not links to show students).
  if (!parsed.hostname.includes(".") || parsed.hostname.endsWith(".")) return bad;
  return { ok: true, url: parsed.toString() };
}

/** For showing: returns the address only if it is a safe http(s) link, otherwise null (render plain text instead). */
export function safeHref(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const r = parseWebUrl(stored);
  return r.ok ? r.url : null;
}

/** "https://www.example.com/about/" -> "www.example.com/about" for display. */
export function displayUrl(href: string): string {
  return href.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}
