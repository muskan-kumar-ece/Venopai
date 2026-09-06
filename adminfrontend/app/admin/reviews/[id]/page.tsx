"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminReviewsApi } from "@/lib/api/client";

interface ReviewDetail {
  id: string;
  order_id: string;
  user_id: string;
  rating: number;
  review_text: string;
  is_hidden: boolean;
  moderation_notes?: string;
  created_at: string;
  updated_at: string;
}

export default function AdminReviewDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const [role, setRole] = useState<"SUPPORT_EXECUTIVE" | "SUPER_ADMIN">("SUPPORT_EXECUTIVE");
  const [notes, setNotes] = useState("");

  const fetchReview = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await adminReviewsApi.getReview(id);
      if (res?.data) {
        setReview(res.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load review";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchReview();
  }, [id]);

  const handleModerate = async (action: 'hide' | 'restore') => {
    try {
      await adminReviewsApi.moderateReview(id, action, notes);
      fetchReview();
      setNotes("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to moderate";
      alert(msg);
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center text-xs font-mono text-zinc-400 animate-pulse">Loading review...</div>;
  }

  if (!review) {
    return (
      <div className="p-6">
        {errorMessage && <div className="text-red-400 mb-4">{errorMessage}</div>}
        <button onClick={() => router.back()} className="text-emerald-400 hover:underline">Go Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 sm:p-8 space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-5">
        <div>
          <button onClick={() => router.back()} className="text-xs text-zinc-400 hover:text-white mb-2 block">
            &larr; Back to Reviews
          </button>
          <h1 className="text-xl font-bold text-white tracking-tight">Review Moderation - {review.id}</h1>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="SUPPORT_EXECUTIVE">Role: SUPPORT_EXECUTIVE</option>
            <option value="SUPER_ADMIN">Role: SUPER_ADMIN</option>
          </select>
          {review.is_hidden ? (
            <span className="text-[10px] font-mono text-red-400 bg-red-950/60 border border-red-800 px-2 py-1 rounded">HIDDEN</span>
          ) : (
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-1 rounded">VISIBLE</span>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-lg bg-red-950/60 border border-red-800 text-red-300 text-xs">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="text-sm font-bold text-white mb-4">Review Content</h2>
            <div className="space-y-4 text-sm text-zinc-300">
              <div>
                <strong className="text-zinc-500">Order ID:</strong> {review.order_id}
              </div>
              <div>
                <strong className="text-zinc-500">User ID:</strong> {review.user_id}
              </div>
              <div>
                <strong className="text-zinc-500">Rating:</strong> {review.rating} / 5
              </div>
              <div>
                <strong className="text-zinc-500">Review Text:</strong>
                <p className="mt-2 p-3 bg-zinc-800/50 rounded whitespace-pre-wrap">{review.review_text}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {role === "SUPER_ADMIN" ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <h2 className="text-sm font-bold text-white mb-4">Moderation Actions</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Moderation Notes (Optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none"
                    rows={3}
                  />
                </div>
                {review.is_hidden ? (
                  <button
                    onClick={() => handleModerate('restore')}
                    className="w-full py-2 bg-emerald-900/60 hover:bg-emerald-800/80 text-emerald-300 text-xs font-semibold rounded transition"
                  >
                    Restore Review
                  </button>
                ) : (
                  <button
                    onClick={() => handleModerate('hide')}
                    className="w-full py-2 bg-amber-900/60 hover:bg-amber-800/80 text-amber-300 text-xs font-semibold rounded transition"
                  >
                    Hide Review
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <h2 className="text-sm font-bold text-white mb-2">Moderation Access</h2>
              <p className="text-xs text-zinc-500">
                Only a SUPER_ADMIN can moderate reviews. Please contact an administrator to hide or restore this review.
              </p>
            </div>
          )}

          {review.moderation_notes && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <h2 className="text-sm font-bold text-white mb-2">Previous Notes</h2>
              <p className="text-xs text-zinc-400 whitespace-pre-wrap">{review.moderation_notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
