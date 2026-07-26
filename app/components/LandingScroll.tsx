"use client";

import {
  useEffect,
  useRef,
  type ReactNode,
} from "react";

/**
 * Landing scroll layer.
 *
 * - Progress rail (brass) at top of viewport
 * - CSS vars --land-scroll (0..1) and --land-y (px) for parallax backgrounds
 * - IntersectionObserver reveals for [data-reveal]
 * - Reduced motion: no progress animation tween, reveals snap in immediately
 *
 * Revert: remove this wrapper from page.tsx and the related CSS block.
 */
export function LandingScroll({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const onScroll = () => {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const y = window.scrollY;
      const p = Math.min(1, Math.max(0, y / max));
      root.style.setProperty("--land-scroll", String(p));
      root.style.setProperty("--land-y", `${y}px`);
      // Hero plate parallax (capped so it never feels floaty)
      const plate = root.querySelector<HTMLElement>("[data-parallax-plate]");
      if (plate && !reduced) {
        const shift = Math.min(80, y * 0.18);
        plate.style.transform = `translate3d(0, ${shift}px, 0)`;
      }
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    // Reveal sections as they enter
    const nodes = root.querySelectorAll<HTMLElement>("[data-reveal]");
    if (reduced) {
      nodes.forEach((n) => n.classList.add("is-revealed"));
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              (e.target as HTMLElement).classList.add("is-revealed");
              io.unobserve(e.target);
            }
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
      );
      nodes.forEach((n) => io.observe(n));
      return () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        io.disconnect();
      };
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div ref={rootRef} className="landing-scroll">
      {/* Fixed scroll progress — pure CSS width driven by --land-scroll */}
      <div className="land-progress" aria-hidden>
        <div className="land-progress__bar" />
      </div>
      {/* Ambient field that drifts with scroll (SVG plate, not a fake UI) */}
      <div className="land-field" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/hero-field.svg" alt="" />
      </div>
      {children}
    </div>
  );
}

/** Instrument rule between major landing sections. */
export function PlateRule() {
  return (
    <div className="land-rule" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/rule-plate.svg" alt="" />
    </div>
  );
}

/** Generic device strip — no brand claims, pure form language. */
export function DeviceStrip() {
  return (
    <div
      className="land-devices"
      data-reveal
      aria-label="Form factors the product is designed around"
    >
      <p className="land-devices__label">
        Designed around research-grade bilateral wrists — not a consumer
        partnership claim
      </p>
      <div className="land-devices__row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/render-watch.png" alt="" width={140} height={170} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/render-band.png" alt="" width={140} height={170} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/render-ring.png" alt="" width={140} height={170} />
      </div>
    </div>
  );
}
