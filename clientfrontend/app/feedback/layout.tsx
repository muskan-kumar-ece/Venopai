import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Platform Feedback & Quality Assurance",
  description:
    "Submit suggestions, report hardware quality feedback, or request new electronics components on VenopAI. We review every submission within 24 hours.",
  alternates: {
    canonical: "/feedback",
  },
  openGraph: {
    title: "Customer Feedback & Suggestions | VenopAI",
    description: "Submit feedback, bug reports, and hardware suggestions directly to the VenopAI engineering team.",
    url: "/feedback",
    siteName: "VenopAI",
    images: [{ url: "/images/og/venopai_og_preview.jpg", width: 1200, height: 630 }],
  },
};

export default function FeedbackLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
