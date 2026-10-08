"use client";

import { useEffect, useRef } from "react";

/** A single trailing ring cursor that grows over links/buttons. Desktop pointers only. */
export function CustomCursor() {
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced || !ring.current) return;

    const r = ring.current;
    let x = -100, y = -100, rx = -100, ry = -100, scale = 1, raf = 0;

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      const hot = (e.target as HTMLElement | null)?.closest("a, button, [data-cursor]");
      scale = hot ? 1.9 : 1;
      r.style.opacity = "1";
    };
    const onDown = () => (scale = 0.7);
    const onUp = () => (scale = 1);
    const tick = () => {
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      r.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%) scale(${scale})`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  // mix-blend-difference keeps the ring visible on both dark and light sections.
  return (
    <div
      ref={ring}
      className="pointer-events-none fixed left-0 top-0 z-[100] h-9 w-9 rounded-full border border-white opacity-0 mix-blend-difference transition-[opacity] duration-300"
      style={{ willChange: "transform", isolation: "isolate" }}
    />
  );
}
