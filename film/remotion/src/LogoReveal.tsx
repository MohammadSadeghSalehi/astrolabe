import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export function LogoReveal() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = interpolate(frame, [0, 18], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sweep = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 14, stiffness: 90 },
  });
  const angle = interpolate(sweep, [0, 1], [-40, 0]);
  const word = interpolate(frame, [16, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tagline = interpolate(frame, [28, 38], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div className="logo-reveal">
      <svg viewBox="0 0 32 32" className="logo-reveal-mark">
        <g
          stroke="#C8963E"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <path
            d="M7 21 A10 10 0 1 1 25 19"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={draw}
          />
          <path
            d="M11 18.5 A5.5 5.5 0 1 1 21 17"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={draw}
          />
          <g style={{ transformOrigin: "16px 16px", transform: `rotate(${angle}deg)` }}>
            <line x1="6" y1="24" x2="26" y2="8" stroke="#EFD39B" strokeWidth="2.25" />
          </g>
          <circle
            cx="16"
            cy="16"
            r="1.35"
            fill="#C8963E"
            stroke="none"
            opacity={sweep > 0.86 ? 1 : 0}
          />
        </g>
      </svg>
      <div>
        <div
          className="logo-reveal-word"
          style={{ opacity: word, letterSpacing: `${0.02 + word * 0.26}em` }}
        >
          ASTROLABE
        </div>
        <div className="logo-reveal-tagline" style={{ opacity: tagline }}>
          read the hours you couldn&apos;t record
        </div>
      </div>
    </div>
  );
}
