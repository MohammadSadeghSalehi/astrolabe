"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

/** Four product routes — Home is explicit so the landing is always one tap away. */
const LINKS = [
  { href: "/", label: "Home" },
  { href: "/day", label: "Live demo" },
  { href: "/devices", label: "Devices" },
  { href: "/join", label: "Try it" },
  { href: "/clinician", label: "Clinician" },
];

/**
 * One bar across every route.
 *
 * Desktop: mark + wordmark left, four links right.
 * Mobile: plain <details> disclosure — not a hamburger drawer.
 */
export function Nav({ light = false }: { light?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const ink = light ? "var(--ink-light)" : "var(--ink)";
  const ink2 = light ? "var(--ink-2-light)" : "var(--ink-2)";
  const surface = light ? "var(--surface-light)" : "var(--surface)";


  return (
    <nav
      className={`glass-bar sticky top-0 z-50 w-full${light ? " nav-light" : ""}`}
    >
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-x-6 px-5 py-3 md:px-6">
        <Link
          href="/"
          className="flex min-h-[44px] items-center gap-2.5"
          aria-label="Astrolabe home"
          onClick={() => setOpen(false)}
        >
          <span
            className="inline-block h-8 w-8 shrink-0 md:h-9 md:w-9"
            style={{
              backgroundColor: "var(--brass)",
              mask: "url(/brand/astrolabe-mark-v2.svg) center / contain no-repeat",
              WebkitMask:
                "url(/brand/astrolabe-mark-v2.svg) center / contain no-repeat",
            }}
            aria-hidden
          />
          <span
            className="text-[19px] font-medium uppercase tracking-[0.2em] md:text-[22px]"
            style={{ color: "var(--brass)" }}
          >
            Astrolabe
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-x-1 sm:flex">
          {LINKS.map((l) => {
            const active =
              l.href === "/"
                ? pathname === "/"
                : pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className="inline-flex min-h-[44px] items-center px-3 text-[16px] transition-opacity hover:opacity-100"
                style={{
                  color: active ? ink : ink2,
                  borderBottom: active
                    ? "2px solid var(--brass)"
                    : "2px solid transparent",
                }}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        {/* Mobile: plain disclosure, four links */}
        <details
          className="relative sm:hidden"
          open={open}
          onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary
            className="flex min-h-[44px] min-w-[44px] cursor-pointer list-none items-center justify-center rounded-md border px-3 text-[16px] marker:content-none [&::-webkit-details-marker]:hidden"
            style={{ borderColor: "var(--axis)", color: ink }}
          >
            Menu
          </summary>
          <div
            className="absolute right-0 z-40 mt-2 min-w-[11rem] rounded-md border py-1 shadow-lg"
            style={{
              borderColor: "var(--axis)",
              background: surface,
            }}
          >
            {LINKS.map((l) => {
              const active =
                l.href === "/"
                  ? pathname === "/"
                  : pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className="flex min-h-[44px] items-center px-4 text-[16px]"
                  style={{
                    color: active ? ink : ink2,
                    background: active ? "var(--page)" : "transparent",
                  }}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
        </details>
      </div>
    </nav>
  );
}
