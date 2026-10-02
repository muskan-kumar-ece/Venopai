import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rapid PCB Fabrication & Turnkey Electronics Assembly",
  description:
    "48-Hour rapid prototyping, 1 to 16 layer PCB stacks, automated SMT/THT assembly, and instant CAD/Gerber DFM review in Bengaluru, India.",
  openGraph: {
    title: "Rapid PCB Fabrication & Turnkey Electronics Assembly | VenopAI",
    description:
      "48-Hour rapid prototyping, 1 to 16 layer PCB stacks, automated SMT/THT assembly, and instant CAD/Gerber DFM review in Bengaluru, India.",
    url: "/manufacturing",
    siteName: "VenopAI",
    images: [
      {
        url: "/images/og/og_manufacturing.jpg",
        width: 1200,
        height: 630,
        alt: "VenopAI Rapid PCB Fabrication",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rapid PCB Fabrication & Turnkey Assembly | VenopAI",
    description: "48-Hour turnaround on multi-layer PCBs, automated SMT assembly, and instant DFM.",
    images: ["/images/og/og_manufacturing.jpg"],
  },
};

export default function ManufacturingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
