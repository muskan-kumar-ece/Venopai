"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { manufacturingApi, quotesApi, filesApi } from "@/lib/api/client";

interface LineItem {
  description?: string;
  name?: string;
  amount: string;
}

interface QuoteData {
  id: string;
  status: string;
  current_version?: {
    id: string;
    version_number: number;
    status: string;
    scope_summary?: string;
    line_items: LineItem[];
    subtotal: string;
    tax: {
      type: string;
      amount: string;
    };
    shipping_amount: string;
    total: string;
    estimated_timeline?: string;
    valid_until?: string;
    terms?: string;
  };
}

interface Clarification {
  id: string;
  question: string;
  status: string;
  raised_at: string;
  response?: {
    text: string;
    responded_at: string;
  };
}

interface FileItem {
  id: string;
  filename: string;
  size_bytes: number;
  scan_status: string;
  source: string;
  created_at: string;
}

interface HistoryEvent {
  type: string;
  title: string;
  description?: string;
  timestamp: string;
  actor: string;
}

interface RequestDetail {
  id: string;
  title: string;
  project_overview: string;
  prototype_type: string;
  quantity: number;
  technical_requirements?: string;
  dimensions?: string;
  materials?: string;
  pcb_hardware_details?: string;
  delivery_requirements?: string;
  additional_notes?: string;
  status: string;
  cancellation_requested: boolean;
  cancellation_reason?: string;
  cancellation_decision?: string;
  cancellation_refund_paise?: number;
  files: {
    customer_uploaded: FileItem[];
    delivered: FileItem[];
  };
  current_quote?: QuoteData;
  clarifications: Clarification[];
  created_at: string;
}

