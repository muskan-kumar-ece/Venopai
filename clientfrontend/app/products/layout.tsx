import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hardware Catalog & Electronic Components",
  description:
    "Shop genuine microcontrollers, sensors, power modules, ICs, development boards, and rapid prototyping kits with express pan-India delivery.",
  openGraph: {
    title: "Hardware Catalog & Electronic Components | VenopAI",
    description:
      "Shop genuine microcontrollers, sensors, power modules, ICs, development boards, and rapid prototyping kits with express pan-India delivery.",
    url: "/products",
    siteName: "VenopAI",
    images: [
      {
        url: "/images/og/venopai_og_preview.jpg",
        width: 1200,
        height: 630,
        alt: "VenopAI Hardware Catalog",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hardware Catalog & Electronic Components | VenopAI",
    description:
      "Shop genuine microcontrollers, sensors, power modules, ICs, and development boards.",
    images: ["/images/og/venopai_og_preview.jpg"],
  },
};

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
