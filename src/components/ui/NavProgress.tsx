"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** A thin lime bar at the top while a page change is in flight. It shows only after ~300 ms. */
export function NavProgress() {
  const pathname = usePathname();
  // The page we left. The bar shows until the path changes.
  const [from, setFrom] = useState<string | null>(null);
  const active = from !== null && from === pathname;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setFrom(window.location.pathname);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return active ? <div className="nav-progress" aria-hidden /> : null;
}
