"use client";

import Link from "next/link";

export default function PCBDesignLandingPage() {
  const capabilities = [
    {
      title: "Schematic Capture & Architecture",
      description: "Complete electrical schematic authoring from block diagrams or PRDs, including power budgets, signal flow, and safety isolation.",
      icon: (
        <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
      ),
    },
    {
      title: "High-Speed PCB Layout",
      description: "Multi-layer boards (2-16 layers) with impedance matching, length matching, DDR/PCIe routing, and differential pair optimization.",
      icon: (
        <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
    {
      title: "BOM Optimization & Sourcing",
      description: "Active lifecycle verification, secondary supplier mapping, lead-time mitigation, and automated manufacturer part number (MPN) validation.",
      icon: (
        <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
    {
      title: "Simulation & DFM Pre-Flight",
      description: "Thermal relief checks, DRC/DFM compliance against SMT fabrication limits, and return path continuous ground reference validation.",
      icon: (
        <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
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
              PCB & Hardware Design Services
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/design/requests"
              className="text-xs font-semibold text-neutral-300 hover:text-white px-3 py-1.5 rounded border border-neutral-700 bg-neutral-900 transition"
            >
              My Design Requests
            </Link>
            <Link
              href="/design/request"
              className="text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-neutral-950 px-3.5 py-1.5 rounded transition shadow-md shadow-cyan-500/20"
            >
              + Submit Design Request
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8 border-b border-neutral-800">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-800/80 bg-cyan-950/40 px-3 py-1 text-xs font-mono text-cyan-400">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Turnkey Hardware Realization
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
            Production-Grade PCB & Hardware Engineering
          </h1>
          <p className="text-base sm:text-lg text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            From architecture to layout, thermal analysis, and BOM sourcing. Designed according to IPC standards and ready for instant transition to VenopAI prototype fabrication.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/design/request"
              className="w-full sm:w-auto inline-flex items-center justify-center text-sm font-semibold bg-cyan-500 hover:bg-cyan-400 text-neutral-950 px-6 py-3 rounded-lg transition shadow-lg shadow-cyan-500/20"
            >
              Request Custom Design
            </Link>
            <Link
              href="/design/requests"
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
          <h2 className="text-2xl font-bold text-white">Full-Lifecycle Electronics Capabilities</h2>
          <p className="text-sm text-neutral-400 max-w-xl mx-auto">
            Our engineering team delivers clean deliverables including KiCad/Altium archives, Gerbers, drill files, BOMs, and 3D STEP models.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {capabilities.map((cap) => (
            <div
              key={cap.title}
              className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900/80 hover:border-neutral-700 transition space-y-3"
            >
              <div className="p-2.5 w-fit rounded-lg bg-cyan-950/60 border border-cyan-800/80">
                {cap.icon}
              </div>
              <h3 className="text-base font-bold text-white">{cap.title}</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">{cap.description}</p>
            </div>
          ))}
        </div>

        {/* Seamless Manufacturing Banner */}
        <div className="rounded-2xl border border-cyan-800/80 bg-gradient-to-r from-cyan-950/40 via-neutral-900/60 to-neutral-900/40 p-8 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <h3 className="text-xl font-bold text-white">Direct-to-Fabrication Pipeline</h3>
            <p className="text-sm text-neutral-400">
              Completed design deliverables can be converted directly into a Phase 8 PCB Fabrication & SMT Assembly order with a single click. No manual file re-uploads or format conversion needed.
            </p>
          </div>
          <Link
            href="/design/request"
            className="shrink-0 inline-flex items-center text-sm font-semibold bg-cyan-500 hover:bg-cyan-400 text-neutral-950 px-5 py-2.5 rounded-lg transition shadow-md shadow-cyan-500/20"
          >
            Start Your Design &rarr;
          </Link>
        </div>
      </section>
    </div>
  );
}
