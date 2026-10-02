import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AdminHeader } from "@/components/AdminHeader";
import { AdminSidebar } from "@/components/AdminSidebar";
import { AdminAuthProvider } from "@/lib/auth/AdminAuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VenopAI Admin — Manufacturing & Operations",
  description: "Operational console for hardware realization, engineering requests, and custom manufacturing.",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
    shortcut: "/favicon.ico",
  },
  robots: {
    index: false,
    follow: false,
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans">
        <AdminAuthProvider>
          <AdminHeader />
          <div className="flex flex-1 min-h-[calc(100vh-3.5rem)]">
            <AdminSidebar />
            <main className="flex-1 overflow-x-hidden overflow-y-auto">{children}</main>
          </div>
        </AdminAuthProvider>
      </body>
    </html>
  );
}
