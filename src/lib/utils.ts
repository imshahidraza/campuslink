import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function readinessLabel(level: string | null | undefined): string {
  switch (level) {
    case "NOT_READY":
      return "Not Ready";
    case "DEVELOPING":
      return "Developing";
    case "READY":
      return "Ready";
    case "HIGHLY_READY":
      return "Highly Ready";
    default:
      return "Not yet analyzed";
  }
}

const LABEL_OVERRIDES: Record<string, string> = {
  ELIGIBLE: "Applied",
  REJECTED: "Not selected",
};

/** Plain sentence-case label for any stage or status value, e.g. IN_PROGRESS -> "In progress". */
export function stageLabel(stage: string): string {
  if (LABEL_OVERRIDES[stage]) return LABEL_OVERRIDES[stage];
  const words = stage.toLowerCase().split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** After an offer is accepted the journey shows the documents step, then joining. */
export function journeyLabel(stage: string, documentsVerified: boolean): string {
  if (stage === "OFFER_ACCEPTED") return documentsVerified ? "Documents verified" : "Documents verification pending";
  return stageLabel(stage);
}
