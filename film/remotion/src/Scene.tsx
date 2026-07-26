import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import type { Scene as SceneSpec } from "../../capture/scenes";
import { Callout } from "./Callout";
import { CornerBug } from "./CornerBug";

type Capture = {
  id: string;
  file: string;
  trimHead: number;
  actionDuration?: number;
};

export function Scene({
  scene,
  capture,
  hold,
}: {
  scene: SceneSpec;
  capture: Capture;
  hold: number;
}) {
  const frame = useCurrentFrame();
  // Only the live voice beat is editorially compressed. Pointer travel in the
  // other scenes must stay at capture speed so the interaction remains human.
  const rate =
    scene.id === "voice"
      ? Math.max(1, (capture.actionDuration ?? hold) / hold)
      : 1;
  const voiceRates: Record<string, number> = {
    hero: 1.18,
    problem: 1.45,
    refusal: 1.3,
    sensors: 1.06,
    selective: 1.22,
  };
  const scale = scene.pushIn
    ? interpolate(frame, [0, hold * 30], [scene.pushIn.from, scene.pushIn.to], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  return (
    <AbsoluteFill className="product-scene">
      {scene.id !== "voice" ? (
        <Sequence from={scene.id === "refusal" ? 45 : 0}>
          <Audio
            src={staticFile(`vo/${scene.id}.mp3`)}
            volume={0.95}
            playbackRate={voiceRates[scene.id] ?? 1}
          />
        </Sequence>
      ) : (
        <>
          <Audio src={staticFile("vo/voice-before.mp3")} volume={0.95} />
          <Sequence from={255}>
            <Audio
              src={staticFile("vo/voice-after.mp3")}
              volume={0.95}
              playbackRate={1.5}
            />
          </Sequence>
        </>
      )}
      <AbsoluteFill
        style={{
          transform: `scale(${scale})`,
          transformOrigin: scene.pushIn?.origin ?? "50% 50%",
        }}
      >
        <OffthreadVideo
          src={staticFile(`clips/${capture.file}`)}
          startFrom={Math.round(capture.trimHead * 30)}
          playbackRate={rate}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
      {scene.id === "voice" ? (
        <Sequence from={60}>
          <Audio src={staticFile("note.wav")} playbackRate={rate} volume={0.95} />
        </Sequence>
      ) : null}
      {scene.callouts.map((callout, index) => {
        const at = Math.round((callout.at / rate) * 30);
        const next = scene.callouts[index + 1];
        const until = next ? Math.round((next.at / rate) * 30) - at : 82;
        return (
          <Sequence
            key={`${scene.id}-${callout.at}`}
            from={at}
            durationInFrames={Math.max(36, until)}
          >
            <Callout big={callout.big} sub={callout.sub} />
          </Sequence>
        );
      })}
      <CornerBug />
    </AbsoluteFill>
  );
}
