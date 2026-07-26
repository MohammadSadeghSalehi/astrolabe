"use client";

import { useEffect, useState } from "react";

/**
 * Distinct visitors, counted from a salted hash of the address.
 *
 * Renders nothing at all when the count is unavailable. A counter that falls
 * back to "0" or to a spinner that never resolves is worse than no counter:
 * one states something false, the other looks broken on the page it is meant
 * to lend credibility to.
 */
export function VisitorCount() {
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/visit", { method: "POST" })
      .then((r) => r.json())
      .then((j) => live && typeof j.count === "number" && setN(j.count))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (n == null) return null;

  return (
    <p className="font-mono text-[15px]" style={{ color: "var(--ink-2)" }}>
      <span style={{ color: "var(--brass-hi)" }}>{n.toLocaleString()}</span>{" "}
      {n === 1 ? "person has" : "people have"} opened this
    </p>
  );
}
