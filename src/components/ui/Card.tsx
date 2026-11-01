import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-reveal
      className={cn(
        "rounded-2xl border border-border-soft bg-white shadow-sm shadow-black/[0.02]",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 pt-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("text-sm font-semibold text-ink", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted",
  brand: "bg-brand-100 text-brand-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        badgeTones[tone],
        className
      )}
      {...props}
    />
  );
}
