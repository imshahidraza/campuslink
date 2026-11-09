import { cn } from "@/lib/utils";

const SIZES = { sm: 18, md: 40, lg: 64 } as const;

/** Three lime rings. Pure CSS, no JavaScript. Appears only after about 300 ms. */
export function Loader({
  size = "md",
  onLight = false,
  delayed = true,
  className,
}: {
  size?: keyof typeof SIZES;
  onLight?: boolean;
  delayed?: boolean;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("clink-loader", onLight && "loader-on-light", delayed && "loader-delay", className)}
      style={{ ["--loader-size" as string]: `${SIZES[size]}px` }}
    >
      <span className="ring ring-1" />
      <span className="ring ring-2" />
      <span className="ring ring-3" />
    </span>
  );
}

/** Small spinner plus a note, used on buttons that call the AI. */
export function AiWaitNote({ show, label = "This can take up to a minute." }: { show: boolean; label?: string }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <Loader size="sm" onLight />
      {label}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

/** Page placeholder: a heading line and a few cards. Used by every loading.tsx. */
export function PageSkeleton() {
  return (
    <div>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 mt-3" />
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64 mt-5" />
      <div className="flex justify-center mt-8">
        <Loader size="lg" onLight />
      </div>
    </div>
  );
}
