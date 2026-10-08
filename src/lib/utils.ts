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

export function stageLabel(stage: string): string {
  return stage
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
