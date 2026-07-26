import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export function Callout({ big, sub }: { big: string; sub?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const y = interpolate(enter, [0, 1], [18, 0]);
  const parts = big.split(/(\d+(?:\.\d+)?%?)/g);

  return (
    <div className="callout-scrim">
      <div
        className="callout"
        style={{ opacity, transform: `translateY(${y}px)` }}
      >
        <div className="callout-big">
          {parts.map((part, index) =>
            /\d/.test(part) ? (
              <span className="callout-number" key={`${part}-${index}`}>
                {part}
              </span>
            ) : (
              <span key={`${part}-${index}`}>{part}</span>
            ),
          )}
        </div>
        {sub ? <div className="callout-sub">{sub}</div> : null}
      </div>
    </div>
  );
}
