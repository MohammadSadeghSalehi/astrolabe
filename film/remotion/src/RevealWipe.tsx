import type { TransitionPresentation } from "@remotion/transitions";
import { AbsoluteFill } from "remotion";

export const revealWipe = (): TransitionPresentation<Record<string, never>> => ({
  component: ({ children, presentationProgress: progress, presentationDirection }) => {
    const entering = presentationDirection === "entering";
    return (
      <AbsoluteFill
        style={{
          clipPath: entering
            ? `inset(0 0 0 ${(1 - progress) * 100}%)`
            : `inset(0 ${progress * 100}% 0 0)`,
        }}
      >
        {children}
        {entering && progress > 0.001 && progress < 0.999 ? (
          <div
            style={{
              position: "absolute",
              left: `${progress * 100}%`,
              top: 0,
              bottom: 0,
              width: 2,
              background: "#C8963E",
              boxShadow: "0 0 22px 3px rgba(200,150,62,.55)",
            }}
          />
        ) : null}
      </AbsoluteFill>
    );
  },
  props: {},
});
