/**
 * Generic wrist wearable — not Apple Watch, Fitbit, or any identifiable product.
 * Monoline, dark-surface native, currentColor.
 */
export function DeviceIllustration({
  className,
  size = 96,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      className={className}
      role="img"
      aria-label="Generic wrist wearable illustration"
    >
      {/* outer band — soft oval strap */}
      <path
        d="M32 22 C32 14 40 10 48 10 C56 10 64 14 64 22 V30 H32 Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <path
        d="M32 66 H64 V74 C64 82 56 86 48 86 C40 86 32 82 32 74 Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      {/* case */}
      <rect
        x="28"
        y="28"
        width="40"
        height="40"
        rx="10"
        stroke="currentColor"
        strokeWidth={1.75}
      />
      {/* face inset */}
      <rect
        x="34"
        y="34"
        width="28"
        height="28"
        rx="6"
        stroke="currentColor"
        strokeWidth={1.5}
        opacity={0.85}
      />
      {/* abstract dial — not a brand logo */}
      <circle
        cx="48"
        cy="48"
        r="7"
        stroke="currentColor"
        strokeWidth={1.5}
        opacity={0.7}
      />
      <line
        x1="48"
        y1="48"
        x2="48"
        y2="42"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <line
        x1="48"
        y1="48"
        x2="53"
        y2="50"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        opacity={0.7}
      />
      {/* side button — generic capsule, not a crown logo */}
      <path
        d="M68 44 H72 C73 44 74 45 74 46 V50 C74 51 73 52 72 52 H68"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}
