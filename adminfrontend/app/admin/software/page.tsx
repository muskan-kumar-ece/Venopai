"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { adminSoftwareApi } from "@/lib/api/client";

interface SoftwareQueueItem {
  id: string;
  user_id: string;
  title: string;
  project_overview: string;
  status: string;
  hardware_platform?: string;
  programming_language?: string;
  os_framework?: string;
  cancellation_requested: boolean;
  open_clarifications_count: number;
  created_at: string;
  updated_at: string;
}

export default function AdminSoftwareQueuePage() {
  const [items, setItems] = useState<SoftwareQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const fetchQueue = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await adminSoftwareApi.listQueue({ status: statusFilter || undefined });
      if (res?.data) {
        setItems(res.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load software queue";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [statusFilter]);

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      submitted: { label: "Submitted", color: "bg-blue-950 text-blue-400 border-blue-800" },
      under_review: { label: "Under Review", color: "bg-amber-950 text-amber-400 border-amber-800" },
      clarification_needed: { label: "Clarification Needed", color: "bg-orange-950 text-orange-400 border-orange-800 animate-pulse" },
      requirements_confirmed: { label: "Requirements Confirmed", color: "bg-indigo-950 text-indigo-400 border-indigo-800" },
      quote_ready: { label: "Quote Ready", color: "bg-emerald-950 text-emerald-400 border-emerald-800" },
      in_progress: { label: "In Progress", color: "bg-indigo-950 text-indigo-400 border-indigo-800" },
      completed_execution: { label: "Code Complete", color: "bg-purple-950 text-purple-400 border-purple-800" },
      delivered: { label: "Delivered", color: "bg-emerald-950 text-emerald-400 border-emerald-800" },
      completed: { label: "Completed", color: "bg-zinc-800 text-zinc-400 border-zinc-700" },
      cancelled: { label: "Cancelled", color: "bg-red-950 text-red-400 border-red-800" },
    };
    const s = map[status] || { label: status, color: "bg-zinc-800 text-zinc-400 border-zinc-700" };
    return (
      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${s.color}`}>
        {s.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Embedded Software & Firmware Queue</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Track RTOS/firmware requirements, manage repository deliveries, post engineering updates, and generate quotes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="clarification_needed">Clarification Needed</option>
            <option value="requirements_confirmed">Requirements Confirmed</option>
            <option value="quote_ready">Quote Ready</option>
            <option value="in_progress">In Progress</option>
            <option value="completed_execution">Code Complete</option>
            <option value="delivered">Delivered</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            onClick={fetchQueue}
            className="rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs px-3 py-1.5 text-zinc-200 transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-lg bg-red-950/60 border border-red-800 text-red-300 text-xs">
          {errorMessage}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-xs font-mono text-zinc-400 animate-pulse">
            Loading software queue...
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-500">
            No software requests found for the selected filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-400 uppercase font-mono text-[10px]">
                <tr>
                  <th className="px-4 py-3">Project Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Platform</th>
                  <th className="px-4 py-3">Stack</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-800/30 transition">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{item.title}</div>
                      <div className="text-[11px] text-zinc-400 line-clamp-1 max-w-md mt-0.5">
                        {item.project_overview}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getStatusBadge(item.status)}
                      {item.cancellation_requested && (
                        <span className="ml-1.5 text-[10px] font-mono text-red-400 bg-red-950/80 border border-red-800 px-1 py-0.5 rounded">
                          Cancel Req
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-zinc-300">
                      {item.hardware_platform || "Unspecified"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-[11px] font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">
                        {item.os_framework || item.programming_language || "Embedded"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-zinc-400">
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <Link
                        href={`/admin/software/${item.id}`}
                        className="font-semibold text-indigo-400 hover:text-indigo-300 transition"
                      >
                        Manage &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
