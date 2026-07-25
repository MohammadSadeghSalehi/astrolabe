"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Shared reduced-motion preference. Mirrors the TremorRow pattern so every
 * animated number (sensor toggle, etc.) takes the same instant-cut path when
 * the OS asks for reduced motion.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia(QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () =>
      typeof window !== "undefined"
        ? window.matchMedia(QUERY).matches
        : false,
    () => false,
  );
}
