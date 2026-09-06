"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { manufacturingApi } from "@/lib/api/client";

interface RequestSummary {
  id: string;
  title: string;
  prototype_type: string;
  quantity: number;
  status: string;
  cancellation_requested: boolean;
  project_id?: string;
  open_clarifications_count: number;
  created_at: string;
  updated_at: string;
}

export default function ManufacturingRequestsListPage() {
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    manufacturingApi
      .listRequests({ page: 1, page_size: 50 })
      .then((res: { data?: RequestSummary[] }) => {
        if (res?.data) {
          setRequests(res.data);
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to load requests";
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
      clarification_needed: { label: "Action Required", color: "bg-orange-950 text-orange-400 border-orange-800 animate-pulse" },
      requirements_confirmed: { label: "Requirements Confirmed", color: "bg-cyan-950 text-cyan-400 border-cyan-800" },
      quote_ready: { label: "Quote Ready", color: "bg-emerald-950 text-emerald-400 border-emerald-800" },
      payment_pending: { label: "Payment Pending", color: "bg-purple-950 text-purple-400 border-purple-800 animate-pulse" },
      in_progress: { label: "In Production", color: "bg-cyan-950 text-cyan-400 border-cyan-800" },
      completed_execution: { label: "Execution Complete", color: "bg-indigo-950 text-indigo-400 border-indigo-800" },
      delivered: { label: "Delivered", color: "bg-emerald-950 text-emerald-400 border-emerald-800" },
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
          <div className="flex items-center gap-3">
            <Link href="/manufacturing" className="text-sm font-medium text-neutral-400 hover:text-white transition">
              &larr; Manufacturing Home
            </Link>
          </div>
          <Link
            href="/manufacturing/request"
            className="text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-neutral-950 px-3.5 py-1.5 rounded-md transition shadow-md shadow-cyan-500/20"
          >
            + New Request
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            My Manufacturing Requests
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Track hardware prototypes, DFM clarifications, active quotations, and production milestones.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-sm">
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="p-16 text-center text-cyan-400 font-mono text-sm animate-pulse">
            Loading your requests...
          </div>
        ) : requests.length === 0 ? (
          <div className="p-16 text-center rounded-xl bg-neutral-900/30 border border-neutral-800 space-y-4">
            <div className="text-neutral-400 text-sm">You have not submitted any manufacturing requests yet.</div>
            <Link
              href="/manufacturing/request"
              className="inline-block px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-semibold text-xs transition"
            >
              Start Your First Request &rarr;
            </Link>
          </div>
        ) : (
          <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/40 divide-y divide-neutral-800">
            {requests.map((req) => (
              <Link
                key={req.id}
                href={`/manufacturing/requests/${req.id}`}
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-900/80 transition group"
              >
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-base font-semibold text-white group-hover:text-cyan-400 transition">
                      {req.title}
                    </span>
                    {getStatusBadge(req.status)}
                    {req.open_clarifications_count > 0 && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-950 text-orange-400 border border-orange-800">
                        {req.open_clarifications_count} Query Pending
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs font-mono text-neutral-500">
                    <span className="capitalize">{req.prototype_type.replace("_", " ")}</span>
                    <span>•</span>
                    <span>Qty: {req.quantity}</span>
                    <span>•</span>
                    <span>Submitted: {new Date(req.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="text-xs font-mono text-cyan-400 flex items-center gap-1 group-hover:translate-x-1 transition">
                  View Detail &rarr;
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
