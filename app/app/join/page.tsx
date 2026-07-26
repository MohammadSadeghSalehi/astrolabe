import { Nav } from "@/components/Nav";
import { JoinView } from "@/components/JoinView";

export const metadata = {
  title: "Astrolabe — try it on a recording",
  description:
    "Upload an Astrolabe bundle and run the same pipeline on it, or leave an email. Hackathon prototype; not a medical device.",
};

export default function JoinPage() {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--page)" }}>
      <Nav />
      <JoinView />
    </div>
  );
}
