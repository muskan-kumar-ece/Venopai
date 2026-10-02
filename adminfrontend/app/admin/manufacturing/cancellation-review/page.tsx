"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { adminManufacturingApi } from "@/lib/api/client";

interface CancellationItem {
  id: string;
  title: string;
  prototype_type: string;
  status: string;
  cancellation_requested: boolean;
  cancellation_reason?: string;
  created_at: string;
  user_id: string;
}

export default function AdminCancellationReviewQueuePage() {
  const [items, setItems] = useState<CancellationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Review Modal State
  const [selectedRequest, setSelectedRequest] = useState<CancellationItem | null>(null);
  const [decision, setDecision] = useState<"approved" | "declined">("approved");
  const [refundAmount, setRefundAmount] = useState<string>("0.00");
  const [resolutionNotes, setResolutionNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchQueue = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await adminManufacturingApi.listCancellationQueue();
      if (res?.data) {
        setItems(res.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load cancellation review queue";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    setIsSubmitting(true);
    try {
      await adminManufacturingApi.resolveCancellation(selectedRequest.id, {
        decision,
        refund_amount: decision === "approved" ? refundAmount : undefined,
        notes: resolutionNotes,
      });
      setSelectedRequest(null);
      setResolutionNotes("");
      setActionFeedback(`Cancellation for ${selectedRequest.title} resolved as ${decision}.`);
      setTimeout(() => setActionFeedback(null), 4000);
      await fetchQueue();
    } catch (err: unknown) {
      // alert replaced
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono tracking-widest text-red-400 uppercase bg-red-950/60 border border-red-800/80 px-2 py-0.5 rounded">
                STAGE-DEPENDENT CANCELLATION
              </span>
              <span className="text-xs font-mono text-zinc-500">&bull; ADMIN-MFG-API-008</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-1.5">
              Cancellation Review Queue
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Review cancellation requests submitted after manufacturing execution has begun. Admin discretion determines final refund terms.
            </p>
          </div>

          <Link
            href="/admin/manufacturing"
            className="text-xs text-zinc-400 hover:text-white border border-zinc-800 bg-zinc-900 px-3 py-2 rounded-lg transition-colors"
          >
            &larr; Back to Manufacturing Queue
          </Link>
        </div>

        {/* Feedback alert */}
        {actionFeedback && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-lg text-emerald-200 text-xs flex items-center justify-between">
            <span>{actionFeedback}</span>
          </div>
        )}

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
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-zinc-850 rounded animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-20 text-center text-zinc-400 space-y-3">
              <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 mx-auto flex items-center justify-center text-emerald-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-white">Cancellation queue is clear</p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                No manufacturing requests currently require administrative cancellation review.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-850/70 border-b border-zinc-800 text-zinc-400 uppercase font-mono tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Request / Title</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Current Status</th>
                    <th className="py-3 px-4">Customer Reason</th>
                    <th className="py-3 px-4">Submitted</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {items.map((req) => (
                    <tr key={req.id} className="hover:bg-zinc-850/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-white block">
                            {req.title}
                          </span>
                          <span className="font-mono text-[11px] text-zinc-500 block">
                            ID: {req.id.slice(0, 12)}...
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-mono uppercase text-[11px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">
                          {req.prototype_type}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                          {req.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <p className="text-zinc-200 line-clamp-2 italic">
                          &ldquo;{req.cancellation_reason || "No reason provided"}&rdquo;
                        </p>
                      </td>

                      <td className="py-3 px-4 font-mono text-zinc-400">
                        {new Date(req.created_at).toLocaleDateString()}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedRequest(req);
                            setDecision("approved");
                            setRefundAmount("0.00");
                            setResolutionNotes("");
                          }}
                          className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded text-xs font-semibold transition-colors shadow-sm"
                        >
                          Review & Resolve
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Review & Resolve Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="border-b border-zinc-800 pb-3">
              <h3 className="text-base font-semibold text-white">Resolve Cancellation Request</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Target: <span className="text-white font-medium">{selectedRequest.title}</span> (ID:{" "}
                <span className="font-mono">{selectedRequest.id}</span>)
              </p>
            </div>

            <div className="p-3 bg-zinc-950/60 rounded-lg border border-zinc-850 text-xs space-y-1">
              <span className="font-mono uppercase text-zinc-500 text-[10px] block">
                Customer Reason:
              </span>
              <p className="text-zinc-200 italic">&ldquo;{selectedRequest.cancellation_reason}&rdquo;</p>
            </div>

            <form onSubmit={handleResolve} className="space-y-4 text-xs">
              {/* Decision Radio */}
              <div>
                <label className="font-mono uppercase text-zinc-400 block mb-2">
                  Administrative Decision
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                      decision === "approved"
                        ? "bg-red-950/40 border-red-700 text-red-200"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="decision"
                      value="approved"
                      checked={decision === "approved"}
                      onChange={() => setDecision("approved")}
                      className="accent-red-500"
                    />
                    <div>
                      <span className="font-semibold block">Approve Cancellation</span>
                      <span className="text-[10px] text-zinc-400 block">Transitions to cancelled</span>
                    </div>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                      decision === "declined"
                        ? "bg-zinc-800/60 border-zinc-600 text-white"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="decision"
                      value="declined"
                      checked={decision === "declined"}
                      onChange={() => setDecision("declined")}
                      className="accent-zinc-400"
                    />
                    <div>
                      <span className="font-semibold block">Decline Cancellation</span>
                      <span className="text-[10px] text-zinc-400 block">Continues in_progress</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Refund input if approved */}
              {decision === "approved" && (
                <div>
                  <label className="font-mono uppercase text-zinc-400 block mb-1">
                    Refund Amount (INR)
                  </label>
                  <input
                    type="text"
                    required
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-zinc-200 focus:outline-none focus:border-red-500"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Enter amount in rupees (e.g. 1500.00). Backend stores integer paise.
                  </p>
                </div>
              )}

              {/* Resolution Notes */}
              <div>
                <label className="font-mono uppercase text-zinc-400 block mb-1">
                  Resolution Notes / Terms
                </label>
                <textarea
                  rows={3}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Justification, unrecoverable material costs accounted for, or reason for decline..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setSelectedRequest(null)}
                  className="px-3 py-1.5 text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-4 py-1.5 text-xs font-semibold rounded transition-colors disabled:opacity-50 ${
                    decision === "approved"
                      ? "bg-red-600 hover:bg-red-500 text-white"
                      : "bg-zinc-700 hover:bg-zinc-600 text-white"
                  }`}
                >
                  {isSubmitting ? "Submitting..." : `Submit Decision (${decision})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
