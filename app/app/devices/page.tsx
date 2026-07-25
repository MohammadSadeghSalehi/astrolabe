import { Nav } from "@/components/Nav";
import { DevicesView } from "@/components/DevicesView";

export const metadata = {
  title: "Astrolabe — compatible devices",
  description:
    "Which wearables could supply the bilateral raw accelerometry this method needs, checked against vendor documentation. Nothing is integrated yet.",
};

export default function DevicesPage() {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--page)" }}>
      <Nav />
      <DevicesView />
    </div>
  );
}
