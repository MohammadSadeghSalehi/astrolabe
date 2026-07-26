import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill } from "remotion";
import { Fragment } from "react";
import type { Cut, Scene as SceneSpec } from "../../capture/scenes";
import { scenes } from "../../capture/scenes";
import captureManifest from "./capture-manifest.json";
import { EndCard } from "./EndCard";
import { Intro } from "./Intro";
import { revealWipe } from "./RevealWipe";
import { ReportScene } from "./ReportScene";
import { Scene } from "./Scene";
import { cutScenes, FPS } from "./script";

type CaptureScene = {
  id: string;
  file: string;
  trimHead: number;
  actionDuration?: number;
};

const captures = new Map(
  (captureManifest.scenes as CaptureScene[]).map((scene) => [scene.id, scene]),
);
const specs = new Map(scenes.map((scene) => [scene.id, scene]));

export function Film({ cut }: { cut: Cut }) {
  const entries = cutScenes[cut];
  return (
    <AbsoluteFill style={{ background: "#080B11" }}>
      <TransitionSeries>
        {entries.map((entry, index) => {
          const previous = entries[index - 1];
          const transitionKind =
            index === 0 || entry.id === "refusal"
              ? "none"
              : previous?.id === "intro"
                ? "fade"
                : "wipe";
          const transitionFrames =
            transitionKind === "fade" ? 20 : transitionKind === "wipe" ? 18 : 0;
          const base = Math.round(entry.hold * FPS);
          const duration = base + transitionFrames;
          let content: React.ReactNode;
          if (entry.id === "intro") content = <Intro />;
          else if (entry.id === "end") content = <EndCard />;
          else if (entry.id === "report") content = <ReportScene />;
          else {
            const capture = captures.get(entry.id);
            const spec = specs.get(entry.id) as SceneSpec | undefined;
            if (!capture || !spec) {
              content = (
                <AbsoluteFill className="missing-scene">
                  MISSING CAPTURE · {entry.id.toUpperCase()}
                </AbsoluteFill>
              );
            } else {
              content = <Scene scene={spec} capture={capture} hold={entry.hold} />;
            }
          }

          return (
            <Fragment key={entry.id}>
              {transitionKind === "fade" ? (
                <TransitionSeries.Transition
                  timing={linearTiming({ durationInFrames: 20 })}
                  presentation={fade()}
                />
              ) : transitionKind === "wipe" ? (
                <TransitionSeries.Transition
                  timing={linearTiming({ durationInFrames: 18 })}
                  presentation={revealWipe()}
                />
              ) : null}
              <TransitionSeries.Sequence durationInFrames={duration}>
                {content}
              </TransitionSeries.Sequence>
            </Fragment>
          );
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
}
