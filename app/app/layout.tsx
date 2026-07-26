import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400"],
  // DESIGN.md §2 names italic as the deliberate emphasis treatment for the
  // display face. Without loading the style explicitly, next/font only ships
  // upright glyphs and the browser fakes italic by shearing them — a
  // synthetic slant on a typeface chosen specifically for its real one.
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // Relative OG/icon URLs resolve against this when a public host is set.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "Astrolabe — read the hours you couldn't record",
  // 0.903, everywhere. This said 0.904 in three places while the landing page,
  // the README and the report all said 0.903 — a rounding drift nobody would
  // notice and exactly the kind of thing this project claims not to do.
  description:
    "Reconstruct Parkinson's motor diary from wrist accelerometry with calibrated uncertainty. Coverage 0.903; declines 77.3% when one wrist is dropped.",
  icons: {
    icon: "/brand/astrolabe-mark-brass.svg",
  },
  // PNG, not the SVG this pointed at. No major platform renders an SVG social
  // card — Slack, X, LinkedIn, Discord and iMessage all drop it — so the link
  // previewed as a blank rectangle everywhere it was actually shared.
  openGraph: {
    type: "website",
    siteName: "Astrolabe",
    title: "Astrolabe — read the hours you couldn't record",
    description:
      "A Parkinson's motor diary that tells you when it doesn't know. Coverage 0.903 · declines 77.3% on one wrist.",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Astrolabe — read the hours you couldn't record",
    description:
      "A Parkinson's motor diary that tells you when it doesn't know. Coverage 0.903 · declines 77.3% on one wrist.",
    images: ["/brand/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
