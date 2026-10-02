import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "1-on-1 Hardware Architecture & DFM Consultations",
  description:
    "Consult with senior electronics hardware architects on circuit design, component selection, cost reduction, and manufacturing readiness.",
  openGraph: {
    title: "1-on-1 Hardware Architecture & DFM Consultations | VenopAI",
    description:
      "Consult with senior electronics hardware architects on circuit design, component selection, cost reduction, and manufacturing readiness.",
    url: "/consultations",
    siteName: "VenopAI",
    images: [
      {
        url: "/images/og/og_consultation.jpg",
        width: 1200,
        height: 630,
        alt: "VenopAI Hardware Consultations",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "1-on-1 Hardware Architecture Consultations | VenopAI",
    description: "Expert engineering guidance for electronics hardware realization.",
    images: ["/images/og/og_consultation.jpg"],
  },
};

export default function ConsultationsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
