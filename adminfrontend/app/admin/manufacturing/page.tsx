"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { adminManufacturingApi } from "@/lib/api/client";

interface QueueItem {
  id: string;
  user_id: string;
  customer_name?: string;
  customer_email?: string;
  project_id?: string;
  title: string;
  prototype_type: string;
  quantity: number;
  status: string;
  cancellation_requested: boolean;
  open_clarifications_count: number;
  has_active_quote: boolean;
  days_in_status: number;
  created_at: string;
  updated_at: string;
}

export default function AdminManufacturingQueuePage() {
  const [requests, setRequests] = useState<QueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [prototypeFilter, setPrototypeFilter] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  const fetchQueue = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await adminManufacturingApi.listQueue({
        status: statusFilter || undefined,
        prototype_type: prototypeFilter || undefined,
        page,
        page_size: 25,
      });
      if (res?.data) {
        setRequests(res.data);
      }
      if (res?.pagination) {
        setTotalPages(res.pagination.total_pages || 1);
        setTotalCount(res.pagination.total_items || 0);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load manufacturing queue";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [statusFilter, prototypeFilter, page]);

  // Metrics computed from list
  const pendingReviewCount = requests.filter((r) => r.status === "submitted" || r.status === "under_review").length;
  const actionRequiredCount = requests.filter((r) => r.status === "clarification_needed" || r.open_clarifications_count > 0).length;
  const inProductionCount = requests.filter((r) => r.status === "in_progress").length;
  const cancellationRequestedCount = requests.filter((r) => r.cancellation_requested).length;

  const getStatusBadge = (status: string, cancellationRequested: boolean) => {
    if (cancellationRequested) {
      return (
        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded border bg-red-950 text-red-300 border-red-700 animate-pulse">
          Cancellation Req
        </span>
      );
    }
    const map: Record<string, { label: string; color: string }> = {
      submitted: { label: "Submitted", color: "bg-blue-950 text-blue-400 border-blue-800" },
      under_review: { label: "Under Review", color: "bg-amber-950 text-amber-400 border-amber-800" },
      clarification_needed: { label: "Clarification Req", color: "bg-orange-950 text-orange-400 border-orange-800 animate-pulse" },
      requirements_confirmed: { label: "Req Confirmed", color: "bg-cyan-950 text-cyan-400 border-cyan-800" },
      quote_ready: { label: "Quote Ready", color: "bg-emerald-950 text-emerald-400 border-emerald-800" },
      quote_issued: { label: "Quote Issued", color: "bg-emerald-950 text-emerald-400 border-emerald-800" },
      quote_accepted: { label: "Quote Accepted", color: "bg-emerald-950 text-emerald-400 border-emerald-800" },
      payment_pending: { label: "Payment Pending", color: "bg-purple-950 text-purple-400 border-purple-800 animate-pulse" },
      in_progress: { label: "In Production", color: "bg-cyan-950 text-cyan-400 border-cyan-800" },
      completed_execution: { label: "Exec Complete", color: "bg-indigo-950 text-indigo-400 border-indigo-800" },
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono tracking-widest text-emerald-400 uppercase bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded">
                ADMIN CONSOLE
              </span>
              <span className="text-xs font-mono text-zinc-500">&bull; MFG-OPS-001</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-1.5">
              Manufacturing Operations Queue
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Authoritative engineering pipeline for hardware prototype intake, DFM validation, quoting, and production tracking.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/admin/manufacturing/cancellation-review"
              className="relative inline-flex items-center gap-2 text-xs font-medium bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border border-zinc-800 px-3 py-2 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Cancellation Reviews
              {cancellationRequestedCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-red-600 text-[10px] font-bold text-white">
                  {cancellationRequestedCount}
                </span>
              )}
            </Link>
            <button
              onClick={fetchQueue}
              className="p-2 text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 bg-zinc-900 rounded-lg transition-colors"
              title="Refresh Queue"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Operational Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <p className="text-[11px] font-mono text-zinc-400 uppercase">Queue Total</p>
            <p className="text-2xl font-bold text-white mt-1">{totalCount || requests.length}</p>
            <p className="text-[10px] text-zinc-500 mt-1">Total requests loaded</p>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <p className="text-[11px] font-mono text-amber-400 uppercase">Awaiting Review</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{pendingReviewCount}</p>
            <p className="text-[10px] text-zinc-500 mt-1">Submitted / under review</p>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <p className="text-[11px] font-mono text-cyan-400 uppercase">In Production</p>
            <p className="text-2xl font-bold text-cyan-400 mt-1">{inProductionCount}</p>
            <p className="text-[10px] text-zinc-500 mt-1">Fabrication in progress</p>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <p className="text-[11px] font-mono text-orange-400 uppercase">Action Needed</p>
            <p className="text-2xl font-bold text-orange-400 mt-1">{actionRequiredCount}</p>
            <p className="text-[10px] text-zinc-500 mt-1">Clarification active</p>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-zinc-900/40 border border-zinc-850 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="text-zinc-400 mr-2 font-mono">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="">All Statuses</option>
                <option value="submitted">Submitted</option>
                <option value="under_review">Under Review</option>
                <option value="clarification_needed">Clarification Needed</option>
                <option value="requirements_confirmed">Requirements Confirmed</option>
                <option value="quote_ready">Quote Ready</option>
                <option value="quote_issued">Quote Issued</option>
                <option value="quote_accepted">Quote Accepted</option>
                <option value="payment_pending">Payment Pending</option>
                <option value="in_progress">In Production</option>
                <option value="completed_execution">Completed Execution</option>
                <option value="delivered">Delivered</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="text-zinc-400 mr-2 font-mono">Type:</label>
              <select
                value={prototypeFilter}
                onChange={(e) => {
                  setPrototypeFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="">All Types</option>
                <option value="pcb">PCB</option>
                <option value="cnc_machining">CNC Machining</option>
                <option value="3d_printing">3D Printing</option>
                <option value="sheet_metal">Sheet Metal</option>
                <option value="box_build">Box Build</option>
              </select>
            </div>
          </div>

          {(statusFilter || prototypeFilter) && (
            <button
              onClick={() => {
                setStatusFilter("");
                setPrototypeFilter("");
                setPage(1);
              }}
              className="text-xs text-zinc-400 hover:text-white underline"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Error notification */}
        {errorMessage && (
          <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-red-200 text-xs flex items-center justify-between">
            <span>{errorMessage}</span>
            <button onClick={fetchQueue} className="underline hover:text-white">
              Retry
            </button>
          </div>
        )}

        {/* Queue Table */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 bg-zinc-850 rounded animate-pulse" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="py-16 text-center text-zinc-400 space-y-2">
              <p className="text-sm font-medium">No manufacturing requests in queue.</p>
              <p className="text-xs text-zinc-500">
                Incoming customer prototype requests will appear here for engineering triage and quotation.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-850/70 border-b border-zinc-800 text-zinc-400 uppercase font-mono tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Request / Title</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Qty</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Age / Days</th>
                    <th className="py-3 px-4">Active Quote</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {requests.map((req) => (
                    <tr key={req.id} className="hover:bg-zinc-850/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-white block hover:text-emerald-400 transition-colors">
                            {req.title}
                          </span>
                          <span className="font-mono text-[11px] text-zinc-500 block">
                            ID: {req.id.slice(0, 12)}...
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <p className="text-zinc-200">{req.customer_name || "Customer"}</p>
                          <p className="text-[11px] font-mono text-zinc-500">{req.customer_email || req.user_id.slice(0, 8)}</p>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-mono uppercase text-[11px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">
                          {req.prototype_type}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono font-medium text-white">
                        {req.quantity}
                      </td>

                      <td className="py-3 px-4">
                        {getStatusBadge(req.status, req.cancellation_requested)}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span className={`px-1.5 py-0.5 rounded ${
                            req.days_in_status > 5
                              ? "bg-red-950/60 text-red-400 border border-red-800/80"
                              : req.days_in_status > 2
                              ? "bg-amber-950/60 text-amber-400 border border-amber-800/80"
                              : "text-zinc-400"
                          }`}>
                            {req.days_in_status}d
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {req.has_active_quote ? (
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-800 px-1.5 py-0.5 rounded">
                            Quote Active
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-zinc-500">None</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/admin/manufacturing/${req.id}`}
                          className="inline-flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1 rounded text-xs font-medium transition-colors"
                        >
                          Open Console &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-3 border-t border-zinc-800 bg-zinc-850/40 flex items-center justify-between text-xs">
              <span className="text-zinc-400">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
