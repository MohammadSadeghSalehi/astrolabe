import type { Metadata } from "next";
import { ClinicianView } from "@/components/ClinicianView";

export const metadata: Metadata = {
  title: "Clinician handoff — Astrolabe",
  description:
    "Light-mode neurologist handoff: metrics, abstentions, visit questions, and medication events from the day reconstruction.",
};

export default function ClinicianPage() {
  return <ClinicianView />;
}
