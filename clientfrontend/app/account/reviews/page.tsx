'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { reviewsApi } from '@/lib/api/client';
import { LoadingState } from '@/components/account/LoadingState';
import { EmptyState } from '@/components/account/EmptyState';

interface Review {
  id: string;
  target_type: string;
  target_id: string;
  product_id?: string | null;
  rating: number;
  text?: string | null;
  comment?: string | null;
  is_visible: boolean;
  created_at: string;
}

function AccountReviewsContent() {
  const searchParams = useSearchParams();
  const prefillTargetType = searchParams?.get('target_type') || (searchParams?.get('product_id') ? 'order_item' : 'order_item');
  const prefillTargetId = searchParams?.get('target_id') || searchParams?.get('product_id') || '';

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New review state
  const [showCreateModal, setShowCreateModal] = useState(!!prefillTargetId);
  const [targetType, setTargetType] = useState(prefillTargetType);
  const [targetId, setTargetId] = useState(prefillTargetId);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit review state
  const [editId, setEditId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editComment, setEditComment] = useState('');
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const loadReviews = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      const res = await reviewsApi.listMyReviews(token);
      if (res?.data) {
        setReviews(res.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, []);

  const handleCreateReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      await reviewsApi.createReview({ target_type: targetType, target_id: targetId, rating, text: comment, comment }, token);
      setShowCreateModal(false);
      setTargetId('');
      setComment('');
      loadReviews();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (r: Review) => {
    setEditId(r.id);
    setEditRating(r.rating);
    setEditComment(r.comment || r.text || '');
    setEditError(null);
    setEditing(true);
  };

  const handleUpdateReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    setSubmitting(true);
    setEditError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      await reviewsApi.updateReview(editId, { rating: editRating, text: editComment, comment: editComment }, token);
      setEditing(false);
      loadReviews();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Failed to update review');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteReview = async (id: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      await reviewsApi.deleteReview(id, token);
      loadReviews();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete review');
    }
  };

  const isWithin7Days = (createdAt: string) => {
    if (!createdAt) return false;
    const created = new Date(createdAt).getTime();
    return (Date.now() - created) <= 7 * 24 * 60 * 60 * 1000;
  };

  const getRemainingDays = (createdAt: string) => {
    if (!createdAt) return 0;
    const created = new Date(createdAt).getTime();
    const diffMs = (created + 7 * 24 * 60 * 60 * 1000) - Date.now();
    if (diffMs <= 0) return 0;
    return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  };

  if (loading) {
    return <LoadingState message="Loading your submitted reviews..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Your Reviews & Feedback</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Manage your submitted ratings and feedback on delivered components and completed engineering projects.
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-1.5 mt-2 inline-block font-medium">
            ℹ️ Policy: Reviews can be edited or deleted within 7 days of submission, or until moderated by an administrator.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer self-start sm:self-auto"
        >
          + Write Review
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded-2xl text-xs font-medium">
          {error}
        </div>
      )}

      {reviews.length === 0 ? (
        <EmptyState
          title="No reviews submitted yet"
          message="Once your parts are delivered or your engineering service is completed, you can submit ratings and feedback directly from your order or request page."
          icon="⭐"
        />
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => {
            const withinWindow = isWithin7Days(r.created_at);
            const canModify = r.is_visible && withinWindow;
            const remaining = getRemainingDays(r.created_at);

            return (
              <div
                key={r.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="flex text-amber-400 text-base">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i}>{i < r.rating ? '★' : '☆'}</span>
                        ))}
                      </div>
                      <span className="text-xs font-bold text-zinc-900 dark:text-white font-mono">{r.rating} / 5</span>
                      {!r.is_visible ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-medium">
                          Under Moderation — Locked
                        </span>
                      ) : !withinWindow ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                          Window Expired
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-medium">
                          Editable ({remaining}d left)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                      Submitted on {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                    </div>
                  </div>

                  {canModify ? (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => openEditModal(r)}
                        className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteReview(r.id)}
                        className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 italic">Locked</span>
                  )}
                </div>

                {(r.comment || r.text) && (
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {r.comment || r.text}
                  </p>
                )}

                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500 font-mono">
                  <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-sans font-medium text-[11px]">
                    {r.target_type === 'order_item' ? 'Component / Order Item' :
                     r.target_type === 'manufacturing_request' ? 'Manufacturing Service' :
                     r.target_type === 'design_request' ? 'Design Service' :
                     r.target_type === 'software_request' ? 'Software Service' :
                     r.target_type === 'consultation_request' ? 'Consultation Engagement' : r.target_type}
                  </span>
                  <span>Target ID: {r.target_id}</span>
                  {r.product_id && <span>Product ID: {r.product_id}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Review Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Write a Review</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              Share your feedback on delivered components or completed engineering services.
            </p>

            {createError && (
              <div className="p-3 mb-4 text-xs text-red-800 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateReview} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Target Type *</label>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="order_item">Delivered Component / Order Item</option>
                  <option value="manufacturing_request">Manufacturing Service Request</option>
                  <option value="design_request">Electronics Design Service Request</option>
                  <option value="software_request">Software / Firmware Service Request</option>
                  <option value="consultation_request">Technical Consultation Engagement</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Target ID *</label>
                <input
                  type="text"
                  required
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                  placeholder="UUID of delivered order item or completed request..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Rating (1 to 5 Stars) *</label>
                <div className="flex gap-2 text-2xl cursor-pointer text-amber-400">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setRating(star)}
                      className="hover:scale-110 transition cursor-pointer"
                    >
                      {star <= rating ? '★' : '☆'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Feedback / Comments (Optional)</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="Review the quality, tolerances, delivery, and engineering performance..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !targetId}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Review Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Edit Review</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              You may edit your review within the permitted window (7 days).
            </p>

            {editError && (
              <div className="p-3 mb-4 text-xs text-red-800 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl">
                {editError}
              </div>
            )}

            <form onSubmit={handleUpdateReview} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Rating *</label>
                <div className="flex gap-2 text-2xl cursor-pointer text-amber-400">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setEditRating(star)}
                      className="hover:scale-110 transition cursor-pointer"
                    >
                      {star <= editRating ? '★' : '☆'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Feedback / Comments</label>
                <textarea
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Updating...' : 'Update Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AccountReviewsPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading reviews..." />}>
      <AccountReviewsContent />
    </Suspense>
  );
}
