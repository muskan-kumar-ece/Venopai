import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us — Technical Support & Project Inquiries",
  description:
    "Get in touch with VenopAI engineers: Technical support, project manufacturing consultations, custom quotes, or enterprise hardware procurement inquiries.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    title: "Contact VenopAI | Engineering & Manufacturing Support",
    description: "Reach our Hyderabad engineering team for fabrication quotes, technical advice, or order inquiries.",
    url: "/contact",
    siteName: "VenopAI",
    images: [{ url: "/images/og/venopai_og_preview.jpg", width: 1200, height: 630 }],
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