export default function ManufacturingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const requestId = resolvedParams.id;

  const [activeTab, setActiveTab] = useState<"overview" | "clarifications" | "quote" | "files" | "history">("overview");
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Clarification reply state
  const [replyingClarId, setReplyingClarId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // Quote reject state
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [isQuoteActionLoading, setIsQuoteActionLoading] = useState(false);

  // Cancellation modal/state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await manufacturingApi.getRequest(requestId);
      if (res?.data) {
        setRequest(res.data);
      }
      const histRes = await manufacturingApi.getHistory(requestId);
      if (histRes?.data) {
        setHistory(histRes.data);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load request";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [requestId]);

  const handleClarificationReply = async (clarificationId: string) => {
    if (!responseText.trim()) return;
    setIsSubmittingReply(true);
    setErrorMessage(null);
    try {
      await manufacturingApi.respondClarification(requestId, clarificationId, responseText.trim());
      setActionSuccess("Response submitted. Request has returned to Engineering review.");
      setReplyingClarId(null);
      setResponseText("");
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to submit response";
      setErrorMessage(message);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleApproveQuote = async (quoteId: string) => {
    setIsQuoteActionLoading(true);
    setErrorMessage(null);
    try {
      await quotesApi.approveQuote(quoteId);
      setActionSuccess("Quote accepted successfully! Payment is now ready.");
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to approve quote";
      setErrorMessage(message);
    } finally {
      setIsQuoteActionLoading(false);
    }
  };

  const handleRejectQuote = async (quoteId: string) => {
    if (!rejectReason.trim()) {
      setErrorMessage("Please specify a reason for rejecting the quote to guide revision.");
      return;
    }
    setIsQuoteActionLoading(true);
    setErrorMessage(null);
    try {
      await quotesApi.rejectQuote(quoteId, rejectReason.trim());
      setActionSuccess("Quote rejected. Our engineering team has been notified to revise the scope.");
      setShowRejectForm(false);
      setRejectReason("");
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to reject quote";
      setErrorMessage(message);
    } finally {
      setIsQuoteActionLoading(false);
    }
  };

  const handleCancelRequest = async () => {
    setIsCancelling(true);
    setErrorMessage(null);
    try {
      await manufacturingApi.cancelRequest(requestId, cancelReason.trim());
      setShowCancelModal(false);
      setCancelReason("");
      setActionSuccess("Cancellation processed.");
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to cancel request";
      setErrorMessage(message);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDownloadFile = async (fileId: string) => {
    try {
      const res = await filesApi.getDownloadUrl(fileId);
      if (res?.data?.download_url) {
        window.open(res.data.download_url, "_blank");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate download link";
      alert(message);
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      submitted: { label: "Submitted", color: "bg-blue-950 text-blue-400 border-blue-800" },
      under_review: { label: "Under Review", color: "bg-amber-950 text-amber-400 border-amber-800" },
      clarification_needed: { label: "Action Required", color: "bg-orange-950 text-orange-400 border-orange-800 animate-pulse" },
      requirements_confirmed: { label: "Requirements Confirmed", color: "bg-cyan-950 text-cyan-400 border-cyan-800" },
      quote_ready: { label: "Quote Ready", color: "bg-emerald-950 text-emerald-400 border-emerald-800" },
      payment_pending: { label: "Payment Pending", color: "bg-purple-950 text-purple-400 border-purple-800 animate-pulse" },
      in_progress: { label: "In Production", color: "bg-cyan-950 text-cyan-400 border-cyan-800" },
      completed_execution: { label: "Execution Complete", color: "bg-indigo-950 text-indigo-400 border-indigo-800" },
      delivered: { label: "Delivered", color: "bg-emerald-950 text-emerald-400 border-emerald-800" },
      completed: { label: "Completed", color: "bg-neutral-800 text-neutral-300 border-neutral-700" },
      cancelled: { label: "Cancelled", color: "bg-red-950 text-red-400 border-red-800" },
    };
    const s = map[status] || { label: status, color: "bg-neutral-800 text-neutral-300 border-neutral-700" };
    return (
      <span className={`text-xs font-mono uppercase px-2.5 py-1 rounded border ${s.color}`}>
        {s.label}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
        <div className="text-cyan-400 font-mono text-sm animate-pulse">Loading Manufacturing Request...</div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4">
        <div className="text-red-400 font-mono text-sm mb-4">Request not found or access restricted.</div>
        <Link href="/manufacturing" className="text-cyan-400 text-sm hover:underline">
          Return to Manufacturing Home
        </Link>
      </div>
    );
  }

  const quote = request.current_quote;
  const quoteVersion = quote?.current_version;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/manufacturing" className="text-sm font-medium text-neutral-400 hover:text-white transition">
              &larr; Manufacturing
            </Link>
            <span className="text-neutral-600">/</span>
            <span className="text-sm font-mono text-white truncate max-w-xs">{request.title}</span>
          </div>
          <div className="flex items-center gap-3">
            {getStatusBadge(request.status)}
            {request.cancellation_requested && (
              <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800">
                Cancel Review
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {actionSuccess && (
          <div className="mb-6 p-4 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-sm flex items-center justify-between">
            <span>{actionSuccess}</span>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-white text-xs">Dismiss</button>
          </div>
        )}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-lg bg-red-950/60 border border-red-800 text-red-300 text-sm flex items-center justify-between">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white text-xs">Dismiss</button>
          </div>
        )}

        {/* Title Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{request.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-400 font-mono">
              <span>ID: {request.id.slice(0, 8)}...</span>
              <span>•</span>
              <span className="capitalize">{request.prototype_type.replace("_", " ")}</span>
              <span>•</span>
              <span>Qty: {request.quantity}</span>
              <span>•</span>
              <span>Created: {new Date(request.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          {request.status !== "cancelled" && request.status !== "completed" && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="self-start sm:self-auto text-xs font-medium text-neutral-400 hover:text-red-400 border border-neutral-800 hover:border-red-900 px-3 py-1.5 rounded transition"
            >
              Cancel Request
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-neutral-800 mb-8 flex gap-6 text-sm font-medium">
          {(["overview", "clarifications", "quote", "files", "history"] as const).map((tab) => {
            const openClarCount = request.clarifications.filter((c) => c.status === "awaiting_response").length;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 capitalize transition relative ${
                  activeTab === tab
                    ? "text-cyan-400 border-b-2 border-cyan-400 font-semibold"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {tab}
                {tab === "clarifications" && openClarCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full bg-orange-950 text-orange-400 border border-orange-800 text-[10px] font-mono">
                    {openClarCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="p-6 rounded-xl bg-neutral-900/50 border border-neutral-800">
                <h3 className="text-sm font-mono text-cyan-400 uppercase tracking-wider mb-3">Project Overview</h3>
                <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">{request.project_overview}</p>
              </div>

              <div className="p-6 rounded-xl bg-neutral-900/50 border border-neutral-800">
                <h3 className="text-sm font-mono text-cyan-400 uppercase tracking-wider mb-4">Engineering Specifications</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-xs font-mono text-neutral-500 uppercase">Materials / Substrate</dt>
                    <dd className="mt-1 text-neutral-200 font-medium">{request.materials || "Not specified"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-mono text-neutral-500 uppercase">Dimensions</dt>
                    <dd className="mt-1 text-neutral-200 font-medium">{request.dimensions || "Not specified"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-mono text-neutral-500 uppercase">PCB / Assembly Details</dt>
                    <dd className="mt-1 text-neutral-200 font-medium">{request.pcb_hardware_details || "Not specified"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-mono text-neutral-500 uppercase">Target Delivery</dt>
                    <dd className="mt-1 text-neutral-200 font-medium">{request.delivery_requirements || "Standard delivery"}</dd>
                  </div>
                </dl>

                {request.technical_requirements && (
                  <div className="mt-6 pt-6 border-t border-neutral-800">
                    <dt className="text-xs font-mono text-neutral-500 uppercase mb-2">Tolerances & Quality Standards</dt>
                    <dd className="text-sm text-neutral-300 whitespace-pre-wrap">{request.technical_requirements}</dd>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              {/* Quote summary card */}
              <div className="p-6 rounded-xl bg-neutral-900/60 border border-neutral-800">
                <h3 className="text-sm font-mono text-cyan-400 uppercase tracking-wider mb-3">Active Quote</h3>
                {quoteVersion ? (
                  <div>
                    <div className="text-2xl font-bold text-white">₹{quoteVersion.total}</div>
                    <div className="text-xs text-neutral-400 mt-1">
                      Includes {quoteVersion.tax.type} (₹{quoteVersion.tax.amount})
                    </div>
                    <button
                      onClick={() => setActiveTab("quote")}
                      className="mt-4 w-full py-2 px-3 rounded bg-neutral-800 hover:bg-neutral-700 text-cyan-400 text-xs font-medium transition"
                    >
                      View Quote Breakdown &rarr;
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-neutral-400">
                    Engineering quote under preparation. You will be notified once ready.
                  </div>
                )}
              </div>

              {/* Status Note */}
              <div className="p-6 rounded-xl bg-neutral-900/40 border border-neutral-800 text-xs text-neutral-400 space-y-2">
                <div className="font-semibold text-neutral-200">Execution Guarantees</div>
                <p>All manufacturing orders are subject to DFM verification and locked engineering sign-off.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "clarifications" && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-neutral-900/30 border border-neutral-800 text-xs text-neutral-400">
              Structured clarification items raised by VenopAI engineers. Once you reply to all pending questions, your request returns directly to engineering review.
            </div>

            {request.clarifications.length === 0 ? (
              <div className="p-12 text-center rounded-xl bg-neutral-900/30 border border-neutral-800 text-neutral-500 text-sm">
                No clarifications have been requested for this project.
              </div>
            ) : (
              <div className="space-y-4">
                {request.clarifications.map((c) => (
                  <div key={c.id} className="p-6 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-neutral-800 text-cyan-400 border border-neutral-700">
                          Engineering Query
                        </span>
                        <div className="mt-2 text-sm text-neutral-100 font-medium">{c.question}</div>
                      </div>
                      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                        c.status === "awaiting_response"
                          ? "bg-orange-950 text-orange-400 border border-orange-800"
                          : "bg-emerald-950 text-emerald-400 border border-emerald-800"
                      }`}>
                        {c.status.replace("_", " ")}
                      </span>
                    </div>

                    {c.response ? (
                      <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 text-sm">
                        <div className="text-xs font-mono text-neutral-500 mb-1">Your Response:</div>
                        <div className="text-neutral-300">{c.response.text}</div>
                      </div>
                    ) : (
                      <div>
                        {replyingClarId === c.id ? (
                          <div className="space-y-3 pt-2">
                            <textarea
                              value={responseText}
                              onChange={(e) => setResponseText(e.target.value)}
                              rows={3}
                              placeholder="Provide technical clarification..."
                              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-cyan-500"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setReplyingClarId(null);
                                  setResponseText("");
                                }}
                                className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleClarificationReply(c.id)}
                                disabled={isSubmittingReply}
                                className="px-4 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-semibold text-xs transition disabled:opacity-50"
                              >
                                {isSubmittingReply ? "Submitting..." : "Submit Answer"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setReplyingClarId(c.id);
                              setResponseText("");
                            }}
                            className="px-3.5 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-cyan-400 text-xs font-medium border border-neutral-700 transition"
                          >
                            Answer Query &rarr;
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "quote" && (
          <div className="max-w-3xl mx-auto">
            {quoteVersion ? (
              <div className="p-8 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-6">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">Quotation Version {quoteVersion.version_number}</h3>
                    <div className="text-xs font-mono text-neutral-400">
                      Scope: {quoteVersion.scope_summary || "Manufacturing realization"}
                    </div>
                  </div>
                  <span className="text-xs font-mono uppercase px-2.5 py-1 rounded bg-neutral-800 text-cyan-400 border border-neutral-700">
                    {quote?.status}
                  </span>
                </div>

                {/* Line Items */}
                <div className="divide-y divide-neutral-800">
                  {quoteVersion.line_items.map((item, idx) => (
                    <div key={idx} className="py-3 flex items-center justify-between text-sm">
                      <span className="text-neutral-300">{item.description || item.name}</span>
                      <span className="font-mono text-neutral-100 font-medium">₹{item.amount}</span>
                    </div>
                  ))}
                </div>

                {/* Totals Breakdown */}
                <div className="pt-4 border-t border-neutral-800 space-y-2 text-sm font-mono">
                  <div className="flex justify-between text-neutral-400">
                    <span>Subtotal</span>
                    <span>₹{quoteVersion.subtotal}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Shipping</span>
                    <span>₹{quoteVersion.shipping_amount}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>{quoteVersion.tax.type} (18%)</span>
                    <span>₹{quoteVersion.tax.amount}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-white pt-2 border-t border-neutral-800">
                    <span>Total Amount</span>
                    <span className="text-cyan-400">₹{quoteVersion.total}</span>
                  </div>
                </div>

                {quoteVersion.terms && (
                  <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-400">
                    <span className="font-semibold text-neutral-300">Terms & Timeline: </span>
                    {quoteVersion.terms} ({quoteVersion.estimated_timeline || "Standard lead time"})
                  </div>
                )}

                {/* Quote Actions */}
                {quote?.status === "sent" && (
                  <div className="pt-6 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-end gap-3">
                    <button
                      onClick={() => setShowRejectForm(true)}
                      disabled={isQuoteActionLoading}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-neutral-700 hover:border-red-800 text-neutral-300 hover:text-red-400 text-xs font-medium transition"
                    >
                      Request Revision / Reject
                    </button>
                    <button
                      onClick={() => handleApproveQuote(quote.id)}
                      disabled={isQuoteActionLoading}
                      className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold text-xs transition shadow-lg shadow-emerald-500/20"
                    >
                      {isQuoteActionLoading ? "Processing..." : "Accept Quotation"}
                    </button>
                  </div>
                )}

                {/* Reject form modal/inline */}
                {showRejectForm && (
                  <div className="p-4 rounded-lg bg-red-950/40 border border-red-800 space-y-3">
                    <div className="text-xs font-semibold text-red-300">Provide Feedback for Revision</div>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                      placeholder="e.g. Please adjust quantity or remove optional anodizing finish..."
                      className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-xs text-white focus:outline-none focus:border-red-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowRejectForm(false)}
                        className="px-3 py-1 text-xs text-neutral-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleRejectQuote(quote.id)}
                        disabled={isQuoteActionLoading}
                        className="px-4 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
                      >
                        Confirm Rejection
                      </button>
                    </div>
                  </div>
                )}

                {/* Payment button if payment_pending */}
                {request.status === "payment_pending" && (
                  <div className="p-6 rounded-lg bg-purple-950/40 border border-purple-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-purple-200">Quotation Accepted — Ready for Payment</div>
                      <div className="text-xs text-neutral-400 mt-1">Unlock production execution via Razorpay payment gateway.</div>
                    </div>
                    <Link
                      href={`/checkout/payment?quote_id=${quote.id}`}
                      className="px-6 py-2.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-neutral-950 font-semibold text-xs transition shadow-lg shadow-purple-500/25"
                    >
                      Pay ₹{quoteVersion.total} with Razorpay &rarr;
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-12 text-center rounded-xl bg-neutral-900/30 border border-neutral-800 text-neutral-500 text-sm">
                No quotation is currently active for this request.
              </div>
            )}
          </div>
        )}

        {activeTab === "files" && (
          <div className="space-y-8">
            {/* Team Deliverables */}
            <div>
              <h3 className="text-sm font-mono text-cyan-400 uppercase tracking-wider mb-4">Engineering Deliverables</h3>
              {request.files.delivered && request.files.delivered.length > 0 ? (
                <div className="divide-y divide-neutral-800 border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/40">
                  {request.files.delivered.map((f) => (
                    <div key={f.id} className="p-4 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                          DELIVERABLE
                        </span>
                        <span className="font-medium text-white">{f.filename}</span>
                        <span className="text-xs font-mono text-neutral-500">
                          ({Math.round(f.size_bytes / 1024)} KB)
                        </span>
                      </div>
                      <button
                        onClick={() => handleDownloadFile(f.id)}
                        className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-cyan-400 text-xs font-medium transition"
                      >
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-xl bg-neutral-900/20 border border-neutral-800 text-xs text-neutral-500">
                  Deliverable packages (e.g. test reports, inspection logs) will appear here as milestones complete.
                </div>
              )}
            </div>

            {/* Customer Uploads */}
            <div>
              <h3 className="text-sm font-mono text-neutral-400 uppercase tracking-wider mb-4">Your Uploaded Files</h3>
              {request.files.customer_uploaded && request.files.customer_uploaded.length > 0 ? (
                <div className="divide-y divide-neutral-800 border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/40">
                  {request.files.customer_uploaded.map((f) => (
                    <div key={f.id} className="p-4 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                          CUSTOMER
                        </span>
                        <span className="font-medium text-neutral-200">{f.filename}</span>
                        <span className="text-xs font-mono text-neutral-500">
                          ({Math.round(f.size_bytes / 1024)} KB)
                        </span>
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">
                          {f.scan_status}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDownloadFile(f.id)}
                        className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition"
                      >
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-xl bg-neutral-900/20 border border-neutral-800 text-xs text-neutral-500">
                  No files were attached with this request.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="relative pl-6 border-l-2 border-neutral-800 space-y-8">
              {history.map((event, idx) => (
                <div key={idx} className="relative group">
                  <span className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-neutral-900 border-2 border-cyan-400" />
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm font-semibold text-white">{event.title}</span>
                    <span className="text-xs font-mono text-neutral-500">
                      {event.timestamp ? new Date(event.timestamp).toLocaleString() : ""}
                    </span>
                  </div>
                  {event.description && (
                    <p className="mt-1 text-xs text-neutral-400 leading-relaxed">{event.description}</p>
                  )}
                  <div className="mt-1 text-[10px] font-mono text-cyan-500">Actor: {event.actor}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Cancellation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full p-6 rounded-xl bg-neutral-900 border border-neutral-800 space-y-4">
            <h3 className="text-lg font-bold text-white">Cancel Manufacturing Request</h3>
            <p className="text-xs text-neutral-400">
              Pre-execution requests are cancelled immediately. If execution has already commenced, your request will be routed to engineering review for partial refund determination.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="Reason for cancellation..."
              className="w-full bg-neutral-950 border border-neutral-700 rounded p-3 text-xs text-white focus:outline-none focus:border-red-500"
            />
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 text-xs text-neutral-400 hover:text-white"
              >
                Go Back
              </button>
              <button
                onClick={handleCancelRequest}
                disabled={isCancelling}
                className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition"
              >
                {isCancelling ? "Processing..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
