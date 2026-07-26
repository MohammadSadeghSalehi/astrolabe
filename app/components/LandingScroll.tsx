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
      // Field stays present after the hero — peaks mid-page, never fights type.
      // Hero ~0.09, mid ~0.16, end ~0.11.
      const fieldOp = 0.09 + Math.sin(p * Math.PI) * 0.07 + p * 0.02;
      root.style.setProperty("--land-field-op", String(fieldOp));
      // Mid-field (instrument grid) fades *in* as you leave the hero.
      const midOp = Math.min(0.55, 0.08 + p * 0.7);
      root.style.setProperty("--land-mid-op", String(midOp));
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
      {/* Dual ambient field — hero plate geometry + mid-page instrument grid */}
      <div className="land-field" aria-hidden>
        <div className="land-field__layer land-field__layer--a">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/hero-field.svg" alt="" />
        </div>
        <div className="land-field__layer land-field__layer--b">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/hero-field.svg" alt="" />
        </div>
        <div className="land-field__layer land-field__layer--mid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mid-field.svg" alt="" />
        </div>
        {/* Soft brass / verdigris washes so long sections never read as a void */}
        <div className="land-field__glow land-field__glow--brass" />
        <div className="land-field__glow land-field__glow--verd" />
        <div className="land-field__vignette" />
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

const SPONSORS: {
  name: string;
  href: string;
  logo: string;
  /** Logo intrinsic aspect — keeps marks from stretching in the badge. */
  aspect: "mark" | "wide";
}[] = [
  {
    name: "Vercel",
    href: "https://vercel.com",
    logo: "/brand/sponsors/vercel.svg",
    aspect: "mark",
  },
  {
    name: "Supabase",
    href: "https://supabase.com",
    logo: "/brand/sponsors/supabase.svg",
    aspect: "mark",
  },
  {
    name: "ElevenLabs",
    href: "https://elevenlabs.io",
    logo: "/brand/sponsors/elevenlabs.svg",
    aspect: "mark",
  },
  {
    name: "Anthropic",
    href: "https://www.anthropic.com",
    logo: "/brand/sponsors/anthropic.svg",
    aspect: "wide",
  },
  {
    name: "OpenAI",
    href: "https://openai.com",
    logo: "/brand/sponsors/openai.svg",
    aspect: "mark",
  },
];

/**
 * Footer-style sponsor credits. Tools used in this build — not partnerships.
 * Logos only (name stays in aria-label for assistive tech).
 */
export function SponsorStrip() {
  return (
    <footer className="land-sponsors" data-reveal>
      <div className="land-sponsors__inner">
        <p className="land-sponsors__kicker">Built with</p>
        <p className="land-sponsors__note">
          Tools used in this hackathon build — not product partnerships or
          endorsements.
        </p>
        <ul className="land-sponsors__row">
          {SPONSORS.map((s) => (
            <li key={s.name}>
              <a
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="land-sponsor-badge"
                aria-label={s.name}
                title={s.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.logo}
                  alt=""
                  className={
                    s.aspect === "wide"
                      ? "land-sponsor-badge__logo land-sponsor-badge__logo--wide"
                      : "land-sponsor-badge__logo"
                  }
                />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
