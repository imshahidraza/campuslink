"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Phone-only: cards below the fold start slightly lowered and faded, then ease up into place
 * once as you scroll down to them (each card plays once). Cards already on screen are left
 * alone so nothing flashes. Desktop is untouched, and the user's "reduce motion" setting wins.
 * Without JavaScript nothing is hidden, so content never depends on this running.
 */
const PHONE = "(max-width: 767px), (hover: none)";

export function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (!window.matchMedia(PHONE).matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal], .card-glass"));
    const vh = window.innerHeight;
    const pending = targets.filter((el) => el.getBoundingClientRect().top > vh * 0.92);
    pending.forEach((el) => el.classList.add("reveal-pre"));

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        visible.forEach((entry, i) => {
          const el = entry.target as HTMLElement;
          // Cards that appear together (a row) rise in a gentle sequence.
          el.style.transitionDelay = `${Math.min(i, 4) * 70}ms`;
          el.classList.add("reveal-in");
          io.unobserve(el);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    pending.forEach((el) => io.observe(el));

    return () => {
      io.disconnect();
      pending.forEach((el) => {
        el.classList.remove("reveal-pre", "reveal-in");
        el.style.transitionDelay = "";
      });
    };
  }, [pathname]);

  return null;
}
