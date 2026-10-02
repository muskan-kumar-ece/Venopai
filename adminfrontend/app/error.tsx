"use client";

import React, { useEffect } from "react";
import Link from "next/link";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("VenopAI Admin Console Exception:", error);
  }, [error]);

  return (
    <div className="flex min-h-[75vh] flex-col items-center justify-center px-4 py-16 text-center bg-zinc-950 text-white">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-950/80 text-red-400 border border-red-800 mb-4">
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>

      <div className="inline-flex items-center gap-1.5 rounded-full bg-red-950/60 px-3 py-1 text-xs font-mono font-bold text-red-400 border border-red-900">
        CONSOLE FAULT INTERCEPTED
      </div>

      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
        Admin Workspace Exception
      </h1>

      <p className="mt-2 max-w-md text-xs sm:text-sm text-zinc-400">
        An error occurred during operations console execution. Backend state and database transactions remain intact.
      </p>

      {error?.digest && (
        <div className="mt-4 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-1 font-mono text-[11px] text-zinc-400">
          Digest: {error.digest}
        </div>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          onClick={() => reset()}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition-colors cursor-pointer"
        >
          Reload Workspace
        </button>
        <Link
          href="/admin"
          className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-2.5 text-xs font-bold text-zinc-300 shadow-sm hover:bg-zinc-850 hover:text-white transition-colors"
        >
          Dashboard Home
        </Link>
      </div>
    </div>
  );
}
