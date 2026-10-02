import React from "react";

export default function AdminLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse bg-zinc-950 min-h-screen text-white">
      {/* Top Header Skeleton */}
      <div className="flex items-center justify-between pb-6 border-b border-zinc-800">
        <div className="space-y-2">
          <div className="h-4 w-28 rounded bg-zinc-850" />
          <div className="h-7 w-56 rounded-xl bg-zinc-850" />
        </div>
        <div className="h-9 w-32 rounded-xl bg-zinc-850" />
      </div>

      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
            <div className="h-3 w-20 rounded bg-zinc-800" />
            <div className="h-6 w-32 rounded bg-zinc-800" />
            <div className="h-3 w-24 rounded bg-zinc-850" />
          </div>
        ))}
      </div>

      {/* Operations Table Skeleton */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-40 rounded bg-zinc-800" />
          <div className="h-8 w-28 rounded-xl bg-zinc-800" />
        </div>
        <div className="space-y-3 pt-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 w-full rounded-xl bg-zinc-850/60" />
          ))}
        </div>
      </div>
    </div>
  );
}
