import React from "react";
import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="flex min-h-[75vh] flex-col items-center justify-center px-4 py-16 text-center bg-zinc-950 text-white">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-zinc-850 px-3 py-1 text-xs font-mono font-bold text-zinc-300 border border-zinc-750">
        404 // CONSOLE ROUTE NOT FOUND
      </div>

      <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl text-white">
        Operational View Missing
      </h1>

      <p className="mt-2 max-w-md text-xs sm:text-sm text-zinc-400">
        The administrative route or entity identifier you requested does not exist or has been decommissioned.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/admin"
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition-colors"
        >
          Operations Dashboard
        </Link>
        <Link
          href="/admin/orders"
          className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-2.5 text-xs font-bold text-zinc-300 shadow-sm hover:bg-zinc-850 hover:text-white transition-colors"
        >
          Orders Queue
        </Link>
        <Link
          href="/admin/catalog/products"
          className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-2.5 text-xs font-bold text-zinc-300 shadow-sm hover:bg-zinc-850 hover:text-white transition-colors"
        >
          Catalog Products
        </Link>
      </div>
    </div>
  );
}
