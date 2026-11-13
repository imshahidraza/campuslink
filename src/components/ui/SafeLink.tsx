import { safeHref, displayUrl } from "@/lib/safeUrl";
import { cn } from "@/lib/utils";

/**
 * A blue, underlined link that opens in a new tab. The address is checked again here, so a stored value
 * that is not a plain http(s) link is shown as ordinary text and can never run as a script.
 */
export function SafeLink({ href, label, className }: { href: string | null | undefined; label?: string; className?: string }) {
  const safe = safeHref(href);
  if (!safe) return href ? <span className={className}>{label ?? href}</span> : null;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={cn("text-blue-600 underline underline-offset-2 hover:text-blue-800 break-all", className)}
    >
      {label ?? displayUrl(safe)}
    </a>
  );
}
