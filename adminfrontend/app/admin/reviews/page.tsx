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
  const [hideModalReviewId, setHideModalReviewId] = useState<string | null>(null);
  const [hideReason, setHideReason] = useState<string>('');
  const [restoreReviewId, setRestoreReviewId] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

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

  const confirmHide = async () => {
    if (!hideModalReviewId || !hideReason.trim()) return;
    setActionInProgress(true);
    setFeedback(null);
    try {
      await adminReviewsApi.hideReview(hideModalReviewId, hideReason.trim());
      setFeedback({ type: "success", message: "Review hidden from public catalog." });
      setHideModalReviewId(null);
      setHideReason("");
      fetchQueue();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to hide review",
      });
    } finally {
      setActionInProgress(false);
    }
  };

  const confirmRestore = async () => {
    if (!restoreReviewId) return;
    setActionInProgress(true);
    setFeedback(null);
    try {
      await adminReviewsApi.restoreReview(restoreReviewId);
      setFeedback({ type: "success", message: "Review restored to public visibility." });
      setRestoreReviewId(null);
      fetchQueue();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to restore review",
      });
    } finally {
      setActionInProgress(false);
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

      {feedback && (
        <div
          className={`rounded-xl border p-4 text-xs font-medium flex items-center justify-between ${
            feedback.type === "success"
              ? "border-emerald-800 bg-emerald-950/60 text-emerald-300"
              : "border-red-800 bg-red-950/60 text-red-300"
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-zinc-400 hover:text-white ml-4">
            ✕
          </button>
        </div>
      )}

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
                          onClick={() => {
                            setHideModalReviewId(item.id);
                            setHideReason("");
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-red-300 bg-red-950/60 border border-red-800 rounded hover:bg-red-900 transition"
                        >
                          Hide Review
                        </button>
                      ) : (
                        <button
                          onClick={() => setRestoreReviewId(item.id)}
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

      {/* Hide Review Modal */}
      {hideModalReviewId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Moderate & Hide Review</h3>
            <p className="text-xs text-zinc-400">
              Provide an official moderation reason for suppressing this customer review from public visibility.
            </p>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Moderation Justification</label>
              <textarea
                value={hideReason}
                onChange={(e) => setHideReason(e.target.value)}
                placeholder="Reason (e.g. Contains profanity, spam, confidential proprietary schematic details)..."
                rows={3}
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs text-white focus:border-red-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setHideModalReviewId(null)}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!hideReason.trim() || actionInProgress}
                onClick={confirmHide}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50 transition"
              >
                {actionInProgress ? "Hiding..." : "Confirm Suppression"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Review Modal */}
      {restoreReviewId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Restore Review Visibility</h3>
            <p className="text-xs text-zinc-400">
              This review will be restored to public visibility on the hardware catalog and product page.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRestoreReviewId(null)}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionInProgress}
                onClick={confirmRestore}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition"
              >
                {actionInProgress ? "Restoring..." : "Restore Public Visibility"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
