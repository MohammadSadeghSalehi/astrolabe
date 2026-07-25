"use client";

import { create } from "zustand";
import type { Bundle } from "./contract";
import type { BundleOrigin } from "./source";

export type SensorMask = { left: boolean; right: boolean };
export type EvidenceLayers = {
  observed: boolean;
  reported: boolean;
  reconstructed: boolean;
};

type Store = {
  participant: string;
  bundle: Bundle | null;
  /** Where the loaded bundle actually came from, never the configured mode. */
  origin: BundleOrigin | null;
  loading: boolean;
  hour: number | null;
  mask: SensorMask;
  revealX: number;
  layers: EvidenceLayers;
  set: (p: Partial<Store>) => void;
};

export const useStore = create<Store>((set) => ({
  participant: "COPS-29",
  bundle: null,
  origin: null,
  loading: true,
  hour: null,
  mask: { left: true, right: true },
  revealX: 0,
  layers: { observed: true, reported: true, reconstructed: true },
  set: (p) => set(p),
}));
