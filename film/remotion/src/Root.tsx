import { Composition } from "remotion";
import { Film } from "./Film";
import { durationFor, FPS } from "./script";

export const Root = () => (
  <>
    <Composition
      id="submission-60"
      component={Film}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={durationFor("submission-60")}
      defaultProps={{ cut: "submission-60" as const }}
    />
    <Composition
      id="showcase-120"
      component={Film}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={durationFor("showcase-120")}
      defaultProps={{ cut: "showcase-120" as const }}
    />
  </>
);
