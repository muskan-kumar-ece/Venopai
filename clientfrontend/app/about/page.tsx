import React from "react";
import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
            ENGINEERING REALIZATION
          </span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl dark:text-white">
            Transforming Schematics into Physical Silicon & Systems
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
            VenopAI bridges the friction between electronics design and hardware fabrication. We combine intelligent engineering verification, instant DFM analysis, and advanced pick-and-place lines.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="mt-14 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">48h</div>
            <div className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">Rapid PCB Turnaround</div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">99.4%</div>
            <div className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">First-Pass Yield</div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">ISO 9001</div>
            <div className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">Certified Facility</div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">27,000+</div>
            <div className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">Pincodes Delivered</div>
          </div>
        </div>

        {/* Platform Pillars */}
        <div className="mt-16 space-y-12">
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Our Engineering Mission</h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Hardware development has historically suffered from fractured supplier networks, opaque pricing, inconsistent lead times, and uncoordinated manufacturing steps. VenopAI provides a unified, deterministic pipeline from CAD schematic to populated circuit board, firmware flash, and automated bench testing.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Rapid Assembly & SMT</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                Our Bengaluru manufacturing hub houses automated Yamaha and Panasonic SMT pick-and-place systems capable of placing passives down to 0201 metric footprints, fine-pitch QFNs, and BGAs with 10-zone reflow profiles.
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Automated Optical & X-Ray Inspection</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                Every board produced passes through automated optical inspection (AOI) to detect bridging, tombstones, and alignment errors. Hidden solder joints under BGAs undergo 3D X-ray inspection to guarantee voiding levels comply with IPC-A-610 Class 3.
              </p>
            </div>
          </div>
        </div>

        {/* Call to action */}
        <div className="mt-16 rounded-2xl bg-zinc-900 p-8 text-center text-white dark:bg-emerald-950/40 dark:border dark:border-emerald-800/40">
          <h3 className="text-2xl font-bold">Ready to fabricate your hardware?</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Upload your Gerber and BOM files to receive an automated quote and DFM review in minutes.
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <Link
              href="/manufacturing"
              className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
            >
              Start Manufacturing Request
            </Link>
            <Link
              href="/contact"
              className="rounded-xl border border-zinc-700 bg-zinc-800 px-6 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
            >
              Contact Engineering Team
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
