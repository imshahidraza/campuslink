import { User } from "lucide-react";
import { SafeLink } from "@/components/ui/SafeLink";
import type { KeyPersonView } from "@/lib/keyPeopleShared";

/** "LinkedIn" for linkedin.com links, otherwise "View profile". */
function linkLabel(href: string): string {
  try {
    const host = new URL(href).hostname.toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com") ? "LinkedIn profile" : "View profile";
  } catch {
    return "View profile";
  }
}

/** Read-only display of a company's key people (photo, role, name, profile link). Used by the TPO and student pages. */
export function KeyPeopleStrip({ people, className }: { people: KeyPersonView[]; className?: string }) {
  if (people.length === 0) return null;
  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted uppercase tracking-wide">Key people</p>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {people.map((p) => (
          <div key={p.id} className="flex items-center gap-3 sm:flex-col sm:text-center sm:gap-2">
            {p.hasPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/key-people/${p.id}/photo?v=${p.photoVersion}`}
                alt={`${p.name}, ${p.role}`}
                className="h-16 w-16 shrink-0 rounded-full object-cover border border-border-soft bg-surface"
              />
            ) : (
              <span className="h-16 w-16 shrink-0 rounded-full bg-surface-2 text-muted flex items-center justify-center" aria-hidden>
                <User className="h-7 w-7" />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink break-words">{p.name}</p>
              <p className="text-xs text-muted break-words">{p.role}</p>
              {p.profileUrl && <SafeLink href={p.profileUrl} label={linkLabel(p.profileUrl)} className="text-xs" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
