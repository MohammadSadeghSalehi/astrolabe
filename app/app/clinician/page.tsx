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
    <div className="flex min-h-screen flex-col" style={{ background: "var(--page)" }}>
      {/* The nav is for navigating, not for the sheet a clinician is handed
          across a desk — so it is on screen and absent from the print. */}
      <div className="no-print">
        <Nav />
      </div>
      <div className="mx-auto w-full max-w-[980px] flex-1 px-4 py-8 md:px-6 md:py-12">
        <div className="glass glass-lit rounded-xl">
          <ClinicianView />
        </div>
      </div>
    </div>
  );
}
