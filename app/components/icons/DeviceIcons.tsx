/**
 * Device-class icons for the compatibility comparison.
 *
 * Matches ScienceIcons exactly (stroke 1.75, round caps, currentColor, 24px
 * viewBox) rather than the larger 96px DeviceIllustration used on /profile —
 * one icon language per density of screen. IconSensor from ScienceIcons.tsx
 * already reads as a smartwatch and covers Apple Watch / Galaxy Watch; these
 * two fill the gap for a ring and for bilateral research actigraphy.
 */

type IconProps = {
  className?: string;
  title?: string;
};

const base = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
  width: 24,
  height: 24,
  "aria-hidden": true as const,
};

/** A finger ring, side-on — deliberately no face or strap, since the whole
 *  point on this page is that a ring has neither. */
export function IconRing({ className, title }: IconProps) {
  return (
    <svg {...base} className={className} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      <ellipse cx="12" cy="15" rx="7" ry="4.2" />
      <path d="M8.5 4 L15.5 4 L14 10.5 L10 10.5 Z" strokeLinejoin="round" />
    </svg>
  );
}

/** Two full-strength wrist bands, side by side — bilateral evidence at full
 *  opacity. Distinct from IconDegraded (ScienceIcons), which greys one band
 *  out to mean lost evidence; this pair means the opposite. */
export function IconBilateral({ className, title }: IconProps) {
  return (
    <svg {...base} className={className} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      <rect x="2.5" y="8" width="7.5" height="8" rx="2" />
      <rect x="14" y="8" width="7.5" height="8" rx="2" />
      <path d="M10 12 H14" strokeDasharray="1.5 1.8" opacity={0.7} />
    </svg>
  );
}
