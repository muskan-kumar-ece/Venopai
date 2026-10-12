import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hardware Engineering & Architecture Consultations",
  description:
    "1-on-1 technical advisory with senior electronics engineers: Architecture review, Bill-of-Materials (BOM) cost reduction, component obsolescence audits, and DFM validation.",
  alternates: {
    canonical: "/consultations",
  },
  openGraph: {
    title: "Hardware Engineering Consultations | VenopAI",
    description:
      "1-on-1 engineering advisory: Schematics review, BOM optimization, regulatory compliance, and rapid prototyping consultation.",
    url: "/consultations",
    siteName: "VenopAI",
    images: [{ url: "/images/og/venopai_og_preview.jpg", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hardware Engineering Consultations | VenopAI",
    description: "BOM optimization, schematic review, and DFM engineering consultation.",
    images: ["/images/og/venopai_og_preview.jpg"],
  },
};

export default function ConsultationsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
