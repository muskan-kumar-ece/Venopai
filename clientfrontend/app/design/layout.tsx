import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Custom PCB Design & Schematic Engineering",
  description:
    "Professional high-speed digital, RF, and power electronics PCB design from block diagrams to certified production files using Altium and KiCad.",
  openGraph: {
    title: "Custom PCB Design & Schematic Engineering | VenopAI",
    description:
      "Professional high-speed digital, RF, and power electronics PCB design from block diagrams to certified production files.",
    url: "/design",
    siteName: "VenopAI",
    images: [
      {
        url: "/images/og/og_design.jpg",
        width: 1200,
        height: 630,
        alt: "VenopAI Custom PCB Design",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Custom PCB Design & Schematic Engineering | VenopAI",
    description: "High-speed multi-layer PCB design, RF layout, and BOM optimization.",
    images: ["/images/og/og_design.jpg"],
  },
};

export default function DesignLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
