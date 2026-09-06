"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { designApi } from "@/lib/api/client";

interface DesignSummary {
  id: string;
  title: string;
  project_overview: string;
  status: string;
  layer_count: number;
  scope_schematic: boolean;
  scope_layout: boolean;
  scope_component_selection: boolean;
  scope_simulation: boolean;
  scope_firmware_prep: boolean;
  cancellation_requested: boolean;
  open_clarifications_count: number;
  created_at: string;
  updated_at: string;
}

export default function DesignRequestsListPage() {
  const [requests, setRequests] = useState<DesignSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    designApi
      .listRequests({ page: 1, page_size: 50 })
      .then((res: { data?: DesignSummary[] }) => {
        if (res?.data) {
          setRequests(res.data);
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to load design requests";
        setErrorMessage(message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      submitted: { label: "Submitted", color: "bg-blue-950 text-blue-400 border-blue-800" },
      under_review: { label: "Under Review", color: "bg-amber-950 text-amber-400 border-amber-800" },
      clarification_needed: { label: "Clarification Needed", color: "bg-orange-950 text-orange-400 border-orange-800 animate-pulse" },
      requirements_confirmed: { label: "Requirements Confirmed", color: "bg-cyan-950 text-cyan-400 border-cyan-800" },
      quote_ready: { label: "Quote Ready", color: "bg-emerald-950 text-emerald-400 border-emerald-800" },
      in_progress: { label: "Engineering In Progress", color: "bg-cyan-950 text-cyan-400 border-cyan-800" },
      completed_execution: { label: "Layout Complete", color: "bg-indigo-950 text-indigo-400 border-indigo-800" },
      delivered: { label: "Deliverables Ready", color: "bg-emerald-950 text-emerald-400 border-emerald-800" },
      completed: { label: "Completed", color: "bg-neutral-800 text-neutral-300 border-neutral-700" },
      cancelled: { label: "Cancelled", color: "bg-red-950 text-red-400 border-red-800" },
    };
    const s = map[status] || { label: status, color: "bg-neutral-800 text-neutral-300 border-neutral-700" };
    return (
      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${s.color}`}>
        {s.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/design" className="text-sm font-medium text-neutral-400 hover:text-white transition">
            &larr; Design Home
          </Link>
          <Link
            href="/design/request"
            className="text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-neutral-950 px-3.5 py-1.5 rounded-md transition shadow-md shadow-cyan-500/20"
          >
            + New Design Request
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            My Hardware & PCB Design Projects
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Track schematic capture, component routing, engineering updates, and download team deliverables.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-sm">
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="p-16 text-center text-cyan-400 font-mono text-sm animate-pulse">
            Loading your design requests...
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-12 text-center">
            <h3 className="text-lg font-semibold text-white">No design requests yet</h3>
            <p className="mt-2 text-sm text-neutral-400 max-w-md mx-auto">
              Start an engineering engagement to turn your block diagram or schematic into production-ready multi-layer layout files.
            </p>
            <div className="mt-6">
              <Link
                href="/design/request"
                className="inline-flex items-center text-sm font-semibold bg-cyan-500 hover:bg-cyan-400 text-neutral-950 px-4 py-2 rounded-md transition shadow-md shadow-cyan-500/20"
              >
                Submit First Design Request
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-1">
            {requests.map((r) => (
              <Link
                key={r.id}
                href={`/design/requests/${r.id}`}
                className="block p-5 rounded-xl border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-900 hover:border-neutral-700 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-semibold text-white group-hover:text-cyan-400 transition">
                        {r.title}
                      </span>
                      {getStatusBadge(r.status)}
                      {r.cancellation_requested && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded border bg-red-950 text-red-400 border-red-800">
                          Cancellation Pending
                        </span>
                      )}
                      {r.open_clarifications_count > 0 && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded border bg-orange-950 text-orange-400 border-orange-800 animate-pulse">
                          {r.open_clarifications_count} Action Item
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-neutral-400 line-clamp-1">
                      {r.project_overview}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[11px] font-mono bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded">
                        {r.layer_count} Layers
                      </span>
                      {r.scope_schematic && (
                        <span className="text-[11px] font-mono bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded">
                          Schematic
                        </span>
                      )}
                      {r.scope_layout && (
                        <span className="text-[11px] font-mono bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded">
                          Layout
                        </span>
                      )}
                      {r.scope_component_selection && (
                        <span className="text-[11px] font-mono bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded">
                          BOM Sourcing
                        </span>
                      )}
                      {r.scope_simulation && (
                        <span className="text-[11px] font-mono bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded">
                          Simulation
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-neutral-500 font-mono shrink-0">
                    {new Date(r.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
