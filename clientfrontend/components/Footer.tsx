import React from "react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Link href="/" className="inline-block">
              <img
                src="/images/brand/venopai_wordmark.png"
                alt="VenoPai"
                className="h-8 w-auto object-contain dark:brightness-110"
              />
            </Link>
            <p className="mt-3 max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
              Integrated electronics engineering, PCB layout design, firmware development, and rapid hardware manufacturing platform.
            </p>
            <div className="mt-4 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                IPC-A-610 & ISO 9001 Compliant
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Engineering Services
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-600 dark:text-zinc-400">
              <li>
                <Link href="/manufacturing" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Rapid Manufacturing
                </Link>
              </li>
              <li>
                <Link href="/design" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  PCB Layout & Hardware
                </Link>
              </li>
              <li>
                <Link href="/software" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Firmware & Embedded
                </Link>
              </li>
              <li>
                <Link href="/consultations" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Technical Architecture
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Hardware Catalog
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-600 dark:text-zinc-400">
              <li>
                <Link href="/products/category/microcontrollers-development" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Microcontrollers &amp; Dev
                </Link>
              </li>
              <li>
                <Link href="/products/category/sensors-actuators" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Sensors &amp; Actuators
                </Link>
              </li>
              <li>
                <Link href="/products/category/power-battery-management" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Power &amp; Battery ICs
                </Link>
              </li>
              <li>
                <Link href="/products/category/wireless-iot-modules" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Wireless &amp; IoT Modules
                </Link>
              </li>
              <li>
                <Link href="/products" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors font-medium">
                  All 34+ Components &rarr;
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Account & Portal
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-600 dark:text-zinc-400">
              <li>
                <Link href="/account" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Customer Dashboard
                </Link>
              </li>
              <li>
                <Link href="/account/projects" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Active Projects
                </Link>
              </li>
              <li>
                <Link href="/account/quotes" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Quotes & Approvals
                </Link>
              </li>
              <li>
                <Link href="/track" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Order Tracking
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Company & Legal
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-600 dark:text-zinc-400">
              <li>
                <Link href="/about" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  About VenopAI
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Contact & Support
                </Link>
              </li>
              <li>
                <Link href="/feedback" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Report Bug & Feedback
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  FAQs & Knowledge Base
                </Link>
              </li>
              <li>
                <Link href="/shipping-policy" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Shipping Policy
                </Link>
              </li>
              <li>
                <Link href="/cancellation-refund" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Cancellation & Refund
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Privacy Policy (DPDP)
                </Link>
              </li>
              <li>
                <Link href="/grievance" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                  Grievance Officer
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-zinc-200 pt-6 flex flex-col items-center justify-between gap-4 sm:flex-row dark:border-zinc-800">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              &copy; {new Date().getFullYear()} VenopAI Technologies Pvt. Ltd. All rights reserved.
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
              CIN: U72900KA2026PTC189201 &bull; GSTIN: 29AABCV1234F1Z5 &bull; Bengaluru, Karnataka 560038
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <Link href="/terms" className="hover:underline">Terms</Link>
            <Link href="/privacy" className="hover:underline">Privacy</Link>
            <Link href="/cancellation-refund" className="hover:underline">Refunds</Link>
            <Link href="/shipping-policy" className="hover:underline">Shipping</Link>
            <Link href="/grievance" className="hover:underline">Grievance</Link>
            <span>&bull;</span>
            <span className="text-emerald-600 dark:text-emerald-400">Razorpay Verified</span>
            <span className="text-cyan-600 dark:text-cyan-400">Shiprocket Logistics</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
