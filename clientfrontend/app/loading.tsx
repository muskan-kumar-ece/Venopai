import React from "react";

export default function GlobalLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 animate-pulse">
      {/* Skeleton Top Bar */}
      <div className="flex items-center justify-between pb-6 border-b border-zinc-200 dark:border-zinc-800">
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-8 w-64 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="h-10 w-28 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      </div>

      {/* Skeleton Content Grid */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="aspect-4/3 w-full rounded-xl bg-zinc-200 dark:bg-zinc-800" />
            <div className="mt-4 h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="mt-2 h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="mt-6 flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <div className="h-5 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-8 w-20 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
