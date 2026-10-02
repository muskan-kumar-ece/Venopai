import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Embedded Software, RTOS & IoT Firmware Development",
  description:
    "Production-grade firmware architecture for STM32, ESP32, nRF52, BLE, WiFi, and industrial IoT communication protocols.",
  openGraph: {
    title: "Embedded Software, RTOS & IoT Firmware Development | VenopAI",
    description:
      "Production-grade firmware architecture for STM32, ESP32, nRF52, BLE, WiFi, and industrial IoT communication protocols.",
    url: "/software",
    siteName: "VenopAI",
    images: [
      {
        url: "/images/og/og_software.jpg",
        width: 1200,
        height: 630,
        alt: "VenopAI Embedded Software Engineering",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Embedded Software & Firmware Development | VenopAI",
    description: "Production firmware for microcontrollers, RTOS, and wireless IoT protocols.",
    images: ["/images/og/og_software.jpg"],
  },
};

export default function SoftwareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
