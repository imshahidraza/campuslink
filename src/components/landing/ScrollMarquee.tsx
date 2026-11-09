"use client";

import { useEffect, useRef } from "react";

/** Slides its content sideways as you scroll: left while scrolling down, right while scrolling up. Works on phones too. */
export function ScrollMarquee({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const speed = window.innerWidth < 768 ? 0.6 : 0.35;
    let raf = 0;

    const update = () => {
      raf = 0;
      const top = host.getBoundingClientRect().top;
      const x = -(window.innerHeight - top) * speed;
      el.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className={className} style={{ willChange: "transform" }}>
      {children}
    </div>
  );
}
