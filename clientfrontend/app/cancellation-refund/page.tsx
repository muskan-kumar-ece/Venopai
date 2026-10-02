import React from "react";
import Link from "next/link";

export default function CancellationRefundPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 md:p-12 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
              CONSUMER PROTECTION (E-COMMERCE) RULES, 2020
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Cancellation & Refund Policy
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            Effective Date: January 1, 2026 &bull; Version 1.2 &bull; Compliant with Consumer Protection Act, 2019
          </p>

          <div className="mt-8 space-y-8 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            {/* Overview */}
            <section className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4 border border-zinc-200 dark:border-zinc-700/60">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                Policy Scope & Principles
              </h2>
              <p className="mt-1">
                At VenopAI (operated by <strong className="text-zinc-900 dark:text-zinc-200">VenopAI Technologies Pvt. Ltd.</strong>), we operate two distinct commerce models: standard catalog hardware sales and customized contract engineering/PCB fabrication services. This policy delineates your statutory rights and conditions for order cancellations, replacements, and monetary refunds.
              </p>
            </section>

            {/* Standard Hardware Catalog */}
            <section>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                  1. Standard Hardware Catalog Components
                </h2>
              </div>
              <div className="mt-3 space-y-2">
                <p>
                  <strong>7-Day Replacement / Return Window:</strong> For off-the-shelf microcontrollers, development boards, sensors, and passive components, you are eligible to request a replacement or return within <strong className="text-zinc-900 dark:text-zinc-200">seven (7) calendar days</strong> of confirmed courier delivery.
                </p>
                <p>
                  <strong>Eligible Conditions:</strong>
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Item arrived physically damaged, inoperative (Dead On Arrival - DOA), or functionally defective.</li>
                  <li>Received item does not match the specifications, part number, or model ordered.</li>
                  <li>Component is returned in its original anti-static packaging with all pins and headers intact.</li>
                </ul>
                <p>
                  <strong>Ineligible Items:</strong> Components damaged by electrostatic discharge (ESD), reverse polarity, overvoltage, improper soldering, or physical modification after delivery cannot be accepted for refund.
                </p>
              </div>
            </section>

            {/* Custom PCB Fabrication & Assembly */}
            <section>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-500"></span>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                  2. Custom PCB Fabrication, SMT Assembly & Engineering Services
                </h2>
              </div>
              <div className="mt-3 space-y-2">
                <p>
                  <strong>Pre-Production Cancellation:</strong> You may cancel a custom engineering, design, or fabrication request without any penalty at any time <em>before</em> quotation approval and milestone payment confirmation.
                </p>
                <p>
                  <strong>Post-Payment Fabrication Commitment:</strong> Because custom printed circuit boards, laser-cut stencils, and assembled SMT prototypes are manufactured specifically to your custom Gerber files, netlists, and bill of materials (BOM), orders <strong className="text-zinc-900 dark:text-zinc-200">cannot be cancelled or refunded once production tooling or raw board etching has commenced</strong>.
                </p>
                <p>
                  <strong>100% Quality & Remanufacturing Guarantee:</strong> If the delivered hardware deviates from standard <strong className="text-zinc-900 dark:text-zinc-200">IPC-A-610 Class 2 / Class 3 standards</strong> or contains manufacturing flaws attributable to our fabrication facility, we provide a full, expedited remanufacturing run at zero additional expense upon photographic or physical inspection.
                </p>
              </div>
            </section>

            {/* Refund Process & Timelines */}
            <section>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                  3. Refund Processing & Timelines
                </h2>
              </div>
              <div className="mt-3 space-y-2">
                <p>
                  <strong>Mode of Refund:</strong> All approved refunds are credited back directly to the original payment source (Credit/Debit Card, Net Banking, or UPI) via our authorized payment partner, <strong className="text-zinc-900 dark:text-zinc-200">Razorpay</strong>. Under no circumstances are cash refunds issued.
                </p>
                <p>
                  <strong>Statutory Processing SLA:</strong>
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Inspection & Approval:</strong> Within 48 hours of returned item receipt at our Bengaluru facility.</li>
                  <li><strong>Banking Credit:</strong> Within <strong className="text-zinc-900 dark:text-zinc-200">5 to 7 business days</strong> following refund initiation, subject to your card issuer or banking institution.</li>
                </ul>
              </div>
            </section>

            {/* Return Logistics & Shipping */}
            <section>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-purple-500"></span>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                  4. Return Shipping Logistics
                </h2>
              </div>
              <div className="mt-3 space-y-2">
                <p>
                  For valid defective returns approved by our engineering desk, VenopAI schedules reverse pickup through our logistics partner (<strong className="text-zinc-900 dark:text-zinc-200">Shiprocket</strong>) with full transit insurance at no charge to the customer.
                </p>
              </div>
            </section>

            {/* How to Initiate */}
            <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                5. How to Initiate a Return or Replacement
              </h2>
              <p className="mt-1">
                To file a return, replacement, or warranty claim:
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href="/account/orders"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3.5 py-2 text-xs font-semibold hover:opacity-90 transition"
                >
                  Go to Orders Portal &rarr;
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  Contact Support Desk
                </Link>
                <Link
                  href="/grievance"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  File Grievance Escalation
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
