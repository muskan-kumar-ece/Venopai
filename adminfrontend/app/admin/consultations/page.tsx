"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { adminConsultationsApi } from "@/lib/api/client";

interface ConsultationQueueItem {
  id: string;
  user_id: string;
  customer_email?: string;
  topic: string;
  description: string;
  status: string;
  converted_quote_id?: string;
  created_at: string;
  updated_at: string;
}

export default function AdminConsultationsQueuePage() {
  const [items, setItems] = useState<ConsultationQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const fetchQueue = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await adminConsultationsApi.listQueue(statusFilter || undefined);
      if (res?.data) {
        setItems(res.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load consultations queue";
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
      in_progress: { label: "In Review", color: "bg-amber-950 text-amber-400 border-amber-800" },
      responded: { label: "Responded", color: "bg-emerald-950 text-emerald-400 border-emerald-800" },
      closed: { label: "Closed", color: "bg-zinc-800 text-zinc-400 border-zinc-700" },
      completed: { label: "Completed", color: "bg-zinc-800 text-zinc-400 border-zinc-700" },
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
          <h1 className="text-2xl font-bold text-white tracking-tight">Engineering Consultations Queue</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Review customer technical questions, deliver authoritative hardware advice, or convert to formal billable quotations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="submitted">Submitted (Needs First Response)</option>
            <option value="in_progress">In Progress</option>
            <option value="responded">Responded</option>
            <option value="closed">Closed</option>
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
            Loading consultations queue...
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-500">
            No consultations found for the selected filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-400 uppercase font-mono text-[10px]">
                <tr>
                  <th className="px-4 py-3">Topic</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Quoted?</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-800/30 transition">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{item.topic}</div>
                      <div className="text-[11px] text-zinc-400 line-clamp-1 max-w-md mt-0.5">
                        {item.description}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getStatusBadge(item.status)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.converted_quote_id ? (
                        <span className="text-[10px] font-mono text-purple-400 bg-purple-950/60 border border-purple-800 px-1.5 py-0.5 rounded">
                          Yes
                        </span>
                      ) : (
                        <span className="text-zinc-500 font-mono">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-zinc-400">
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <Link
                        href={`/admin/consultations/${item.id}`}
                        className="font-semibold text-emerald-400 hover:text-emerald-300 transition"
                      >
                        Open Detail &rarr;
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
