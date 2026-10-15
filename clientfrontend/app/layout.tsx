import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { CookieConsentBanner } from "@/components/legal/CookieConsentBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://venopai.in";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "VenopAI — Electronics Engineering, PCB Design & Rapid Manufacturing",
    template: "%s | VenopAI",
  },
  description:
    "Turnkey electronics engineering, custom PCB design, embedded firmware development, rapid fabrication, and certified hardware marketplace.",
  keywords: [
    "PCB manufacturing India",
    "custom PCB design",
    "electronics engineering Hyderabad",
    "rapid prototyping",
    "electronic components",
    "turnkey PCB assembly",
    "embedded firmware",
    "STM32 ESP32",
    "VenopAI",
  ],
  authors: [{ name: "VenopAI Technologies Pvt. Ltd." }],
  creator: "VenopAI",
  publisher: "VenopAI Technologies Pvt. Ltd.",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
    shortcut: "/favicon.ico",
  },
  openGraph: {
    title: "VenopAI — Electronics Engineering, PCB Design & Rapid Manufacturing",
    description:
      "Integrated hardware realization platform: 48-Hour rapid PCB prototyping, high-speed circuit design, firmware, and certified components marketplace.",
    url: siteUrl,
    siteName: "VenopAI",
    images: [
      {
        url: "/images/og/venopai_og_preview.jpg",
        width: 1200,
        height: 630,
        alt: "VenopAI — Electronics Engineering & Rapid Manufacturing Platform",
      },
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VenopAI — Tech Today. Brighter Tomorrow.",
    description:
      "Rapid PCB prototyping, multi-layer circuit design, and certified electronics components in India.",
    images: ["/images/og/venopai_og_preview.jpg"],
    creator: "@venopai",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  category: "technology",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "VenopAI Technologies Pvt. Ltd.",
    alternateName: "VenopAI",
    url: siteUrl,
    logo: `${siteUrl}/icon.png`,
    description:
      "Turnkey electronics engineering, custom PCB design, rapid manufacturing & certified hardware marketplace.",
    address: {
      "@type": "PostalAddress",
      streetAddress: "3-40 Mallampet",
      addressLocality: "Hyderabad",
      addressRegion: "Telangana",
      postalCode: "500090",
      addressCountry: "IN",
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer service",
        email: "support@venopai.in",
        areaServed: "IN",
        availableLanguage: ["English", "Hindi", "Telugu"],
      },
    ],
    sameAs: [
      "https://www.instagram.com/venopai/",
      "https://twitter.com/venopai",
      "https://github.com/venopai",
      "https://linkedin.com/company/venopai",
    ],
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "VenopAI",
    url: siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/products?search={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
        <AuthProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <CookieConsentBanner />
        </AuthProvider>
      </body>
    </html>
  );
}
