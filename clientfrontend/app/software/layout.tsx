import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Embedded Firmware & IoT Software Engineering",
  description:
    "Production-grade firmware development: Board support packages (BSP), FreeRTOS/Zephyr, wireless IoT protocols (BLE, Wi-Fi, LoRaWAN), and OTA update architecture.",
  alternates: {
    canonical: "/software",
  },
  openGraph: {
    title: "Embedded Firmware & IoT Software Engineering | VenopAI",
    description:
      "Board bring-up, RTOS drivers, BLE/Wi-Fi/LoRa stacks, and robust IoT device firmware architecture.",
    url: "/software",
    siteName: "VenopAI",
    images: [{ url: "/images/og/venopai_og_preview.jpg", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Embedded Firmware & IoT Software Engineering | VenopAI",
    description: "Production firmware, FreeRTOS, hardware drivers, and IoT cloud connectivity.",
    images: ["/images/og/venopai_og_preview.jpg"],
  },
};

export default function SoftwareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
