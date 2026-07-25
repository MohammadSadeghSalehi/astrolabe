"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const LINKS = [
  { href: "/day", label: "Day" },
  { href: "/profile", label: "Profile" },
  { href: "/clinician", label: "Clinician" },
];

/**
 * One bar across every route.
 *
 * No hamburger: there are three links, and a drawer would hide them behind a
 * tap for no gain. They wrap onto a second line under ~380px, which is a
 * cheaper failure than a collapsed menu.
 */
export function Nav({ light = false }: { light?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      className="w-full border-b"
      style={{
        borderColor: "var(--axis)",
        background: light ? "var(--surface-light)" : "var(--surface)",
      }}
    >
      <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3 md:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Astrolabe home">
          <span
            className="inline-block h-7 w-7 shrink-0"
            style={{
              backgroundColor: "var(--brass)",
              mask: "url(/brand/astrolabe-mark.svg) center / contain no-repeat",
              WebkitMask: "url(/brand/astrolabe-mark.svg) center / contain no-repeat",
            }}
            aria-hidden
          />
          <span
            className="text-[14px] font-medium uppercase tracking-[0.14em]"
            style={{ color: "var(--brass)" }}
          >
            Astrolabe
          </span>
        </Link>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                // 44px touch target via padding, not a fixed height that would
                // fight the wrap on narrow screens.
                className="py-2 text-[16px] transition-opacity hover:opacity-100"
                style={{
                  color: active ? "var(--ink)" : "var(--ink-2)",
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
      </div>
    </nav>
  );
}
