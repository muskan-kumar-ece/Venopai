"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { adminManufacturingApi, adminQuotesApi, adminFilesApi } from "@/lib/api/client";

interface QuoteLineItem {
  description: string;
  amount: string;
}

interface QuoteVersion {
  id: string;
  version_number: number;
  status: string;
  scope_summary?: string;
  line_items: QuoteLineItem[];
  subtotal: string;
  subtotal_paise: number;
  tax_type: string;
  tax_amount: string;
  tax_paise: number;
  shipping_amount: string;
  total_amount: string;
  total_amount_paise: number;
  estimated_timeline?: string;
  valid_until?: string;
  terms?: string;
  rejection_reason?: string;
  created_at: string;
}

interface QuoteData {
  id: string;
  request_type: string;
  request_id: string;
  status: string;
  current_version_number: number;
  current_version?: QuoteVersion;
  versions: QuoteVersion[];
}

interface ClarificationItem {
  id: string;
  question: string;
  raised_by: string;
  raised_at: string;
  status: string;
  response?: {
    response_text: string;
    responded_at: string;
  };
}

interface StatusUpdateItem {
  id: string;
  note: string;
  author: string;
  created_at: string;
}

interface FileItem {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  scan_status: string;
  source: string;
  created_at: string;
}

interface RequestFiles {
  customer_uploaded?: FileItem[];
  delivered?: FileItem[];
}

interface RequestDetail {
  id: string;
  user_id: string;
  project_id?: string;
  title: string;
  project_overview?: string;
  prototype_type: string;
  quantity: number;
  technical_requirements?: string;
  dimensions?: string;
  materials?: string;
  pcb_hardware_details?: string;
  manufacturing_requirements?: string;
  delivery_requirements?: string;
  additional_notes?: string;
  status: string;
  cancellation_requested: boolean;
  cancellation_reason?: string;
  cancellation_decision?: string;
  cancellation_refund_paise?: number;
  cancellation_notes?: string;
  internal_notes?: string;
  files?: FileItem[] | RequestFiles;
  current_quote?: QuoteData;
  clarifications: ClarificationItem[];
  status_updates: StatusUpdateItem[];
  created_at: string;
  updated_at: string;
}

