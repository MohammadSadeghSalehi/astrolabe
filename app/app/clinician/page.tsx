import type { Metadata } from "next";
import { ClinicianView } from "@/components/ClinicianView";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Clinician handoff — Astrolabe",
  description:
    "Light-mode neurologist handoff: metrics, abstentions, visit questions, and medication events from the day reconstruction.",
};

export default function ClinicianPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav light />
      <ClinicianView />
    </div>
  );
}
