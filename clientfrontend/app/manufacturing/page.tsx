import Link from "next/link";
import Image from "next/image";

export default function ManufacturingLandingPage() {
  const capabilities = [
    {
      title: "PCB Fabrication & Assembly",
      desc: "Fast-turnaround multi-layer rigid, flex, and rigid-flex PCBA with automated SMT pick-and-place, automated optical inspection (AOI), and X-ray inspection.",
      specs: ["1–32 Layers", "0201 Components", "Lead-Free HASL / ENIG", "Turnaround 5–7 Days"],
      badge: "High Precision",
    },
    {
      title: "CNC Machining",
      desc: "Precision 3-axis, 4-axis, and 5-axis milling and turning in aerospace-grade aluminum, stainless steel, brass, and engineering plastics.",
      specs: ["±0.01mm Tolerance", "Anodizing & Bead Blasting", "50+ Alloys", "Turnaround 3–5 Days"],
      badge: "Production Grade",
    },
    {
      title: "Industrial 3D Printing",
      desc: "SLA, SLS, and MJF additive manufacturing for rapid functional prototypes, jigs, fixtures, and low-volume production enclosures.",
      specs: ["Resin, Nylon, PA12", "Smooth Surface Finish", "Complex Geometry", "Turnaround 24–48 Hours"],
      badge: "Rapid Prototyping",
    },
    {
      title: "Sheet Metal Fabrication",
      desc: "Laser cutting, CNC bending, and robotic welding for industrial chassis, 19\" rack enclosures, and custom brackets with powder coating.",
      specs: ["Steel, Aluminum, Copper", "Powder Coating / Plating", "PEM Hardware Insertion", "Turnaround 5–8 Days"],
      badge: "Heavy Duty",
    },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 selection:bg-cyan-500 selection:text-black">
      {/* Top Banner / Breadcrumb */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              VenopAI <span className="text-xs font-mono text-cyan-400 uppercase tracking-wider bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded">MFG</span>
            </Link>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/manufacturing/requests"
              className="text-sm text-neutral-400 hover:text-white transition"
            >
              My Requests
            </Link>
            <Link
              href="/projects"
              className="text-sm text-neutral-400 hover:text-white transition"
            >
              Projects
            </Link>
            <Link
              href="/manufacturing/request"
              className="text-sm font-medium bg-cyan-500 hover:bg-cyan-400 text-neutral-950 px-4 py-2 rounded-md transition shadow-lg shadow-cyan-500/20"
            >
              Start New Request
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 lg:pt-20 lg:pb-24 border-b border-neutral-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(6,182,212,0.15),rgba(255,255,255,0))]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Column: Typography & CTAs */}
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-cyan-950/50 border border-cyan-800 text-cyan-400 mb-6">
                <span>PROTOTYPING TO LOW-VOLUME REALIZATION</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
                Realize custom hardware with engineering-grade precision.
              </h1>
              <p className="mt-6 text-base sm:text-lg text-neutral-400 leading-relaxed max-w-2xl">
                Upload Gerber, STEP, STL, or technical drawings. Get reviewed engineering quotes, structured milestone updates, and verifiable tax compliance.
              </p>
              <div className="mt-8 flex flex-wrap gap-4 items-center">
                <Link
                  href="/manufacturing/request"
                  className="px-6 py-3.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-semibold shadow-xl shadow-cyan-500/25 transition text-base"
                >
                  Submit Manufacturing Intake &rarr;
                </Link>
                <Link
                  href="/projects"
                  className="px-6 py-3.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 font-medium transition text-base"
                >
                  Group under Projects
                </Link>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-6 text-xs font-mono text-neutral-400 border-t border-neutral-800/80 pt-6">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  IPC-A-610 Class 2 &amp; 3
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  5-Axis CNC Milling
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  AOI &amp; X-Ray Testing
                </span>
              </div>
            </div>

            {/* Right Column: High-Precision Manufacturing Visual Card */}
            <div className="lg:col-span-5">
              <div className="relative rounded-2xl border border-neutral-800 bg-neutral-900/60 p-2.5 shadow-2xl backdrop-blur-sm overflow-hidden group">
                <div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-cyan-500/20 via-transparent to-cyan-500/10 opacity-70 blur-xl group-hover:opacity-100 transition duration-500" />
                <div className="relative rounded-xl overflow-hidden aspect-[4/3] bg-neutral-950 border border-neutral-800/80">
                  <Image
                    src="/images/heroes/manufacturing_hero.jpg"
                    alt="Precision SMT Pick and Place and CNC Machining"
                    fill
                    sizes="(max-width: 1024px) 100vw, 40vw"
                    priority
                    className="object-cover object-center group-hover:scale-105 transition duration-700 ease-out"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-transparent to-neutral-950/20" />

                  {/* Top Floating Badge */}
                  <div className="absolute top-3 left-3 flex items-center gap-2 rounded-lg bg-neutral-950/85 backdrop-blur-md px-3 py-1.5 border border-neutral-700/70 text-xs font-mono text-cyan-300 shadow-lg">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span>SMT Line Active &bull; S/N: PCBA-4000</span>
                  </div>

                  {/* Bottom Metrics Pill */}
                  <div className="absolute bottom-3 inset-x-3 rounded-lg bg-neutral-950/90 backdrop-blur-md p-3 border border-neutral-700/80 flex items-center justify-between text-xs">
                    <div>
                      <div className="text-neutral-400 font-mono text-[10px] uppercase">Tolerance</div>
                      <div className="font-semibold text-white font-mono">&plusmn;0.01 mm</div>
                    </div>
                    <div className="h-6 w-px bg-neutral-800" />
                    <div>
                      <div className="text-neutral-400 font-mono text-[10px] uppercase">Turnaround</div>
                      <div className="font-semibold text-cyan-400 font-mono">24&ndash;48 hrs</div>
                    </div>
                    <div className="h-6 w-px bg-neutral-800" />
                    <div>
                      <div className="text-neutral-400 font-mono text-[10px] uppercase">Compliance</div>
                      <div className="font-semibold text-white font-mono">ISO 9001</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities Grid */}
      <section className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Manufacturing Disciplines
          </h2>
          <p className="mt-2 text-neutral-400">
            Dedicated production processes configured for rapid hardware iterations and end-use mechanical components.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {capabilities.map((c, i) => (
            <div
              key={i}
              className="group p-8 rounded-xl bg-neutral-900/60 border border-neutral-800 hover:border-cyan-500/50 transition duration-300 relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono px-2.5 py-1 rounded bg-neutral-800 text-cyan-400 border border-neutral-700">
                  {c.badge}
                </span>
              </div>
              <h3 className="text-xl font-bold text-white group-hover:text-cyan-400 transition">
                {c.title}
              </h3>
              <p className="mt-3 text-neutral-400 text-sm leading-relaxed">
                {c.desc}
              </p>
              <div className="mt-6 pt-6 border-t border-neutral-800/80 grid grid-cols-2 gap-3">
                {c.specs.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-neutral-300 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    {s}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Transparency & Process Section */}
      <section className="py-20 bg-neutral-900/30 border-t border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-lg bg-neutral-900/40 border border-neutral-800">
              <div className="text-cyan-400 font-mono text-sm mb-2">01. INTAKE & CLARIFICATION</div>
              <h4 className="text-lg font-semibold text-white">No Guesswork Quotes</h4>
              <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
                Our engineers review stackups, tolerances, and design for manufacturing (DFM). Structured Q&A ensures zero ambiguity before locking prices.
              </p>
            </div>
            <div className="p-6 rounded-lg bg-neutral-900/40 border border-neutral-800">
              <div className="text-cyan-400 font-mono text-sm mb-2">02. IMMUTABLE VERSIONING</div>
              <h4 className="text-lg font-semibold text-white">Transparent Quotations</h4>
              <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
                Line-item breakdown with GST compliance (Telangana state of supply). Every revision is tracked and archived with formal audit trails.
              </p>
            </div>
            <div className="p-6 rounded-lg bg-neutral-900/40 border border-neutral-800">
              <div className="text-cyan-400 font-mono text-sm mb-2">03. EXECUTION DISCIPLINE</div>
              <h4 className="text-lg font-semibold text-white">Milestone Updates & Files</h4>
              <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
                Direct progress notes from the production team, private signed Cloudinary downloads for deliverables, and guarded cancellation policies.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
