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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://venopai.com";

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
    "electronics engineering Bangalore",
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
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
