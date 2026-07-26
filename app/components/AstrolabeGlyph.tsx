/**
 * The rete, built rather than borrowed.
 *
 * docs/DESIGN.md names the motif directly: "concentric circles, crossed axes,
 * one bright pointer." An astrolabe's rete is the rotating star-map — pierced
 * pointers over a fixed plate — and a hero background drawn from the product's
 * own name and instrument is a signature element in the sense the brief means,
 * not a stock illustration standing in for one.
 *
 * Purely decorative (aria-hidden), so it carries no information the way the
 * data-driven HeroStrip beside it does. Its job is atmosphere: quiet enough
 * that hero text stays the loudest thing on the page.
 */

const RING_RADII = [96, 148, 196] as const;
const TICK_COUNT = 48;
const MAJOR_TICK_EVERY = 6;

function ticks(radius: number, cx: number, cy: number) {
  return Array.from({ length: TICK_COUNT }, (_, i) => {
    const angle = (i / TICK_COUNT) * Math.PI * 2;
    const major = i % MAJOR_TICK_EVERY === 0;
    const len = major ? 10 : 5;
    const x1 = cx + Math.cos(angle) * radius;
    const y1 = cy + Math.sin(angle) * radius;
    const x2 = cx + Math.cos(angle) * (radius - len);
    const y2 = cy + Math.sin(angle) * (radius - len);
    return { x1, y1, x2, y2, major, key: `${radius}-${i}` };
  });
}

export function AstrolabeGlyph({ className }: { className?: string }) {
  const cx = 220;
  const cy = 220;

  return (
    <svg
      viewBox="0 0 440 440"
      fill="none"
      // No width/height attributes — the caller's className sizes it via CSS
      // (e.g. Tailwind `w-[340px] md:w-[480px]`), so it can bleed off a hero
      // at a different size per breakpoint without a JS resize listener.
      className={className}
      aria-hidden="true"
    >
      {/* Fixed plate — outer degree scale, does not rotate */}
      <g stroke="var(--brass)" strokeWidth={1} opacity={0.5}>
        <circle cx={cx} cy={cy} r={RING_RADII[2]} />
        {ticks(RING_RADII[2], cx, cy).map((t) => (
          <line
            key={t.key}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            opacity={t.major ? 0.9 : 0.4}
          />
        ))}
      </g>

      {/* Crossed axes — the horizon/meridian pair */}
      <g stroke="var(--brass)" strokeWidth={1} opacity={0.3}>
        <line x1={cx - RING_RADII[2]} y1={cy} x2={cx + RING_RADII[2]} y2={cy} />
        <line x1={cx} y1={cy - RING_RADII[2]} x2={cx} y2={cy + RING_RADII[2]} />
      </g>

      {/* The rete itself — inner rings + pointer, this is what rotates */}
      <g
        className="astro-rete-spin"
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={RING_RADII[0]}
          stroke="var(--brass)"
          strokeWidth={1}
          opacity={0.55}
        />
        <circle
          cx={cx}
          cy={cy}
          r={RING_RADII[1]}
          stroke="var(--brass)"
          strokeWidth={1}
          opacity={0.4}
        />

        {/* Three pierced sighting pointers, at unequal angles — a real rete
            is asymmetric star geometry, not a clock face. */}
        {[18, 132, 251].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const tipR = RING_RADII[1] - 6;
          const tx = cx + Math.cos(rad) * tipR;
          const ty = cy + Math.sin(rad) * tipR;
          return (
            <g key={deg}>
              <line
                x1={cx}
                y1={cy}
                x2={tx}
                y2={ty}
                stroke="var(--brass)"
                strokeWidth={1}
                opacity={0.35}
              />
              <circle cx={tx} cy={ty} r={3} fill="var(--brass)" opacity={0.5} />
            </g>
          );
        })}

        {/* One bright pointer — the sighting arm, per the brief */}
        <line
          x1={cx}
          y1={cy}
          x2={cx}
          y2={cy - RING_RADII[2] + 4}
          stroke="var(--brass-hi)"
          strokeWidth={1.5}
        />
        <circle cx={cx} cy={cy - RING_RADII[2] + 4} r={4} fill="var(--brass-hi)" />
      </g>

      {/* Pivot */}
      <circle cx={cx} cy={cy} r={3} fill="var(--brass-hi)" />
    </svg>
  );
}
