"use client";

import { useEffect } from "react";

/**
 * Drives every element marked with [data-parallax] on the page.
 *   data-speed  vertical scroll parallax. Positive = drifts slower (feels further back),
 *               negative = drifts faster (feels closer to the viewer).
 *   data-x      horizontal drift while scrolling.
 *   data-rotate degrees of rotation per 100px of scroll offset.
 *   data-depth  pixels of mouse-follow shift (bigger = closer to the viewer).
 * Elements marked [data-tilt] get a 3D card tilt toward the pointer.
 */
export function ParallaxController() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Phones/touch: the pointer-follow, tilt and scroll-parallax feel janky there, so the
    // decorative layers stay still and cards use the scroll-reveal instead (ScrollReveal.tsx).
    if (window.matchMedia("(max-width: 767px), (hover: none)").matches) return;

    type Item = { el: HTMLElement; speed: number; x: number; rotate: number; depth: number; base: number };
    let items: Item[] = [];
    let mx = 0, my = 0, cx = 0, cy = 0;
    let raf = 0;

    const measure = () => {
      const els = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
      // Clear all transforms first so nested layers don't skew each other's measurements.
      els.forEach((el) => (el.style.transform = "none"));
      items = els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          el,
          speed: parseFloat(el.dataset.speed || "0"),
          x: parseFloat(el.dataset.x || "0"),
          rotate: parseFloat(el.dataset.rotate || "0"),
          depth: parseFloat(el.dataset.depth || "0"),
          base: r.top + window.scrollY + r.height / 2,
        };
      });
    };

    const tick = () => {
      cx += (mx - cx) * 0.07;
      cy += (my - cy) * 0.07;
      const center = window.scrollY + window.innerHeight / 2;
      for (const it of items) {
        const off = it.base - center;
        const tx = cx * it.depth + off * it.x;
        const ty = off * it.speed + cy * it.depth;
        const rot = (off / 100) * it.rotate;
        it.el.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = (e.clientY / window.innerHeight) * 2 - 1;
    };

    // 3D tilt on cards
    const tilts = Array.from(document.querySelectorAll<HTMLElement>("[data-tilt]"));
    const cleanups: (() => void)[] = [];
    tilts.forEach((el) => {
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateX(${(-py * 8).toFixed(2)}deg) rotateY(${(px * 10).toFixed(2)}deg)`;
      };
      const leave = () => (el.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)");
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", leave);
      cleanups.push(() => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerleave", leave);
      });
    });

    measure();
    raf = requestAnimationFrame(tick);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("resize", measure);
    window.addEventListener("load", measure);
    document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", measure);
      window.removeEventListener("load", measure);
      ro.disconnect();
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
