import Link from "next/link";

export default function AdminHomePage() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-xl space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-800/80 bg-emerald-950/40 px-3 py-1 text-xs font-mono text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Hardware Realization Console
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          VenopAI Operations Console
        </h1>

        <p className="text-sm text-zinc-400 leading-relaxed">
          Manage the asynchronous manufacturing pipeline, review customer prototype specifications, issue authoritative quotes, track engineering milestones, and manage private deliverables.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <Link
            href="/admin/manufacturing"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition-colors shadow-sm"
          >
            Open Manufacturing Queue &rarr;
          </Link>
          <Link
            href="/admin/manufacturing/cancellation-review"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-850 hover:text-white transition-colors"
          >
            Review Cancellations
          </Link>
        </div>
      </div>
    </div>
  );
}
