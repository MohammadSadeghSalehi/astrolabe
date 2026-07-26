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
    <div className="clinician-light flex min-h-screen flex-col">
      {/* The nav is for navigating, not for the sheet a clinician is handed
          across a desk — so it is on screen and absent from the print. */}
      <div className="no-print">
        <Nav light />
      </div>
      <ClinicianView />
    </div>
  );
}
