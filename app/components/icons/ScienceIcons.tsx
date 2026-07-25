/**
 * Monoline science-section icons.
 * Match the astrolabe mark: stroke 1.75, round caps, currentColor, legible at 24px.
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

/** Wrist band / sensor. */
export function IconSensor({ className, title }: IconProps) {
  return (
    <svg {...base} className={className} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      {/* band */}
      <rect x="5" y="9" width="14" height="7" rx="2.5" />
      {/* face */}
      <rect x="9" y="10.5" width="6" height="4" rx="1" />
      {/* strap tips */}
      <path d="M7 9 V7.5 M17 9 V7.5 M7 16 V17.5 M17 16 V17.5" />
    </svg>
  );
}

/** Two waveforms — slow movement band + fast tremor band. */
export function IconFrequency({ className, title }: IconProps) {
  return (
    <svg {...base} className={className} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      {/* slow / movement */}
      <path d="M3 9 C5 9 5 5 7 5 C9 5 9 13 11 13 C13 13 13 9 15 9 C17 9 17 11 19 11 C20.5 11 21 9 21 9" />
      {/* fast / tremor */}
      <path d="M3 18 L5 15 L7 19 L9 14 L11 19 L13 15 L15 19 L17 14 L19 18 L21 16" />
    </svg>
  );
}

/** Point inside a bracketed interval (calibrated CI). */
export function IconInterval({ className, title }: IconProps) {
  return (
    <svg {...base} className={className} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      <path d="M6 6 V18 M6 6 H9 M6 18 H9" />
      <path d="M18 6 V18 M18 6 H15 M18 18 H15" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Dashed gap — refusal / abstention as absence. */
export function IconRefusal({ className, title }: IconProps) {
  return (
    <svg {...base} className={className} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      <line x1="3" y1="12" x2="8" y2="12" />
      <line x1="16" y1="12" x2="21" y2="12" />
      <rect
        x="9"
        y="6"
        width="6"
        height="12"
        rx="1"
        strokeDasharray="3 2.5"
      />
    </svg>
  );
}

/** Two sensor bands; one greyed — degraded evidence. */
export function IconDegraded({ className, title }: IconProps) {
  return (
    <svg {...base} className={className} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      <rect x="3" y="5" width="8" height="14" rx="2" opacity={1} />
      <rect
        x="13"
        y="5"
        width="8"
        height="14"
        rx="2"
        opacity={0.35}
        strokeDasharray="3 2"
      />
      <path d="M5.5 12 H8.5" opacity={1} />
      <path d="M15.5 12 H18.5" opacity={0.35} />
    </svg>
  );
}

/** Scale with strike-through — not claimed. */
export function IconNotClaimed({ className, title }: IconProps) {
  return (
    <svg {...base} className={className} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      {/* diverging scale ticks */}
      <line x1="4" y1="14" x2="20" y2="14" />
      <line x1="4" y1="11" x2="4" y2="17" />
      <line x1="8" y1="12" x2="8" y2="16" />
      <line x1="12" y1="10" x2="12" y2="18" />
      <line x1="16" y1="12" x2="16" y2="16" />
      <line x1="20" y1="11" x2="20" y2="17" />
      {/* strike */}
      <line x1="5" y1="7" x2="19" y2="19" />
    </svg>
  );
}

export const SCIENCE_ICONS = {
  sensor: IconSensor,
  frequency: IconFrequency,
  interval: IconInterval,
  refusal: IconRefusal,
  degraded: IconDegraded,
  "not-claimed": IconNotClaimed,
} as const;

export type ScienceIconId = keyof typeof SCIENCE_ICONS;
