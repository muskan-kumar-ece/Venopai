"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { adminReviewsApi } from "@/lib/api/client";

interface ReviewQueueItem {
  id: string;
  order_id: string;
  user_id: string;
  rating: number;
  review_text: string;
  is_hidden: boolean;
  moderation_notes?: string;
  created_at: string;
}

export default function AdminReviewsPage() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [role, setRole] = useState<"SUPPORT_EXECUTIVE" | "SUPER_ADMIN">("SUPPORT_EXECUTIVE");

  const fetchQueue = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await adminReviewsApi.listQueue(statusFilter || undefined);
      if (res?.data) {
        setItems(res.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load reviews";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [statusFilter]);

  const handleModerate = async (id: string, action: 'hide' | 'restore') => {
    try {
      await adminReviewsApi.moderateReview(id, action, "Moderated from list");
      fetchQueue();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to moderate";
      alert(msg);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Reviews Moderation</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Manage customer reviews and moderate inappropriate content.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="SUPPORT_EXECUTIVE">Role: SUPPORT_EXECUTIVE</option>
            <option value="SUPER_ADMIN">Role: SUPER_ADMIN</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">All Reviews</option>
            <option value="hidden">Hidden Only</option>
            <option value="visible">Visible Only</option>
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

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-xs font-mono text-zinc-400 animate-pulse">
            Loading reviews...
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-500">
            No reviews found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-400 uppercase font-mono text-[10px]">
                <tr>
                  <th className="px-4 py-3">Order ID</th>
                  <th className="px-4 py-3">Rating</th>
                  <th className="px-4 py-3">Review</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-800/30 transition">
                    <td className="px-4 py-3 font-mono">{item.order_id}</td>
                    <td className="px-4 py-3">{item.rating} / 5</td>
                    <td className="px-4 py-3">
                      <div className="line-clamp-2 max-w-md">{item.review_text}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.is_hidden ? (
                        <span className="text-[10px] font-mono text-red-400 bg-red-950/60 border border-red-800 px-1.5 py-0.5 rounded">Hidden</span>
                      ) : (
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-1.5 py-0.5 rounded">Visible</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                      <Link
                        href={`/admin/reviews/${item.id}`}
                        className="font-semibold text-blue-400 hover:text-blue-300 transition mr-2"
                      >
                        Detail
                      </Link>
                      {role === "SUPER_ADMIN" && (
                        <button
                          onClick={() => handleModerate(item.id, item.is_hidden ? 'restore' : 'hide')}
                          className="font-semibold text-amber-400 hover:text-amber-300 transition"
                        >
                          {item.is_hidden ? 'Restore' : 'Hide'}
                        </button>
                      )}
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
