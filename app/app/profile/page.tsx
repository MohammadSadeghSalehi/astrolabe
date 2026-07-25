import { Nav } from "@/components/Nav";
import { ProfileView } from "@/components/ProfileView";

export const metadata = {
  title: "Astrolabe — profile & devices",
};

export default function ProfilePage() {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--page)" }}>
      <Nav />
      <ProfileView />
    </div>
  );
}
