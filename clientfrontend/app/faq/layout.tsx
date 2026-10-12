import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Frequently Asked Questions (FAQ) — Manufacturing & Prototyping",
  description:
    "Answers to common questions regarding RS-274X Gerber file uploads, PCB turn-around timelines, minimum tolerances, SMT assembly BOM formats, and component sourcing.",
  alternates: {
    canonical: "/faq",
  },
  openGraph: {
    title: "Frequently Asked Questions | VenopAI",
    description: "Everything you need to know about rapid PCB fabrication, assembly standards, payment terms, and delivery across India.",
    url: "/faq",
    siteName: "VenopAI",
    images: [{ url: "/images/og/venopai_og_preview.jpg", width: 1200, height: 630 }],
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What file formats are accepted for automated DFM and PCB fabrication?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "We accept standard RS-274X Gerber zip archives, Excellon drill files, ODB++, and IPC-2581 containers. For assembly orders, please include an IPC-compliant Bill of Materials (BOM) in CSV or XLSX format and Pick & Place centroid data.",
      },
    },
    {
      "@type": "Question",
      name: "What is your standard turnaround time for prototype PCB assembly?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Standard quick-turn prototyping takes 48 to 72 hours from engineering review clearance. Multi-layer impedance-controlled boards or projects requiring high-complexity BGA assembly typically ship within 5 to 7 business days.",
      },
    },
    {
      "@type": "Question",
      name: "Are the fabricated boards tested before dispatch?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. All fabricated PCBs undergo Automated Optical Inspection (AOI) and electrical flying-probe or bed-of-nails continuity testing. For turn-key assemblies, we also execute visual inspection and 3D X-Ray inspection for BGA packages.",
      },
    },
    {
      "@type": "Question",
      name: "How does the commercial quotation process work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Once you upload your design files, our automated rule engine checks tolerances. An engineer validates manufacturing feasibility and produces an itemized commercial quotation including fabrication, assembly, components, and GST.",
      },
    },
  ],
};

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {children}
    </>
  );
}
