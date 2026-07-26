import type { Page } from "playwright";
import { centre, filmClick, filmDrag, glide } from "./cursor.ts";

declare global {
  interface Window {
    __astroReady?: boolean;
  }
}

export type Cut = "submission-60" | "showcase-120";
export type Scene = {
  id: string;
  route: string;
  cuts: Cut[];
  hold: number;
  submissionHold?: number;
  participant?: string;
  live?: boolean;
  callouts: { at: number; big: string; sub?: string }[];
  pushIn?: { from: number; to: number; origin: string };
  stage?: (page: Page) => Promise<void>;
  actions: (page: Page) => Promise<void>;
};

const wait = (page: Page, ms: number) => page.waitForTimeout(ms);

async function smoothScroll(page: Page, y: number, ms = 1600) {
  await page.evaluate(
    async ({ target, duration }) => {
      const start = window.scrollY;
      const delta = target - start;
      const begun = performance.now();
      await new Promise<void>((resolve) => {
        const tick = (now: number) => {
          const t = Math.min(1, (now - begun) / duration);
          const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
          window.scrollTo(0, start + delta * eased);
          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
    },
    { target: y, duration: ms },
  );
}

async function stageText(page: Page, text: string) {
  const locator = page.getByText(text, { exact: false }).first();
  await locator.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -160));
  await wait(page, 300);
}

async function stageTimeline(page: Page) {
  await page.getByLabel("Motor state timeline").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -160));
  await wait(page, 500);
}

