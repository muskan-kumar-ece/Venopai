"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

export function CookieConsentBanner() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const consent = localStorage.getItem("venopai_cookie_consent");
      if (!consent) {
        // Show banner after brief delay for smooth entrance
        const timer = setTimeout(() => setVisible(true), 800);
        return () => clearTimeout(timer);
      }
    } catch {
      // Storage unavailable
    }
  }, []);

  const handleConsent = (level: "all" | "essential") => {
    try {
      localStorage.setItem("venopai_cookie_consent", level);
      localStorage.setItem("venopai_cookie_consent_date", new Date().toISOString());
    } catch {
      // Storage error
    }
    setVisible(false);
  };

  if (!mounted || !visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie & Privacy Consent Notice"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="rounded-2xl border border-zinc-200/90 bg-white/95 p-5 shadow-xl backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-900/95">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-xs font-bold text-zinc-900 dark:text-white">
              Privacy & Consent Notice (DPDP Act 2023)
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              We use essential session tokens to preserve authentication and secure transactions. In accordance with Indian data protection laws, we request your consent for technical analytics.
            </p>
            <div className="mt-2 text-xs">
              <Link
                href="/privacy"
                className="font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 underline"
              >
                Read our DPDP Notice &rarr;
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => handleConsent("essential")}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition"
          >
            Essential Only
          </button>
          <button
            type="button"
            onClick={() => handleConsent("all")}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 focus:outline-none dark:bg-emerald-600 dark:hover:bg-emerald-500 transition"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}
