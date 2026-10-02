import React from "react";
import Link from "next/link";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 md:p-12 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
              DIGITAL PERSONAL DATA PROTECTION ACT, 2023 (DPDP)
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Privacy & Data Protection Notice
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            Effective Date: January 1, 2026 &bull; Version 2.0 &bull; Section 5 & 6 DPDP Notice
          </p>

          <div className="mt-8 space-y-6 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            {/* DPDP Section 6 Itemized Notice */}
            <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <h2 className="text-sm font-bold text-emerald-900 dark:text-emerald-300">
                Notice to Data Principals (Section 5 & 6, DPDP Act 2023)
              </h2>
              <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                VenopAI Technologies Pvt. Ltd. operates as a <strong>Data Fiduciary</strong> under the Digital Personal Data Protection Act, 2023. This notice informs you of the personal data we collect, the specified purposes for which it is processed, how you can exercise your statutory rights, and our designated grievance redressal mechanism.
              </p>
            </section>

            {/* What We Collect */}
            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                1. Categories of Personal Data Collected
              </h2>
              <p className="mt-1">
                We collect and process the following limited personal data directly from you:
              </p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li><strong>Identity Data:</strong> Full name, corporate organization name (if applicable).</li>
                <li><strong>Contact Data:</strong> Verified email address, mobile phone number, billing and shipping delivery addresses.</li>
                <li><strong>Commercial & Tax Data:</strong> GSTIN (for B2B tax invoice generation), transaction history, and purchase records.</li>
                <li><strong>Technical Diagnostics:</strong> IP address, device browser metadata, and session tokens essential for secure authentication.</li>
                <li><strong>Note on Financial Data:</strong> We do NOT store debit/credit card numbers or UPI PINs. All financial transactions are tokenized and processed via RBI-licensed payment aggregators (<strong className="text-zinc-900 dark:text-zinc-200">Razorpay</strong>).</li>
              </ul>
            </section>

            {/* Engineering File Confidentiality */}
            <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50 dark:bg-zinc-800/40">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                2. Absolute Confidentiality of Technical Engineering Files
              </h2>
              <p className="mt-1">
                Gerber archives, IPC-2581 layout packages, Bill of Materials (BOM), 3D CAD models, firmware binaries, and schematics uploaded to VenopAI are classified as <strong>Strictly Confidential Intellectual Property</strong>.
              </p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>All engineering assets are encrypted in transit via TLS 1.3 and at rest with 256-bit AES encryption.</li>
                <li>Assets are accessed exclusively by verified production engineers to perform DFM checks and execute SMT fabrication.</li>
                <li>We do not train public AI models on customer proprietary CAD files or source code.</li>
              </ul>
            </section>

            {/* Purpose of Processing */}
            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                3. Specified Purposes for Data Processing
              </h2>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>Fulfilling customer orders, generating GST tax invoices, and processing delivery through our logistics partner (<strong className="text-zinc-900 dark:text-zinc-200">Shiprocket</strong>).</li>
                <li>Evaluating engineering feasibility, generating fabrication quotes, and coordinating technical consultations.</li>
                <li>Sending critical transactional updates (order confirmation, courier tracking, quote approval notices).</li>
                <li>Sending optional engineering product advisories only if you have explicitly given affirmative opt-in consent.</li>
              </ul>
            </section>

            {/* Statutory Rights of Data Principal */}
            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                4. Statutory Rights of the Data Principal
              </h2>
              <p className="mt-1">
                Under the DPDP Act 2023, you hold the following non-derogable rights:
              </p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <span className="font-bold text-zinc-900 dark:text-white">Right to Access Summary:</span>
                  <p className="text-[11px] mt-0.5">Request a summary of your personal data being processed and third parties with whom it has been shared.</p>
                </div>
                <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <span className="font-bold text-zinc-900 dark:text-white">Right to Correction & Erasure:</span>
                  <p className="text-[11px] mt-0.5">Correct inaccurate data, complete incomplete records, or request deletion of personal and design data.</p>
                </div>
                <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <span className="font-bold text-zinc-900 dark:text-white">Right to Withdraw Consent:</span>
                  <p className="text-[11px] mt-0.5">Withdraw consent for non-essential communications at any time directly in your account settings.</p>
                </div>
                <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <span className="font-bold text-zinc-900 dark:text-white">Right to Nominate:</span>
                  <p className="text-[11px] mt-0.5">Nominate an individual to exercise your data rights in the event of death or incapacity.</p>
                </div>
              </div>
            </section>

            {/* Data Protection Officer & Redressal */}
            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                5. Data Protection Officer (DPO) & Redressal Mechanism
              </h2>
              <p className="mt-1">
                If you have questions regarding data privacy or wish to exercise any statutory right:
              </p>
              <div className="mt-3 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60">
                <p><strong>Designated Data Protection Officer (DPO):</strong> Rajesh Kumar, Compliance Lead</p>
                <p><strong>Email:</strong> <a href="mailto:dpo@venopai.com" className="text-emerald-600 underline">dpo@venopai.com</a> / <a href="mailto:grievance@venopai.com" className="text-emerald-600 underline">grievance@venopai.com</a></p>
                <p><strong>Postal Address:</strong> VenopAI Technologies Pvt. Ltd., 100 Feet Road, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka 560038, India</p>
                <p className="mt-2 text-[11px] text-zinc-500">
                  You also retain the statutory right to file a complaint with the <strong>Data Protection Board of India (DPBI)</strong> if our Grievance Redressal Officer does not resolve your query within thirty (30) days.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
