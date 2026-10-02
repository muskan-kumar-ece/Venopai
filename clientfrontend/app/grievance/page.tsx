import React from "react";
import Link from "next/link";

export default function GrievanceRedressalPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 md:p-12 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
              IT ACT 2000 & CONSUMER PROTECTION RULES
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Grievance Redressal Mechanism & Officer
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            Published pursuant to Rule 3(2) of the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 & Rule 5(9) of the Consumer Protection (E-Commerce) Rules, 2020.
          </p>

          <div className="mt-8 space-y-8 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            {/* Grievance Officer Card */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-6 dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Designated Statutory Officer
              </span>
              <h2 className="mt-1 text-lg font-bold text-zinc-900 dark:text-white">
                Grievance Redressal Officer & Data Protection Officer (DPO)
              </h2>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400">Designated Officer:</span>
                  <p className="font-semibold text-zinc-900 dark:text-white">
                    Grievance Officer, Legal & Compliance
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400">Entity:</span>
                  <p className="font-semibold text-zinc-900 dark:text-white">
                    VenopAI Technologies Pvt. Ltd.
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400">Official Email:</span>
                  <p>
                    <a href="mailto:grievance@venopai.com" className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                      grievance@venopai.com
                    </a>
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400">Direct Helpline:</span>
                  <p className="font-semibold text-zinc-900 dark:text-white">
                    +91 (80) 4123-8900
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-zinc-500 dark:text-zinc-400">Postal Address for Legal Notices:</span>
                  <p className="font-medium text-zinc-800 dark:text-zinc-200">
                    VenopAI Technologies Pvt. Ltd., 100 Feet Road, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka 560038, India
                  </p>
                </div>
              </div>
            </div>

            {/* Resolution SLA */}
            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                Statutory Resolution SLA (Turnaround Time)
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40">
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">STAGE 1: ACKNOWLEDGMENT</span>
                  <h3 className="mt-1 text-base font-bold text-zinc-900 dark:text-white">Within 24 to 48 Hours</h3>
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Every complaint or grievance received is assigned a unique Tracking Ticket ID and acknowledged via email within 24 to 48 hours.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40">
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">STAGE 2: DISPOSAL & RESOLUTION</span>
                  <h3 className="mt-1 text-base font-bold text-zinc-900 dark:text-white">Within 15 Calendar Days</h3>
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    In compliance with Rule 3(2) of the IT Rules, the Grievance Officer will redress and dispose of the complaint within 15 days of receipt.
                  </p>
                </div>
              </div>
            </section>

            {/* Escalation Ladder */}
            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                Customer Redressal Escalation Matrix
              </h2>
              <ol className="mt-3 relative border-l border-zinc-200 dark:border-zinc-700 ml-3 space-y-6">
                <li className="ml-6">
                  <span className="absolute -left-3 flex items-center justify-center w-6 h-6 bg-zinc-100 dark:bg-zinc-800 rounded-full border border-zinc-300 dark:border-zinc-600 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    1
                  </span>
                  <h3 className="text-xs font-bold text-zinc-900 dark:text-white">Level 1: General Customer Support Desk</h3>
                  <p className="mt-1">
                    For delivery tracking, quote revisions, invoice downloads, or component returns, contact our customer desk at{" "}
                    <a href="mailto:support@venopai.com" className="text-emerald-600 underline">support@venopai.com</a> or use the{" "}
                    <Link href="/contact" className="text-emerald-600 underline">Contact Form</Link>. Average response: under 4 business hours.
                  </p>
                </li>
                <li className="ml-6">
                  <span className="absolute -left-3 flex items-center justify-center w-6 h-6 bg-emerald-100 dark:bg-emerald-950 rounded-full border border-emerald-500 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    2
                  </span>
                  <h3 className="text-xs font-bold text-zinc-900 dark:text-white">Level 2: Grievance Redressal Officer</h3>
                  <p className="mt-1">
                    If your issue is not resolved within 48 hours or you have concerns regarding data privacy, dark patterns, or unresolved claims, escalate with your Ticket ID to{" "}
                    <a href="mailto:grievance@venopai.com" className="text-emerald-600 underline">grievance@venopai.com</a>.
                  </p>
                </li>
                <li className="ml-6">
                  <span className="absolute -left-3 flex items-center justify-center w-6 h-6 bg-blue-100 dark:bg-blue-950 rounded-full border border-blue-500 text-xs font-bold text-blue-600 dark:text-blue-400">
                    3
                  </span>
                  <h3 className="text-xs font-bold text-zinc-900 dark:text-white">Level 3: Regulatory & Statutory Escalation</h3>
                  <p className="mt-1">
                    If you remain dissatisfied after exhausting our internal grievance redressal mechanism, you may register a consumer grievance on the <strong>National Consumer Helpline (NCH)</strong> at 1915 or file a complaint with the <strong>Data Protection Board of India (DPBI)</strong> pursuant to the Digital Personal Data Protection Act, 2023.
                  </p>
                </li>
              </ol>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
