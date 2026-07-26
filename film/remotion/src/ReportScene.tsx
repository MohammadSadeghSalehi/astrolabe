import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Callout } from "./Callout";
import { CornerBug } from "./CornerBug";

export function ReportScene() {
  const frame = useCurrentFrame();
  const y = interpolate(frame, [0, 120], [0, -420], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: "#080B11", overflow: "hidden" }}>
      <Audio src={staticFile("vo/report.mp3")} volume={0.95} />
      <Img
        src={staticFile("report-page-1.png")}
        style={{
          position: "absolute",
          width: 1120,
          height: "auto",
          left: 400,
          top: 18,
          transform: `translateY(${y}px)`,
          boxShadow: "0 24px 80px rgba(0,0,0,.55)",
        }}
      />
      <Sequence from={9} durationInFrames={90}>
        <Callout big="EVERY FIGURE REGENERATES FROM A NAMED SCRIPT" />
      </Sequence>
      <CornerBug />
    </AbsoluteFill>
  );
}
