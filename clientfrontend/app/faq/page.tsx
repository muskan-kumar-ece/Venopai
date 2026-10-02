"use client";

import React, { useState, useMemo } from "react";

interface FAQItem {
  q: string;
  a: string;
  category: string;
}

const faqs: FAQItem[] = [
  {
    category: "Prototyping & Fabrication",
    q: "What file formats are accepted for automated DFM and PCB fabrication?",
    a: "We accept standard RS-274X Gerber zip archives, Excellon drill files, ODB++, and IPC-2581 containers. For assembly orders, please include an IPC-compliant Bill of Materials (BOM) in CSV or XLSX format and Pick & Place centroid data."
  },
  {
    category: "Prototyping & Fabrication",
    q: "What is your standard turnaround time for prototype PCB assembly?",
    a: "Standard quick-turn prototyping takes 48 to 72 hours from engineering review clearance. Multi-layer impedance-controlled boards or projects requiring high-complexity BGA assembly typically ship within 5 to 7 business days."
  },
  {
    category: "Prototyping & Fabrication",
    q: "Are the fabricated boards tested before dispatch?",
    a: "Yes. All fabricated PCBs undergo Automated Optical Inspection (AOI) and electrical flying-probe or bed-of-nails continuity testing. For turn-key assemblies, we also execute visual inspection and 3D X-Ray inspection for BGA packages."
  },
  {
    category: "Ordering & Payments",
    q: "How does quote approval and payment processing work?",
    a: "Once you submit a manufacturing or design request, our engineers generate an itemized quote valid for 7 days. Upon your approval, payments can be completed securely via Razorpay (UPI, NetBanking, Corporate Credit Cards, or NEFT/RTGS for invoices over ₹50,000)."
  },
  {
    category: "Ordering & Payments",
    q: "Do you issue official GST tax invoices for business input credit?",
    a: "Yes. Every order generates a compliant 18% GST tax invoice containing your verified GSTIN, HSN/SAC codes, and legal billing address. Invoices can be downloaded directly from your customer dashboard."
  },
  {
    category: "Shipping & Logistics",
    q: "Which courier partners handle transit, and how can I track my shipment?",
    a: "We ship through Shiprocket integrated logistics partners including Delhivery, Blue Dart, and DTDC. Real-time tracking numbers and milestone status updates are synced automatically to your account and emailed to you."
  },
  {
    category: "Security & IP",
    q: "How does VenopAI protect intellectual property and proprietary design files?",
    a: "Your files are stored in private encrypted object storage and accessed strictly on a need-to-know basis by assigned fabrication engineers. We operate under mutual non-disclosure (NDA) policies and never share client schematics or firmware."
  },
];

export default function FAQPage() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const categories = useMemo(() => ["All", ...Array.from(new Set(faqs.map((f) => f.category)))], []);

  const filtered = selectedCategory === "All"
    ? faqs
    : faqs.filter((f) => f.category === selectedCategory);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
            KNOWLEDGE BASE
          </span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
            Frequently Asked Questions
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Everything you need to know about rapid PCB fabrication, assembly standards, payments, and logistics.
          </p>
        </div>

        {/* Category Pills */}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setSelectedCategory(c)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                selectedCategory === c
                  ? "bg-zinc-900 text-white dark:bg-emerald-600"
                  : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Accordion */}
        <div className="mt-10 space-y-4">
          {filtered.map((item, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="overflow-hidden rounded-2xl border border-zinc-200 bg-white transition-all dark:border-zinc-800 dark:bg-zinc-900"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between p-5 text-left text-sm font-bold text-zinc-900 dark:text-white"
                >
                  <span>{item.q}</span>
                  <span className={`ml-4 text-emerald-600 font-extrabold transition-transform ${isOpen ? "rotate-45" : ""}`}>
                    +
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-zinc-100 px-5 pb-5 pt-3 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
