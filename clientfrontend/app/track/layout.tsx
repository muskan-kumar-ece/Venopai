import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track Order & Shipment Status",
  description:
    "Real-time order tracking and shipment milestones for custom electronics, PCB assemblies, and hardware components from VenopAI.",
  alternates: {
    canonical: "/track",
  },
  openGraph: {
    title: "Track Order & Shipment Status | VenopAI",
    description:
      "Real-time order tracking and shipment milestones for custom electronics, PCB assemblies, and hardware components from VenopAI.",
    url: "https://venopai.in/track",
    siteName: "VenopAI",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Track Order & Shipment Status | VenopAI",
    description:
      "Real-time order tracking and shipment milestones for custom electronics, PCB assemblies, and hardware components from VenopAI.",
  },
};

export default function TrackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
