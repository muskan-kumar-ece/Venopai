'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminReviewsApi } from '@/lib/api/client';

interface ReviewDetail {
  id: string;
  user_id: string;
  product_id: string;
  rating: number;
  comment?: string | null;
  is_visible: boolean;
  moderation_reason?: string | null;
  created_at: string;
}

export default function AdminReviewDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [moderating, setModerating] = useState(false);

  const fetchReview = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await adminReviewsApi.listQueue();
      if (res?.data) {
        const found = res.data.find((r: ReviewDetail) => r.id === id);
        if (found) {
          setReview(found);
          setReason(found.moderation_reason || '');
        } else {
          setErrorMessage('Review not found in queue.');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load review';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchReview();
  }, [id]);

  const handleHide = async () => {
    if (!reason.trim()) {
      alert('Moderation reason is required when hiding a review.');
      return;
    }
    setModerating(true);
    try {
      await adminReviewsApi.hideReview(id, reason);
      alert('Review successfully hidden from public visibility.');
      fetchReview();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to hide review');
    } finally {
      setModerating(false);
    }
  };

  const handleRestore = async () => {
    setModerating(true);
    try {
      await adminReviewsApi.restoreReview(id);
      alert('Review successfully restored to public visibility.');
      fetchReview();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to restore review');
    } finally {
      setModerating(false);
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center text-xs font-mono text-zinc-400 animate-pulse">Loading review details...</div>;
  }

  if (!review) {
    return (
      <div className="p-8 space-y-4">
        <Link href="/admin/reviews" className="text-xs text-blue-400 hover:underline">
          ← Back to Moderation Queue
        </Link>
        <div className="p-4 bg-red-950/60 border border-red-800 text-red-300 rounded-lg text-xs">
          {errorMessage || 'Review not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 sm:p-8 space-y-6 max-w-3xl">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Link href="/admin/reviews" className="hover:text-zinc-300">
          Reviews
        </Link>
        <span>/</span>
        <span className="font-mono text-zinc-400">{review.id}</span>
      </div>

      <div className="flex items-center justify-between border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Review Inspection</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Submitted {review.created_at ? new Date(review.created_at).toLocaleString() : ''}
          </p>
        </div>
        <div>
          {review.is_visible ? (
            <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-3 py-1 rounded-full">
              Status: Visible
            </span>
          ) : (
            <span className="text-xs font-mono text-red-400 bg-red-950/60 border border-red-800 px-3 py-1 rounded-full">
              Status: Hidden
            </span>
          )}
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4 shadow-sm">
        <div className="grid grid-cols-2 gap-4 text-xs font-mono text-zinc-400 border-b border-zinc-800 pb-4">
          <div>
            <span className="text-zinc-500 uppercase block text-[10px]">User ID</span>
            <span>{review.user_id}</span>
          </div>
          <div>
            <span className="text-zinc-500 uppercase block text-[10px]">Product ID</span>
            <span>{review.product_id}</span>
          </div>
        </div>

        <div>
          <div className="text-xs text-zinc-400 uppercase font-mono text-[10px] mb-1">Customer Rating</div>
          <div className="flex text-amber-400 text-lg">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i}>{i < review.rating ? '★' : '☆'}</span>
            ))}
            <span className="text-xs text-zinc-400 ml-2 pt-1 font-mono">{review.rating} / 5</span>
          </div>
        </div>

        <div>
          <div className="text-xs text-zinc-400 uppercase font-mono text-[10px] mb-1">Written Feedback</div>
          <div className="text-sm text-zinc-200 bg-zinc-900 p-4 rounded-lg border border-zinc-800 whitespace-pre-wrap leading-relaxed">
            {review.comment || '<No text provided>'}
          </div>
        </div>

        {review.moderation_reason && (
          <div className="p-3.5 bg-red-950/40 border border-red-800/80 rounded-lg text-xs text-red-300">
            <strong>Previous Moderation Reason:</strong> {review.moderation_reason}
          </div>
        )}
      </div>

      {/* Moderation Actions */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4 shadow-sm">
        <h2 className="text-sm font-bold text-white uppercase font-mono text-xs tracking-wider">
          Moderation Controls
        </h2>

        {review.is_visible ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-mono text-zinc-400 mb-1">
                Reason for Hiding Review * (Audit Event Logged)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Specify violation (e.g. offensive language, competitive slander, spam)..."
                rows={3}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:border-red-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleHide}
              disabled={moderating || !reason.trim()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
            >
              {moderating ? 'Hiding...' : 'Hide Review from Public Catalog'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400">
              This review is currently hidden from the public product page. Restoring will make it visible to all customers again.
            </p>
            <button
              onClick={handleRestore}
              disabled={moderating}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
            >
              {moderating ? 'Restoring...' : 'Restore Public Visibility'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
