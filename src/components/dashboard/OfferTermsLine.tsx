import { Badge } from "@/components/ui/Card";
import { offerSummaryParts, type OfferView } from "@/lib/offerRules";

/** "Full-time · 12 LPA · 12-month bond · Joining 5 Jan 2027". Works in server and client components. */
export function OfferTermsLine({ offer, className }: { offer: OfferView; className?: string }) {
  const parts = offerSummaryParts(offer);
  return <p className={className ?? "text-xs text-muted"}>{parts.join(" · ")}</p>;
}

const typeTone = { INTERNSHIP: "warning", PPO: "brand", FULL_TIME: "neutral" } as const;

export function OfferTypeBadge({ type }: { type: string | null | undefined }) {
  const t = type === "INTERNSHIP" || type === "PPO" ? type : "FULL_TIME";
  const label = t === "FULL_TIME" ? "Full-time" : t === "PPO" ? "PPO" : "Internship";
  return <Badge tone={typeTone[t]}>{label}</Badge>;
}
