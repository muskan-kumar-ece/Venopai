"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";

export default function ConsultationsLandingPage() {
  const { isAuthenticated } = useAuth();

  const consultationAreas = [
    {
      title: "System Architecture & MCU Selection",
      description: "Evaluation of processing cores (ARM Cortex-M, RISC-V, ESP32, FPGA), memory hierarchy, peripheral buses, and multi-core IPC strategies for your product constraints.",
      badge: "Architecture",
      deliverable: "Architecture Trade-Off Document & Component Matrix",
    },
    {
      title: "Power Budgeting & Battery Life Optimization",
      description: "Low-power sleep state modeling, buck/boost converter topologies, battery chemistry selection (Li-ion, LiFePO4, coin cells), and fuel gauging precision.",
      badge: "Power Integrity",
      deliverable: "Dynamic Power Profile & Thermal Budget",
    },
    {
      title: "BOM Optimization & Supply Chain Derisking",
      description: "Audit of existing Bill of Materials for single-source risks, active component lifecycle status (NRND/EOL warnings), and pin-compatible second source identification.",
      badge: "Supply Chain",
      deliverable: "Scrubbed BOM with Tier-1 Secondary Sourcing",
    },
    {
      title: "High-Speed Layout & EMI/EMC Pre-Compliance",
      description: "Pre-layout stackup planning, differential pair impedance targets, return current paths, antenna matching networks, and radiated emission mitigation.",
      badge: "EMC / RF",
      deliverable: "Stackup Design & Critical Net Guidelines",
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100">
      {/* Hero Section */}
      <section className="relative border-b border-zinc-200 bg-white py-16 sm:py-20 lg:py-24 dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.1),rgba(255,255,255,0))]" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Column: Typography & Action */}
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                DIRECT ENGINEERING ADVISORY
              </div>

              <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl dark:text-white leading-tight">
                Technical Architecture &amp; Hardware Consultation
              </h1>

              <p className="mt-5 text-base sm:text-lg leading-relaxed text-zinc-600 dark:text-zinc-400 max-w-2xl">
                Engage directly with senior electronics architects to resolve complex schematic design questions, optimize power integrity, and derisk hardware before spinning physical silicon.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/consultations/request"
                  className="rounded-xl bg-zinc-900 px-6 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors"
                >
                  + Request Technical Consultation
                </Link>
                {isAuthenticated && (
                  <Link
                    href="/account/consultations"
                    className="rounded-xl border border-zinc-300 bg-white px-6 py-3.5 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                  >
                    View My Past Consultations
                  </Link>
                )}
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-6 text-xs font-mono text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800/80 pt-6">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  1-on-1 Lead Architect Session
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  BOM Derisking &amp; Dual-Sourcing
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Pre-Spin Architecture Sign-Off
                </span>
              </div>
            </div>

            {/* Right Column: Architecture Review Session Mockup Card */}
            <div className="lg:col-span-5">
              <div className="relative rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-6 shadow-xl backdrop-blur-md overflow-hidden group">
                <div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-emerald-500/15 via-transparent to-cyan-500/10 opacity-60 blur-xl group-hover:opacity-100 transition duration-500" />
                
                {/* Header of review card */}
                <div className="relative flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-mono font-semibold uppercase text-zinc-900 dark:text-zinc-200">
                      Architecture Review #ARCH-802
                    </span>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    Pre-Silicon Sign-Off
                  </span>
                </div>

                {/* Interactive Block Diagram Representation */}
                <div className="relative my-5 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <div className="text-[11px] font-mono font-medium text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
                    <span>SUBSYSTEM PARTITIONING</span>
                    <span className="text-emerald-600 dark:text-emerald-400">98.4% Efficiency</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
                      <div className="text-[10px] text-zinc-400">POWER</div>
                      <div className="font-bold text-zinc-900 dark:text-white mt-0.5">PMIC Buck</div>
                      <div className="text-[9px] text-emerald-600 dark:text-emerald-400 mt-1">94% &eta;</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/80 shadow-sm">
                      <div className="text-[10px] text-emerald-700 dark:text-emerald-400">CORE</div>
                      <div className="font-bold text-zinc-900 dark:text-white mt-0.5">STM32U5</div>
                      <div className="text-[9px] text-emerald-600 dark:text-emerald-300 mt-1">110uA/MHz</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
                      <div className="text-[10px] text-zinc-400">RF TELEM</div>
                      <div className="font-bold text-zinc-900 dark:text-white mt-0.5">BLE 5.3</div>
                      <div className="text-[9px] text-zinc-500 mt-1">+4dBm</div>
                    </div>
                  </div>
                </div>

                {/* Audit Checklist Items */}
                <div className="relative space-y-2.5 text-xs text-zinc-600 dark:text-zinc-300">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Dynamic sleep current: <strong>2.1 &mu;A standby verified</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Supply chain scrubbing: <strong>Dual-source MPNs mapped</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Estimated savings: <strong>-32% Bill-of-Materials cost</strong></span>
                  </div>
                </div>

                {/* Footer deliverable badge */}
                <div className="relative mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs font-mono">
                  <span className="text-zinc-400">Architect:</span>
                  <span className="text-zinc-900 dark:text-white font-medium">VenopAI Principal PE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Advisory Practice Areas */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
              Advisory Focus Areas
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Targeted technical analysis designed to save hardware spins and accelerate production timelines.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {consultationAreas.map((area, idx) => (
              <div
                key={idx}
                className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div>
                  <div className="inline-block rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-mono font-medium text-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                    {area.badge}
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-zinc-900 dark:text-white">
                    {area.title}
                  </h3>
                  <p className="mt-2 text-sm text-zinc-600 leading-relaxed dark:text-zinc-400">
                    {area.description}
                  </p>
                </div>

                <div className="mt-6 border-t border-zinc-100 pt-4 dark:border-zinc-900 flex items-center justify-between text-xs">
                  <span className="text-zinc-400 font-medium">Deliverable:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-right">
                    {area.deliverable}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* CTA Box */}
          <div className="mt-16 rounded-2xl border border-zinc-200 bg-gradient-to-r from-zinc-900 to-zinc-950 p-8 sm:p-12 text-white dark:border-zinc-800">
            <div className="max-w-2xl">
              <h3 className="text-2xl font-bold">Have a custom hardware challenge?</h3>
              <p className="mt-3 text-sm text-zinc-300 leading-relaxed">
                Submit your project specifications or schematic drafts. Our engineering team reviews submissions within 24 business hours to provide technical feasibility feedback and structured quotes.
              </p>
              <div className="mt-6">
                <Link
                  href="/consultations/request"
                  className="inline-flex rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition-colors shadow-md"
                >
                  Start an Engineering Consultation
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
