import React from "react";
import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 md:p-12 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
              LEGAL CONTRACT & STATUTORY AGREEMENT
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Terms of Service
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            Effective Date: January 1, 2026 &bull; Version 2.0 &bull; Governed by the Laws of the Republic of India
          </p>

          <div className="mt-8 space-y-6 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">1. Acceptance of Terms & Entity Information</h2>
              <p className="mt-1">
                By creating an account, browsing the hardware catalog, uploading CAD schematics, requesting engineering quotations, or placing orders on VenopAI (the &quot;Platform&quot;), operated by <strong className="text-zinc-900 dark:text-zinc-200">VenopAI Technologies Pvt. Ltd.</strong> (&quot;Company&quot;, &quot;we&quot;, &quot;us&quot;), CIN: <code className="font-mono text-zinc-700 dark:text-zinc-300">U72900KA2026PTC189201</code>, you agree to be legally bound by these Terms of Service, the <Link href="/privacy" className="text-emerald-600 underline">Privacy Policy</Link>, and the <Link href="/cancellation-refund" className="text-emerald-600 underline">Cancellation & Refund Policy</Link>.
              </p>
            </section>

            <section id="confidentiality" className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <h2 className="text-sm font-bold text-emerald-900 dark:text-emerald-300">
                2. Intellectual Property Rights & Mutual Non-Disclosure Agreement (NDA)
              </h2>
              <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                <strong>Client IP Ownership:</strong> The Client retains sole, exclusive, and unencumbered ownership of all intellectual property, proprietary schematics, Gerber archives, IPC-2581 files, BOM lists, STEP 3D models, and firmware source code uploaded to the Platform. VenopAI claims zero IP ownership over customer designs.
              </p>
              <p className="mt-2 text-zinc-700 dark:text-zinc-300">
                <strong>Confidentiality Commitment:</strong> VenopAI treats all customer technical artifacts under strict confidentiality. Files are encrypted via 256-bit AES at rest and TLS 1.3 in transit. Artifacts are inspected strictly by authorized production engineers solely for Design for Manufacturing (DFM) verification, quotation estimation, and fabrication execution. We will never sell, monetize, disclose, or use customer designs for third-party production.
              </p>
            </section>

            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">3. Custom Manufacturing & Quotations</h2>
              <p className="mt-1">
                Quotations provided for PCB manufacturing, SMT assembly, and custom engineering are valid for seven (7) calendar days. Manufacturing begins only after quote approval and confirmed payment. Because hardware items are custom-fabricated to client specifications, once fabrication commences, requests cannot be canceled or refunded without explicit mutual review.
              </p>
            </section>

            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">4. Pricing, GST & Prohibition of Dark Patterns</h2>
              <p className="mt-1">
                All prices are stated in Indian Rupees (INR). In accordance with the <em>Guidelines for Prevention and Regulation of Dark Patterns, 2023</em> and the <em>Consumer Protection (E-Commerce) Rules, 2020</em>, VenopAI practices complete pricing transparency:
              </p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>No hidden fees, dripping charges, or pre-selected basket-sneaking items.</li>
                <li>Applicable Goods and Services Tax (GST at 18%) and delivery fees are explicitly itemized prior to final payment.</li>
                <li>Valid GST Tax Invoices are generated upon payment confirmation and accessible within your customer account portal.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">5. Inspection, Quality & Warranty</h2>
              <p className="mt-1">
                Clients must inspect delivered hardware within seven (7) calendar days of confirmed receipt. Any fabrication defects falling outside standard IPC-A-610 Class 2/3 tolerances must be reported via the Platform with photographic evidence. Defective items verified by our engineering audit will be remanufactured at no additional expense.
              </p>
            </section>

            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">6. Data Protection & DPDP Act 2023</h2>
              <p className="mt-1">
                We process your personal and transactional information strictly in accordance with the <em>Digital Personal Data Protection Act, 2023</em>. You hold the right to access, rectify, and withdraw consent for non-essential communications at any time through your <Link href="/account/settings" className="text-emerald-600 underline">Account Settings</Link>.
              </p>
            </section>

            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">7. Statutory Grievance Redressal</h2>
              <p className="mt-1">
                In compliance with the <em>Information Technology Rules, 2021</em>, disputes, consumer grievances, or compliance concerns may be submitted directly to our designated Grievance Officer at <a href="mailto:grievance@venopai.com" className="text-emerald-600 underline">grievance@venopai.com</a>. Full details of our escalation matrix are published on our <Link href="/grievance" className="text-emerald-600 underline">Grievance Redressal Page</Link>.
              </p>
            </section>

            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">8. Governing Law & Jurisdiction</h2>
              <p className="mt-1">
                These terms shall be governed by and construed in accordance with the laws of India. Any legal disputes arising under these terms shall be subject to the exclusive jurisdiction of the competent courts in Bengaluru, Karnataka, India.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