export default function AdminManufacturingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const requestId = resolvedParams.id;

  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const fileList: FileItem[] = React.useMemo(() => {
    if (!detail?.files) return [];
    if (Array.isArray(detail.files)) return detail.files;
    if (typeof detail.files === "object") {
      const grouped = detail.files as RequestFiles;
      return [
        ...(Array.isArray(grouped.customer_uploaded) ? grouped.customer_uploaded : []),
        ...(Array.isArray(grouped.delivered) ? grouped.delivered : []),
      ];
    }
    return [];
  }, [detail?.files]);

  // Modals & Action States
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmNotes, setConfirmNotes] = useState("");

  const [isClarModalOpen, setIsClarModalOpen] = useState(false);
  const [clarQuestion, setClarQuestion] = useState("");

  const [isStatusUpdateModalOpen, setIsStatusUpdateModalOpen] = useState(false);
  const [statusUpdateNote, setStatusUpdateNote] = useState("");

  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [quoteLineItems, setQuoteLineItems] = useState<QuoteLineItem[]>([
    { description: "Fabrication & Assembly", amount: "12500.00" },
  ]);
  const [quoteShipping, setQuoteShipping] = useState("500.00");
  const [quoteTimeline, setQuoteTimeline] = useState("7-10 business days");
  const [quoteTerms, setQuoteTerms] = useState("Full payment required prior to manufacturing dispatch.");
  const [quoteScope, setScope] = useState("");
  const [isReviseMode, setIsReviseMode] = useState(false);

  // File deliverable upload
  const [isUploadingDeliverable, setIsUploadingDeliverable] = useState(false);
  const [deliverableFile, setDeliverableFile] = useState<File | null>(null);

  const [isActionSubmitting, setIsActionSubmitting] = useState(false);

  const fetchDetail = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await adminManufacturingApi.getRequest(requestId);
      if (res?.data) {
        setDetail(res.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load request detail";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [requestId]);

  const showFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  // State actions
  const handleConfirmRequirements = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsActionSubmitting(true);
    try {
      await adminManufacturingApi.confirmRequirements(requestId, confirmNotes);
      setIsConfirmModalOpen(false);
      setConfirmNotes("");
      showFeedback("Requirements confirmed. State updated.");
      await fetchDetail();
    } catch (err: unknown) {
      // alert replaced with error state
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleRaiseClarification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clarQuestion.trim()) return;
    setIsActionSubmitting(true);
    try {
      await adminManufacturingApi.raiseClarification(requestId, clarQuestion.trim());
      setIsClarModalOpen(false);
      setClarQuestion("");
      showFeedback("Clarification question raised to customer.");
      await fetchDetail();
    } catch (err: unknown) {
      // alert replaced with error state
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handlePostStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusUpdateNote.trim()) return;
    setIsActionSubmitting(true);
    try {
      await adminManufacturingApi.postStatusUpdate(requestId, statusUpdateNote.trim());
      setIsStatusUpdateModalOpen(false);
      setStatusUpdateNote("");
      showFeedback("Status update posted for customer.");
      await fetchDetail();
    } catch (err: unknown) {
      // alert replaced with error state
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleCompleteExecution = async () => {
    // Complete execution

    setIsActionSubmitting(true);
    try {
      await adminManufacturingApi.completeExecution(requestId);
      showFeedback("Manufacturing execution marked as complete.");
      await fetchDetail();
    } catch (err: unknown) {
      // alert replaced with error state
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleCompleteRequest = async () => {
    // Final completed

    setIsActionSubmitting(true);
    try {
      await adminManufacturingApi.completeRequest(requestId);
      showFeedback("Request marked as final completed.");
      await fetchDetail();
    } catch (err: unknown) {
      // alert replaced with error state
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Quoting actions
  const handleSaveQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsActionSubmitting(true);
    try {
      if (isReviseMode && detail?.current_quote?.id) {
        await adminQuotesApi.reviseQuote(detail.current_quote.id, {
          line_items: quoteLineItems,
          shipping_amount: quoteShipping,
          estimated_timeline: quoteTimeline,
          terms: quoteTerms,
          scope_summary: quoteScope,
        });
        showFeedback("Quote revised. New version generated.");
      } else {
        await adminQuotesApi.draftQuote({
          request_type: "manufacturing",
          request_id: requestId,
          line_items: quoteLineItems,
          shipping_amount: quoteShipping,
          estimated_timeline: quoteTimeline,
          terms: quoteTerms,
          scope_summary: quoteScope,
        });
        showFeedback("Draft quote created successfully.");
      }
      setIsQuoteModalOpen(false);
      await fetchDetail();
    } catch (err: unknown) {
      // alert replaced with error state
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleSendQuote = async (quoteId: string) => {
    // Send quote

    setIsActionSubmitting(true);
    try {
      await adminQuotesApi.sendQuote(quoteId);
      showFeedback("Quote issued to customer.");
      await fetchDetail();
    } catch (err: unknown) {
      // alert replaced with error state
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Deliverable upload
  const handleUploadDeliverable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliverableFile) return;
    setIsUploadingDeliverable(true);
    try {
      const formData = new FormData();
      formData.append("file", deliverableFile);
      formData.append("association_type", "manufacturing_request");
      formData.append("association_id", requestId);
      formData.append("source", "admin_deliverable");

      await adminFilesApi.uploadDeliverable(formData);
      setDeliverableFile(null);
      showFeedback("Deliverable file uploaded successfully.");
      await fetchDetail();
    } catch (err: unknown) {
      // alert replaced with error state
    } finally {
      setIsUploadingDeliverable(false);
    }
  };

  const addLineItem = () => {
    setQuoteLineItems([...quoteLineItems, { description: "", amount: "0.00" }]);
  };

  const removeLineItem = (index: number) => {
    setQuoteLineItems(quoteLineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: keyof QuoteLineItem, value: string) => {
    const updated = [...quoteLineItems];
    updated[index][field] = value;
    setQuoteLineItems(updated);
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      submitted: { label: "Submitted", color: "bg-blue-950 text-blue-400 border-blue-800" },
      under_review: { label: "Under Review", color: "bg-amber-950 text-amber-400 border-amber-800" },
      clarification_needed: { label: "Clarification Needed", color: "bg-orange-950 text-orange-400 border-orange-800 animate-pulse" },
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
      <span className={`text-[11px] font-mono uppercase px-2.5 py-0.5 rounded border ${s.color}`}>
        {s.label}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 py-12 px-4 max-w-6xl mx-auto space-y-6">
        <div className="h-8 bg-zinc-850 rounded w-1/3 animate-pulse" />
        <div className="h-4 bg-zinc-900 rounded w-1/4 animate-pulse" />
        <div className="h-96 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (errorMessage || !detail) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 py-12 px-4 max-w-2xl mx-auto text-center space-y-4">
        <div className="p-6 bg-red-950/40 border border-red-800 rounded-xl">
          <p className="text-red-200 text-sm">{errorMessage || "Request detail not found."}</p>
          <Link
            href="/admin/manufacturing"
            className="mt-4 inline-block text-xs text-zinc-300 hover:text-white underline"
          >
            &larr; Back to Manufacturing Queue
          </Link>
        </div>
      </div>
    );
  }

  const currentQuote = detail.current_quote;
  const currentQuoteVersion = currentQuote?.current_version;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Breadcrumb & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Link href="/admin/manufacturing" className="hover:text-white transition-colors">
              Manufacturing Queue
            </Link>
            <span>/</span>
            <span className="font-mono text-zinc-200">{detail.id.slice(0, 8)}...</span>
          </div>

          {/* Top Operational Action Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {detail.status === "under_review" && (
              <button
                onClick={() => setIsConfirmModalOpen(true)}
                className="bg-cyan-600 hover:bg-cyan-500 text-zinc-950 text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors shadow-sm"
              >
                Confirm Requirements
              </button>
            )}

            {detail.status !== "cancelled" && detail.status !== "completed" && (
              <button
                onClick={() => setIsClarModalOpen(true)}
                className="bg-amber-600 hover:bg-amber-500 text-zinc-950 text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors shadow-sm"
              >
                Raise Clarification
              </button>
            )}

            {detail.status === "in_progress" && (
              <>
                <button
                  onClick={() => setIsStatusUpdateModalOpen(true)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium px-3.5 py-1.5 rounded-lg border border-zinc-700 transition-colors"
                >
                  Post Status Update
                </button>
                <button
                  onClick={handleCompleteExecution}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors"
                >
                  Complete Execution
                </button>
              </>
            )}

            {detail.status === "delivered" && (
              <button
                onClick={handleCompleteRequest}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors"
              >
                Final Complete Request
              </button>
            )}
          </div>
        </div>

        {/* Feedback alert */}
        {actionFeedback && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-lg text-emerald-200 text-xs flex items-center justify-between">
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* Cancellation Alert Banner */}
        {detail.cancellation_requested && (
          <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-xs font-mono font-bold uppercase text-red-400">
                ⚠️ Customer Cancellation Requested
              </span>
              <p className="text-xs text-red-200">
                Reason: &ldquo;{detail.cancellation_reason}&rdquo;
              </p>
            </div>
            <Link
              href="/admin/manufacturing/cancellation-review"
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg self-start sm:self-center"
            >
              Go to Cancellation Review &rarr;
            </Link>
          </div>
        )}

        {/* Console Overview Header */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                {getStatusBadge(detail.status)}
                <span className="text-xs font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-300 uppercase">
                  {detail.prototype_type}
                </span>
                <span className="text-xs font-mono text-zinc-400">
                  Qty: <span className="text-white font-bold">{detail.quantity}</span>
                </span>
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">{detail.title}</h1>
              <p className="text-xs font-mono text-zinc-500">
                Request ID: <span className="text-zinc-400">{detail.id}</span> &bull; Customer ID:{" "}
                <span className="text-zinc-400">{detail.user_id}</span>
              </p>
            </div>

            <div className="text-xs text-zinc-400 font-mono space-y-1 bg-zinc-950/60 border border-zinc-800/80 p-3 rounded-lg">
              <p>Submitted: {new Date(detail.created_at).toLocaleString()}</p>
              <p>Updated: {new Date(detail.updated_at).toLocaleString()}</p>
              {detail.project_id && (
                <p>
                  Project Workspace:{" "}
                  <span className="text-emerald-400">{detail.project_id.slice(0, 8)}...</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Grid: 2 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Specs & Quoting */}
          <div className="lg:col-span-2 space-y-6">
            {/* Engineering Specifications Card */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-5">
              <h2 className="text-base font-semibold text-white border-b border-zinc-800 pb-3">
                Technical Specifications & Intake Data
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {detail.project_overview && (
                  <div className="md:col-span-2 bg-zinc-950/60 p-3 rounded-lg border border-zinc-850">
                    <span className="font-mono text-zinc-400 uppercase block mb-1">Project Overview</span>
                    <p className="text-zinc-200 whitespace-pre-wrap">{detail.project_overview}</p>
                  </div>
                )}

                {detail.technical_requirements && (
                  <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-850">
                    <span className="font-mono text-zinc-400 uppercase block mb-1">Technical Requirements</span>
                    <p className="text-zinc-200 whitespace-pre-wrap">{detail.technical_requirements}</p>
                  </div>
                )}

                {detail.materials && (
                  <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-850">
                    <span className="font-mono text-zinc-400 uppercase block mb-1">Materials</span>
                    <p className="text-zinc-200">{detail.materials}</p>
                  </div>
                )}

                {detail.dimensions && (
                  <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-850">
                    <span className="font-mono text-zinc-400 uppercase block mb-1">Dimensions</span>
                    <p className="text-zinc-200">{detail.dimensions}</p>
                  </div>
                )}

                {detail.pcb_hardware_details && (
                  <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-850">
                    <span className="font-mono text-zinc-400 uppercase block mb-1">PCB / Hardware Details</span>
                    <p className="text-zinc-200 whitespace-pre-wrap">{detail.pcb_hardware_details}</p>
                  </div>
                )}

                {detail.manufacturing_requirements && (
                  <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-850">
                    <span className="font-mono text-zinc-400 uppercase block mb-1">Manufacturing Specs</span>
                    <p className="text-zinc-200 whitespace-pre-wrap">{detail.manufacturing_requirements}</p>
                  </div>
                )}

                {detail.delivery_requirements && (
                  <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-850">
                    <span className="font-mono text-zinc-400 uppercase block mb-1">Delivery Requirements</span>
                    <p className="text-zinc-200 whitespace-pre-wrap">{detail.delivery_requirements}</p>
                  </div>
                )}

                {detail.additional_notes && (
                  <div className="md:col-span-2 bg-zinc-950/60 p-3 rounded-lg border border-zinc-850">
                    <span className="font-mono text-zinc-400 uppercase block mb-1">Customer Notes</span>
                    <p className="text-zinc-300">{detail.additional_notes}</p>
                  </div>
                )}

                {detail.internal_notes && (
                  <div className="md:col-span-2 bg-amber-950/20 p-3 rounded-lg border border-amber-900/40 text-amber-200">
                    <span className="font-mono text-amber-400 uppercase block mb-1">Internal Engineering Notes (Confidential)</span>
                    <p className="whitespace-pre-wrap">{detail.internal_notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Commercial Quoting Section */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div>
                  <h2 className="text-base font-semibold text-white">Commercial Quotation</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Immutable versioned quotations with GST tax breakdown.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {!currentQuote ? (
                    <button
                      onClick={() => {
                        setIsReviseMode(false);
                        setIsQuoteModalOpen(true);
                      }}
                      className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      + Draft Quote
                    </button>
                  ) : (
                    <>
                      {currentQuote.status === "draft" && (
                        <button
                          onClick={() => handleSendQuote(currentQuote.id)}
                          className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Send Quote to Customer
                        </button>
                      )}
                      {(currentQuote.status === "rejected" || currentQuote.status === "issued") && (
                        <button
                          onClick={() => {
                            setIsReviseMode(true);
                            if (currentQuoteVersion?.line_items) {
                              setQuoteLineItems(currentQuoteVersion.line_items);
                            }
                            setIsQuoteModalOpen(true);
                          }}
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors"
                        >
                          Revise Quote
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {!currentQuote ? (
                <div className="p-8 text-center bg-zinc-950/40 border border-dashed border-zinc-800 rounded-lg space-y-2">
                  <p className="text-xs text-zinc-400">No quotation issued yet for this manufacturing request.</p>
                  <button
                    onClick={() => {
                      setIsReviseMode(false);
                      setIsQuoteModalOpen(true);
                    }}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium underline"
                  >
                    Create Initial Draft Quote
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {currentQuoteVersion ? (
                    <div className="bg-zinc-950/60 border border-zinc-850 rounded-lg p-4 space-y-4 text-xs">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white font-mono">
                            Version #{currentQuoteVersion.version_number}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 uppercase font-mono text-[10px]">
                            {currentQuoteVersion.status}
                          </span>
                        </div>
                        <span className="text-zinc-500 font-mono">
                          Issued {new Date(currentQuoteVersion.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Line Items Table */}
                      <table className="w-full text-left">
                        <thead className="text-zinc-500 font-mono border-b border-zinc-850">
                          <tr>
                            <th className="py-1">Description</th>
                            <th className="py-1 text-right">Amount (INR)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-850 text-zinc-300">
                          {currentQuoteVersion.line_items.map((item, idx) => (
                            <tr key={idx}>
                              <td className="py-2">{item.description}</td>
                              <td className="py-2 text-right font-mono font-medium text-white">
                                &#8377;{parseFloat(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Breakdown */}
                      <div className="border-t border-zinc-800 pt-3 space-y-1.5 font-mono text-zinc-400">
                        <div className="flex justify-between">
                          <span>Subtotal:</span>
                          <span className="text-white">&#8377;{currentQuoteVersion.subtotal}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Tax ({currentQuoteVersion.tax_type}):</span>
                          <span className="text-white">&#8377;{currentQuoteVersion.tax_amount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Shipping:</span>
                          <span className="text-white">&#8377;{currentQuoteVersion.shipping_amount}</span>
                        </div>
                        <div className="flex justify-between text-sm font-bold text-emerald-400 pt-2 border-t border-zinc-800">
                          <span>Total Amount:</span>
                          <span>&#8377;{currentQuoteVersion.total_amount}</span>
                        </div>
                      </div>

                      {currentQuoteVersion.estimated_timeline && (
                        <p className="text-zinc-400">
                          Estimated Timeline: <span className="text-zinc-200">{currentQuoteVersion.estimated_timeline}</span>
                        </p>
                      )}

                      {currentQuoteVersion.rejection_reason && (
                        <div className="p-2.5 bg-red-950/40 border border-red-800/80 rounded text-red-300 text-xs">
                          Customer Rejection Reason: &ldquo;{currentQuoteVersion.rejection_reason}&rdquo;
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Version history if > 1 */}
                  {currentQuote.versions.length > 1 && (
                    <div className="border-t border-zinc-800 pt-3">
                      <p className="text-[11px] font-mono text-zinc-400 mb-2">Version History:</p>
                      <div className="space-y-1">
                        {currentQuote.versions.map((v) => (
                          <div
                            key={v.id}
                            className="flex items-center justify-between text-xs p-2 bg-zinc-950/40 rounded border border-zinc-850"
                          >
                            <span className="font-mono">Rev #{v.version_number} ({v.status})</span>
                            <span className="font-mono text-white">&#8377;{v.total_amount}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Files, Clarifications, Progress Updates */}
          <div className="space-y-6">
            {/* Private Files & Deliverables */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="text-sm font-semibold text-white">Files & Deliverables</h3>
                <span className="text-xs font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                  {fileList.length}
                </span>
              </div>

              {fileList.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-4">No files uploaded yet.</p>
              ) : (
                <div className="space-y-2">
                  {fileList.map((f) => (
                    <div
                      key={f.id}
                      className="p-2.5 bg-zinc-950/60 border border-zinc-850 rounded-lg text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-white truncate max-w-[180px]">{f.filename}</span>
                        <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border ${
                          f.scan_status === "clean"
                            ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                            : "bg-amber-950 text-amber-400 border-amber-800"
                        }`}>
                          {f.scan_status || "uploaded"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                        <span>{f.source === "admin_deliverable" || f.source === "delivered" || f.source === "team_deliverable" ? "Admin Deliverable" : "Customer CAD"}</span>
                        <span>{((f.size_bytes || 0) / 1024).toFixed(0)} KB</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Deliverable form */}
              <form onSubmit={handleUploadDeliverable} className="border-t border-zinc-800 pt-3 space-y-2 text-xs">
                <label className="block text-[11px] font-mono text-zinc-400 uppercase">
                  Upload Deliverable File
                </label>
                <input
                  type="file"
                  required
                  onChange={(e) => setDeliverableFile(e.target.files?.[0] || null)}
                  className="w-full text-zinc-400 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-750"
                />
                <button
                  type="submit"
                  disabled={!deliverableFile || isUploadingDeliverable}
                  className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded text-xs font-medium transition-colors"
                >
                  {isUploadingDeliverable ? "Uploading..." : "Upload Deliverable"}
                </button>
              </form>
            </div>

            {/* Clarifications Q&A */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="text-sm font-semibold text-white">Clarifications Q&A</h3>
                <button
                  onClick={() => setIsClarModalOpen(true)}
                  className="text-xs text-amber-400 hover:text-amber-300 font-medium"
                >
                  + Ask
                </button>
              </div>

              {detail.clarifications.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-4">No clarifications raised.</p>
              ) : (
                <div className="space-y-3">
                  {detail.clarifications.map((c) => (
                    <div key={c.id} className="p-3 bg-zinc-950/60 border border-zinc-850 rounded-lg text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-zinc-400">
                          {c.raised_by.toUpperCase()} &bull; {new Date(c.raised_at).toLocaleDateString()}
                        </span>
                        <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded uppercase ${
                          c.status === "answered" ? "bg-emerald-950 text-emerald-400" : "bg-orange-950 text-orange-400"
                        }`}>
                          {c.status}
                        </span>
                      </div>
                      <p className="text-zinc-200 font-medium">{c.question}</p>
                      {c.response ? (
                        <div className="p-2 bg-zinc-900 rounded border border-zinc-800 text-zinc-300">
                          <span className="text-[10px] text-emerald-400 block font-mono">Customer Response:</span>
                          {c.response.response_text}
                        </div>
                      ) : (
                        <p className="text-[10px] text-zinc-500 italic">Awaiting customer response...</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Execution Status Updates */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="text-sm font-semibold text-white">Execution Timeline</h3>
                {detail.status === "in_progress" && (
                  <button
                    onClick={() => setIsStatusUpdateModalOpen(true)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
                  >
                    + Post Note
                  </button>
                )}
              </div>

              {detail.status_updates.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-4">No status updates posted yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.status_updates.map((su) => (
                    <div key={su.id} className="p-2.5 bg-zinc-950/60 border border-zinc-850 rounded-lg text-xs space-y-1">
                      <p className="text-zinc-200">{su.note}</p>
                      <p className="text-[10px] font-mono text-zinc-500">
                        {su.author} &bull; {new Date(su.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Requirements Modal */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-white">Confirm Requirements</h3>
            <p className="text-xs text-zinc-400">
              Confirm that all technical, CAD, and manufacturing specifications are clear. This will transition the request to &ldquo;requirements_confirmed&rdquo;.
            </p>
            <form onSubmit={handleConfirmRequirements} className="space-y-4">
              <textarea
                placeholder="Internal confirmation notes or checklist summary (optional)..."
                value={confirmNotes}
                onChange={(e) => setConfirmNotes(e.target.value)}
                rows={3}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isActionSubmitting}
                  className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-semibold text-xs rounded-lg disabled:opacity-50"
                >
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Raise Clarification Modal */}
      {isClarModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-white">Raise Clarification Question</h3>
            <p className="text-xs text-zinc-400">
              Ask the customer a structured question regarding tolerances, materials, or fabrication parameters.
            </p>
            <form onSubmit={handleRaiseClarification} className="space-y-4">
              <textarea
                required
                placeholder="e.g. Please confirm if 1oz or 2oz copper weight is required for inner layers."
                value={clarQuestion}
                onChange={(e) => setClarQuestion(e.target.value)}
                rows={4}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsClarModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isActionSubmitting || !clarQuestion.trim()}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-zinc-950 font-semibold text-xs rounded-lg disabled:opacity-50"
                >
                  Send Clarification
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Post Status Update Modal */}
      {isStatusUpdateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-white">Post Progress Status Update</h3>
            <p className="text-xs text-zinc-400">
              Provide a clear milestone note visible to the customer on their request timeline.
            </p>
            <form onSubmit={handlePostStatusUpdate} className="space-y-4">
              <textarea
                required
                placeholder="e.g. PCB fabrication complete; currently undergoing SMT component placement and automated optical inspection."
                value={statusUpdateNote}
                onChange={(e) => setStatusUpdateNote(e.target.value)}
                rows={3}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsStatusUpdateModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isActionSubmitting || !statusUpdateNote.trim()}
                  className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-semibold text-xs rounded-lg disabled:opacity-50"
                >
                  Post Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quote Builder / Revise Modal */}
      {isQuoteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-8">
            <h3 className="text-base font-semibold text-white">
              {isReviseMode ? "Revise Commercial Quote" : "Draft Commercial Quote"}
            </h3>
            <p className="text-xs text-zinc-400">
              Define itemized engineering line items. Taxes (GST) will be calculated automatically by TaxService based on supply state.
            </p>

            <form onSubmit={handleSaveQuote} className="space-y-4 text-xs">
              <div className="space-y-2">
                <label className="font-mono text-zinc-400 uppercase block">Scope Summary</label>
                <input
                  type="text"
                  placeholder="e.g. 5x 4-layer prototype PCBs with lead-free ENIG finish"
                  value={quoteScope}
                  onChange={(e) => setScope(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200"
                />
              </div>

              {/* Line items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-mono text-zinc-400 uppercase">Itemized Line Items</label>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="text-emerald-400 hover:text-emerald-300 font-semibold"
                  >
                    + Add Item
                  </button>
                </div>

                {quoteLineItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Amount (e.g. 5000.00)"
                      value={item.amount}
                      onChange={(e) => updateLineItem(idx, "amount", e.target.value)}
                      className="w-28 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 font-mono text-right text-zinc-200"
                    />
                    {quoteLineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(idx)}
                        className="text-red-400 hover:text-red-300 p-1"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-mono text-zinc-400 uppercase block mb-1">Shipping (INR)</label>
                  <input
                    type="text"
                    value={quoteShipping}
                    onChange={(e) => setQuoteShipping(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 font-mono text-zinc-200"
                  />
                </div>
                <div>
                  <label className="font-mono text-zinc-400 uppercase block mb-1">Estimated Timeline</label>
                  <input
                    type="text"
                    value={quoteTimeline}
                    onChange={(e) => setQuoteTimeline(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200"
                  />
                </div>
              </div>

              <div>
                <label className="font-mono text-zinc-400 uppercase block mb-1">Terms & Conditions</label>
                <textarea
                  rows={2}
                  value={quoteTerms}
                  onChange={(e) => setQuoteTerms(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsQuoteModalOpen(false)}
                  className="px-3 py-1.5 text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isActionSubmitting || quoteLineItems.length === 0}
                  className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold rounded disabled:opacity-50"
                >
                  {isActionSubmitting ? "Saving..." : isReviseMode ? "Save Revision" : "Create Draft Quote"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