export const scenes: Scene[] = [
  {
    id: "hero",
    route: "/",
    cuts: ["submission-60", "showcase-120"],
    hold: 4,
    submissionHold: 3,
    callouts: [{ at: 0.5, big: "MOST OF THE DAY GOES UNRECORDED" }],
    actions: async (page) => {
      await smoothScroll(page, 520, 2600);
      await wait(page, 1400);
    },
  },
  {
    id: "problem",
    route: "/",
    cuts: ["submission-60", "showcase-120"],
    hold: 3,
    callouts: [
      {
        at: 0.25,
        big: "61.6% OF HOURS",
        sub: "AND THAT IS WITH RESEARCH STAFF HELPING",
      },
    ],
    stage: (page) => stageText(page, "61.6%"),
    actions: async (page) => wait(page, 3000),
  },
  {
    id: "epidemiology",
    route: "/",
    cuts: ["showcase-120"],
    hold: 8,
    callouts: [{ at: 1, big: "11.8M · +274% SINCE 1990" }],
    stage: (page) => stageText(page, "11.8M"),
    actions: async (page) => wait(page, 8000),
  },
  {
    id: "pipeline",
    route: "/",
    cuts: ["showcase-120"],
    hold: 7,
    callouts: [{ at: 1, big: "FIVE STAGES, AND A REFUSAL" }],
    pushIn: { from: 1, to: 1.14, origin: "62% 40%" },
    stage: (page) => stageText(page, "One signal, five stages"),
    actions: async (page) => wait(page, 7000),
  },
  {
    id: "pick",
    route: "/join",
    cuts: ["showcase-120"],
    hold: 5,
    callouts: [{ at: 0.5, big: "A PARTICIPANT THE MODEL NEVER SAW" }],
    stage: (page) => stageText(page, "COPS-33"),
    actions: async (page) => {
      const card = page.getByRole("button").filter({ hasText: "COPS-33" });
      await filmClick(page, card, 900);
      await page.waitForURL(/\/day/);
      await page.waitForFunction(() => window.__astroReady === true);
      await wait(page, 1000);
    },
  },
  {
    id: "reveal",
    route: "/day",
    cuts: ["submission-60", "showcase-120"],
    hold: 10,
    participant: "COPS-28",
    callouts: [{ at: 0.8, big: "DRAG TO REVEAL THE TRUTH" }],
    stage: stageTimeline,
    actions: async (page) => {
      const svg = page.getByLabel("Motor state timeline");
      const box = await svg.boundingBox();
      if (!box) throw new Error("Timeline not visible");
      const from = { x: box.x + 92, y: box.y + box.height * 0.53 };
      const to = { x: box.x + box.width - 44, y: from.y };
      await wait(page, 800);
      await filmDrag(page, from, to, 3500);
      await wait(page, 5700);
    },
  },
  {
    id: "posterior",
    route: "/day",
    cuts: ["showcase-120"],
    hold: 6,
    participant: "COPS-28",
    callouts: [{ at: 0.5, big: "EVERY HOUR CARRIES ITS OWN DISTRIBUTION" }],
    stage: stageTimeline,
    actions: async (page) => {
      const svg = page.getByLabel("Motor state timeline");
      const box = await svg.boundingBox();
      if (!box) throw new Error("Timeline not visible");
      for (const fraction of [0.18, 0.52, 0.82]) {
        await glide(page, { x: box.x + box.width * fraction, y: box.y + box.height * 0.5 }, 850);
        await wait(page, 900);
      }
      await wait(page, 750);
    },
  },
  {
    id: "refusal",
    route: "/day",
    cuts: ["submission-60", "showcase-120"],
    hold: 9,
    participant: "COPS-29",
    callouts: [{ at: 3.2, big: "114 OF 114 DECLINED" }],
    stage: stageTimeline,
    actions: async (page) => {
      await wait(page, 3000);
      const svg = page.getByLabel("Motor state timeline");
      const box = await svg.boundingBox();
      if (!box) throw new Error("Timeline not visible");
      await glide(page, { x: box.x + box.width * 0.58, y: box.y + box.height * 0.52 }, 900);
      await wait(page, 5100);
    },
  },
  {
    id: "sensors",
    route: "/day",
    cuts: ["submission-60", "showcase-120"],
    hold: 7,
    submissionHold: 6,
    callouts: [
      { at: 0.8, big: "LOSE A WRIST, IT GETS QUIETER — NOT WRONGER" },
    ],
    pushIn: { from: 1, to: 1.14, origin: "72% 60%" },
    stage: async (page) => {
      await page.getByRole("heading", { name: "Sensors" }).scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -150));
      await wait(page, 300);
    },
    actions: async (page) => {
      await wait(page, 600);
      await filmClick(page, page.getByRole("button", { name: /Right wrist/ }), 850);
      await wait(page, 5400);
    },
  },
  {
    id: "layers",
    route: "/day",
    cuts: ["showcase-120"],
    hold: 5,
    participant: "COPS-28",
    callouts: [{ at: 0.5, big: "TURN THE MODEL OFF. SEE WHAT WAS MEASURED." }],
    stage: (page) => stageText(page, "Evidence layers"),
    actions: async (page) => {
      await filmClick(page, page.getByRole("button", { name: /Inferred|Reconstructed/ }), 800);
      await wait(page, 4200);
    },
  },
  {
    id: "voice",
    route: "/day",
    cuts: ["submission-60", "showcase-120"],
    hold: 16,
    submissionHold: 12,
    participant: "COPS-29",
    live: true,
    callouts: [
      { at: 8.8, big: "ELEVENLABS · SCRIBE V2" },
      { at: 11.2, big: "NOTHING IS WRITTEN UNTIL YOU CONFIRM" },
      { at: 14.2, big: "YOU FILLED IT. THE MODEL STILL DECLINES IT." },
    ],
    stage: (page) => stageText(page, "Tell it what it couldn't know"),
    actions: async (page) => {
      const transcribed = page.waitForResponse(
        (r) => r.url().includes("/api/transcribe") && r.status() === 200,
        { timeout: 30000 },
      );
      const extracted = page.waitForResponse(
        (r) => r.url().includes("/api/extract") && r.status() === 200,
        { timeout: 30000 },
      );
      await filmClick(page, page.getByRole("button", { name: "Start recording" }), 700);
      await wait(page, 8400);
      await filmClick(page, page.getByRole("button", { name: /Stop recording/ }), 500);
      await Promise.all([transcribed, extracted]);
      await page.getByRole("button", { name: "Accept & add" }).waitFor();
      await filmClick(page, page.getByRole("button", { name: "Accept & add" }), 650);
      await wait(page, 2200);
    },
  },
  {
    id: "selective",
    route: "/day",
    cuts: ["showcase-120"],
    hold: 6,
    participant: "COPS-28",
    callouts: [{ at: 0.5, big: "0.713 → 0.825 AS IT ANSWERS LESS" }],
    pushIn: { from: 1, to: 1.14, origin: "72% 55%" },
    stage: (page) => page.getByLabel(/Selective prediction/).scrollIntoViewIfNeeded(),
    actions: async (page) => wait(page, 6000),
  },
  {
    id: "devices",
    route: "/devices",
    cuts: ["showcase-120"],
    hold: 6,
    callouts: [{ at: 0.5, big: "ONLY ONE EXPOSES RAW ACCELERATION" }],
    stage: (page) => stageText(page, "raw acceleration"),
    actions: async (page) => wait(page, 6000),
  },
  {
    id: "clinician",
    route: "/clinician",
    cuts: ["submission-60", "showcase-120"],
    hold: 5,
    submissionHold: 4,
    callouts: [{ at: 0.4, big: "IT PRINTS FOR THE APPOINTMENT" }],
    actions: async (page) => {
      await smoothScroll(page, 520, 1800);
      await wait(page, 3200);
    },
  },
  {
    id: "report",
    route: "/astrolabe-technical-report.pdf",
    cuts: ["showcase-120"],
    hold: 4,
    callouts: [{ at: 0.3, big: "EVERY FIGURE REGENERATES FROM A NAMED SCRIPT" }],
    actions: async (page) => {
      await page.mouse.wheel(0, 1200);
      await wait(page, 4000);
    },
  },
];
