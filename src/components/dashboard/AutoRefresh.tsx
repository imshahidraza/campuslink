"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-reads the page from the server every few seconds while something on it is still being worked on. */
export function AutoRefresh({ active, everyMs = 8000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [active, everyMs, router]);
  return null;
}
