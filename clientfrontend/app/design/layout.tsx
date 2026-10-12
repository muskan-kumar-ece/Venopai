import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Circuit Schematic & Multi-Layer PCB Design Services",
  description:
    "Expert electronic engineering design: High-speed multi-layer PCB layout, impedance control, EMI/EMC compliance, and turnkey fabrication preparation.",
  alternates: {
    canonical: "/design",
  },
  openGraph: {
    title: "Circuit & Multi-Layer PCB Design Services | VenopAI",
    description:
      "High-speed circuit design, schematic capture, impedance-matched multi-layer layout, and DFM optimization.",
    url: "/design",
    siteName: "VenopAI",
    images: [{ url: "/images/og/venopai_og_preview.jpg", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Circuit & Multi-Layer PCB Design Services | VenopAI",
    description: "High-speed multi-layer PCB layout, impedance matching, and EMI/EMC compliance.",
    images: ["/images/og/venopai_og_preview.jpg"],
  },
};

export default function DesignLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
