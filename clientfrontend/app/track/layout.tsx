import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track Order & Shipment Status",
  description:
    "Real-time order tracking and shipment milestones for custom electronics, PCB assemblies, and hardware components from Venopai.",
  alternates: {
    canonical: "/track",
  },
  openGraph: {
    title: "Track Order & Shipment Status | Venopai",
    description:
      "Real-time order tracking and shipment milestones for custom electronics, PCB assemblies, and hardware components from Venopai.",
    url: "https://venopai.in/track",
    siteName: "Venopai",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Track Order & Shipment Status | Venopai",
    description:
      "Real-time order tracking and shipment milestones for custom electronics, PCB assemblies, and hardware components from Venopai.",
  },
};

export default function TrackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
