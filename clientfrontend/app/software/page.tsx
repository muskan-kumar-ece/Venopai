"use client";

import Link from "next/link";

export default function SoftwareServicesLandingPage() {
  const capabilities = [
    {
      title: "Board Bring-Up & HAL Drivers",
      description: "Custom peripheral driver development, clock tree configuration, DMA transfers, and board support packages (BSP) for STM32, ESP32, NXP, and Nordic ICs.",
      icon: (
        <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      ),
    },
    {
      title: "RTOS & Deterministic Embedded Systems",
      description: "Task prioritization, inter-process synchronization (semaphores, message queues), and hard real-time scheduling on FreeRTOS and Zephyr OS.",
      icon: (
        <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: "IoT Stacks & Wireless Connectivity",
      description: "Complete firmware integration for Bluetooth Low Energy (BLE 5.3), Wi-Fi provisioners, LoRaWAN Class A/C, and secure MQTT/HTTPS cloud telemetry.",
      icon: (
        <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
      ),
    },
    {
      title: "Secure Bootloaders & Over-the-Air (OTA)",
      description: "Dual-bank flash memory partitioning, cryptographic image verification (ECDSA/Ed25519), rollback protection, and robust remote firmware upgrades.",
      icon: (
        <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Sub-nav */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-white tracking-wide uppercase font-mono">
              Embedded Software & Firmware Engineering
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/software/requests"
              className="text-xs font-semibold text-neutral-300 hover:text-white px-3 py-1.5 rounded border border-neutral-700 bg-neutral-900 transition"
            >
              My Software Projects
            </Link>
            <Link
              href="/software/request"
              className="text-xs font-semibold bg-indigo-500 hover:bg-indigo-400 text-neutral-950 px-3.5 py-1.5 rounded transition shadow-md shadow-indigo-500/20"
            >
              + Submit Software Request
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8 border-b border-neutral-800">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-800/80 bg-indigo-950/40 px-3 py-1 text-xs font-mono text-indigo-400">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Hardware-Close Software Engineering
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
            Production Embedded Software, RTOS & IoT Firmware
          </h1>
          <p className="text-base sm:text-lg text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            Engineered for reliability, memory efficiency, and real-time execution. From bare-metal register configuration to cloud-connected IoT systems and secure OTA update pipelines.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/software/request"
              className="w-full sm:w-auto inline-flex items-center justify-center text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-neutral-950 px-6 py-3 rounded-lg transition shadow-lg shadow-indigo-500/20"
            >
              Request Firmware Development
            </Link>
            <Link
              href="/software/requests"
              className="w-full sm:w-auto inline-flex items-center justify-center text-sm font-medium text-neutral-300 hover:text-white bg-neutral-900 border border-neutral-700 hover:border-neutral-600 px-6 py-3 rounded-lg transition"
            >
              View Active Projects &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-12">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white">Embedded Software Specialties</h2>
          <p className="text-sm text-neutral-400 max-w-xl mx-auto">
            Clean, modular C/C++ and Rust firmware with full test suites, automated CI pipelines, and comprehensive API documentation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {capabilities.map((cap) => (
            <div
              key={cap.title}
              className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900/80 hover:border-neutral-700 transition space-y-3"
            >
              <div className="p-2.5 w-fit rounded-lg bg-indigo-950/60 border border-indigo-800/80">
                {cap.icon}
              </div>
              <h3 className="text-base font-bold text-white">{cap.title}</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">{cap.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
