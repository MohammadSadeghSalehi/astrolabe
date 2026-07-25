"use client";

import { create } from "zustand";
import type { Bundle } from "./contract";

export type SensorMask = { left: boolean; right: boolean };
export type EvidenceLayers = {
  observed: boolean;
  reported: boolean;
  reconstructed: boolean;
};

type Store = {
  participant: string;
  bundle: Bundle | null;
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
  loading: true,
  hour: null,
  mask: { left: true, right: true },
  revealX: 0,
  layers: { observed: true, reported: true, reconstructed: true },
  set: (p) => set(p),
}));
