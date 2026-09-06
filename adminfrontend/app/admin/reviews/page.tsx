'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { adminReviewsApi } from '@/lib/api/client';

interface ReviewQueueItem {
  id: string;
  user_id: string;
  product_id: string;
  rating: number;
  comment?: string | null;
  is_visible: boolean;
  moderation_reason?: string | null;
  created_at: string;
}

export default function AdminReviewsPage() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const fetchQueue = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await adminReviewsApi.listQueue();
      if (res?.data) {
        setItems(res.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load reviews';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleHide = async (id: string) => {
    const reason = prompt('Enter moderation reason to hide this review:');
    if (!reason) return;
    try {
      await adminReviewsApi.hideReview(id, reason);
      fetchQueue();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to hide review';
      alert(msg);
    }
  };

  const handleRestore = async (id: string) => {
    if (!confirm('Restore this review to public visibility?')) return;
    try {
      await adminReviewsApi.restoreReview(id);
      fetchQueue();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to restore review';
      alert(msg);
    }
  };

  const filteredItems = items.filter((item) => {
    if (statusFilter === 'hidden') return !item.is_visible;
    if (statusFilter === 'visible') return item.is_visible;
    return true;
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Review Moderation</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Contractual moderation queue for product and service reviews. Handled by SUPPORT_EXECUTIVE and SUPER_ADMIN.
          </p>
        </div>
        <div className="flex items-center gap-3">
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
            Refresh Queue
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
            Loading reviews queue...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-500">
            No reviews match the criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-400 uppercase font-mono text-[10px]">
                <tr>
                  <th className="px-4 py-3">Product ID</th>
                  <th className="px-4 py-3">Rating</th>
                  <th className="px-4 py-3">Comment</th>
                  <th className="px-4 py-3">Visibility</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3 text-right">Moderation Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-800/30 transition">
                    <td className="px-4 py-3 font-mono text-[11px] text-zinc-400">{item.product_id?.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-semibold text-amber-400">{item.rating} ★</td>
                    <td className="px-4 py-3">
                      <div className="line-clamp-2 max-w-md">{item.comment || '<No text provided>'}</div>
                      {item.moderation_reason && (
                        <div className="text-[10px] text-red-400 mt-0.5 italic">
                          Reason: {item.moderation_reason}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.is_visible ? (
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-full">
                          Public
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-red-400 bg-red-950/60 border border-red-800 px-2 py-0.5 rounded-full">
                          Hidden
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                      <Link
                        href={`/admin/reviews/${item.id}`}
                        className="font-semibold text-blue-400 hover:text-blue-300 transition mr-2"
                      >
                        Inspect
                      </Link>
                      {item.is_visible ? (
                        <button
                          onClick={() => handleHide(item.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-red-300 bg-red-950/60 border border-red-800 rounded hover:bg-red-900 transition"
                        >
                          Hide Review
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRestore(item.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-emerald-300 bg-emerald-950/60 border border-emerald-800 rounded hover:bg-emerald-900 transition"
                        >
                          Restore
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
