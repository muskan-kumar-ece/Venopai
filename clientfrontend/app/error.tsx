"use client";

import React, { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console / Sentry
    console.error("VenopAI Client Boundary Error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[75vh] flex-col items-center justify-center px-4 py-16 text-center bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400 mb-4">
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>

      <div className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700 dark:bg-red-950/60 dark:text-red-400">
        SYSTEM RESILIENCE TRIGGERED
      </div>

      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
        Something went wrong
      </h1>

      <p className="mt-2 max-w-md text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
        An unexpected application exception occurred while rendering this interface. Your hardware state and session data remain safe.
      </p>

      {error?.digest && (
        <div className="mt-4 rounded-lg bg-zinc-100 px-3 py-1 font-mono text-[11px] text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          Trace ID: {error.digest}
        </div>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          onClick={() => reset()}
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors cursor-pointer"
        >
          Try Again
        </button>
        <Link
          href="/"
          className="rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-xs font-bold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition-colors"
        >
          Return Home
        </Link>
        <Link
          href="/contact"
          className="rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-xs font-bold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition-colors"
        >
          Report Issue
        </Link>
      </div>
    </div>
  );
}
