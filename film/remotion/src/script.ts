import type { Cut } from "../../capture/scenes";

export const FPS = 30;

export const cutScenes: Record<Cut, { id: string; hold: number }[]> = {
  "submission-60": [
    { id: "intro", hold: 12 },
    { id: "hero", hold: 3 },
    { id: "problem", hold: 3 },
    { id: "reveal", hold: 9 },
    { id: "refusal", hold: 8 },
    { id: "sensors", hold: 5 },
    { id: "voice", hold: 13 },
    { id: "clinician", hold: 4 },
    { id: "end", hold: 3 }
  ],
  "showcase-120": [
    { id: "intro", hold: 12 },
    { id: "hero", hold: 4 },
    { id: "problem", hold: 3 },
    { id: "epidemiology", hold: 8 },
    { id: "pipeline", hold: 7 },
    { id: "pick", hold: 5 },
    { id: "reveal", hold: 10 },
    { id: "posterior", hold: 6 },
    { id: "refusal", hold: 9 },
    { id: "sensors", hold: 7 },
    { id: "layers", hold: 5 },
    { id: "voice", hold: 16 },
    { id: "selective", hold: 6 },
    { id: "devices", hold: 6 },
    { id: "clinician", hold: 5 },
    { id: "report", hold: 4 },
    { id: "end", hold: 3 }
  ]
};

export const durationFor = (cut: Cut) =>
  cutScenes[cut].reduce((sum, scene) => sum + scene.hold * FPS, 0) -
  // AAC priming adds ~53 ms to the container. Two frames of headroom keeps the
  // scored artefact strictly below the form's one-minute ceiling.
  (cut === "submission-60" ? 2 : 0);
