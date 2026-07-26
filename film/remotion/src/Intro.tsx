import {
  AbsoluteFill,
  Audio,
  Sequence,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { LogoReveal } from "./LogoReveal";

function Statement({
  children,
  mono = false,
  italic = false,
}: {
  children: React.ReactNode;
  mono?: boolean;
  italic?: boolean;
}) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8, 50, 60], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill className="intro-type-wrap" style={{ opacity }}>
      <div className={`intro-type ${mono ? "intro-type-mono" : ""} ${italic ? "intro-type-italic" : ""}`}>
        {children}
      </div>
    </AbsoluteFill>
  );
}

export function Intro() {
  const frame = useCurrentFrame();
  const footageOpacity = interpolate(frame, [0, 20, 230, 250], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill className="intro">
      <Audio src={staticFile("vo/intro.mp3")} volume={0.95} />
      <AbsoluteFill style={{ opacity: footageOpacity }}>
        <OffthreadVideo
          src={staticFile("intro-diary.mp4")}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <AbsoluteFill className="intro-vignette" />
      </AbsoluteFill>
      <Sequence from={60} durationInFrames={60}>
        <Statement mono>11.8 MILLION PEOPLE</Statement>
      </Sequence>
      <Sequence from={120} durationInFrames={60}>
        <Statement>THE FASTEST-GROWING NEUROLOGICAL CONDITION IN THE WORLD</Statement>
      </Sequence>
      <Sequence from={180} durationInFrames={60}>
        <Statement italic>AND THE RECORD THAT DECIDES THEIR TREATMENT IS THIS</Statement>
      </Sequence>
      <Sequence from={270} durationInFrames={90}>
        <LogoReveal />
      </Sequence>
    </AbsoluteFill>
  );
}
