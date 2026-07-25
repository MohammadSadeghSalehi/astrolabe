import { DayView } from "@/components/DayView";
import { Nav } from "@/components/Nav";

export const metadata = {
  title: "Astrolabe — one day, reconstructed",
};

export default function DayPage() {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--page)" }}>
      <Nav />
      <DayView />
    </div>
  );
}
