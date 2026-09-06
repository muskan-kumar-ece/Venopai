"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { softwareApi } from "@/lib/api/client";

interface ClarificationItem {
  id: string;
  question: string;
  raised_at: string;
  status: string;
  response_text?: string;
  responded_at?: string;
}

interface StatusUpdateItem {
  id: string;
  note: string;
  created_at: string;
}

interface FileItem {
  id: string;
  filename: string;
  source: string;
  size_bytes: number;
  created_at: string;
}

interface QuoteItem {
  id: string;
  status: string;
  total_paise: number;
  line_items: Array<{ name?: string; description?: string; amount: string }>;
}

interface SoftwareDetail {
  id: string;
  title: string;
  project_overview: string;
  status: string;
  hardware_platform?: string;
  programming_language?: string;
  os_framework?: string;
  interfaces_protocols?: string;
  repository_url?: string;
  deliverables_required?: string;
  target_timeline?: string;
  cancellation_requested: boolean;
  cancellation_reason?: string;
  cancellation_decision?: string;
  created_at: string;
  updated_at: string;
  clarifications: ClarificationItem[];
  status_updates: StatusUpdateItem[];
  files: FileItem[];
  active_quote?: QuoteItem;
}

export default function SoftwareRequestDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [softwareReq, setSoftwareReq] = useState<SoftwareDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Clarification response
  const [activeClarId, setActiveClarId] = useState<string | null>(null);
  const [clarResponseText, setClarResponseText] = useState("");
  const [isRespondingClar, setIsRespondingClar] = useState(false);

  // Cancellation modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  // Complete action
  const [isCompleting, setIsCompleting] = useState(false);

  const fetchDetail = async () => {
    try {
      const res = await softwareApi.getRequest(id);
      if (res?.data) {
        setSoftwareReq(res.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load software request detail";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchDetail();
    }
  }, [id]);

  const handleSendClarification = async (clarId: string) => {
    if (!clarResponseText.trim()) return;
    setIsRespondingClar(true);
    try {
      await softwareApi.respondClarification(id, clarId, clarResponseText.trim());
      setClarResponseText("");
      setActiveClarId(null);
      await fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to respond";
      alert(msg);
    } finally {
      setIsRespondingClar(false);
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReason.trim()) return;
    setIsCancelling(true);
    try {
      await softwareApi.cancelRequest(id, cancelReason.trim());
      setShowCancelModal(false);
      await fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to request cancellation";
      alert(msg);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleCompleteRequest = async () => {
    if (!confirm("Confirm receipt and satisfaction with all deliverables? This will complete the software engagement.")) return;
    setIsCompleting(true);
    try {
      await softwareApi.completeRequest(id);
      await fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to mark completed";
      alert(msg);
    } finally {
      setIsCompleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      submitted: { label: "Submitted", color: "bg-blue-950 text-blue-400 border-blue-800" },
      under_review: { label: "Under Review", color: "bg-amber-950 text-amber-400 border-amber-800" },
      clarification_needed: { label: "Clarification Needed", color: "bg-orange-950 text-orange-400 border-orange-800 animate-pulse" },
      requirements_confirmed: { label: "Requirements Confirmed", color: "bg-indigo-950 text-indigo-400 border-indigo-800" },
      quote_ready: { label: "Quote Ready", color: "bg-emerald-950 text-emerald-400 border-emerald-800 animate-pulse" },
      in_progress: { label: "In Progress", color: "bg-indigo-950 text-indigo-400 border-indigo-800" },
      completed_execution: { label: "Build Complete", color: "bg-purple-950 text-purple-400 border-purple-800" },
      delivered: { label: "Deliverables Ready", color: "bg-emerald-950 text-emerald-400 border-emerald-800" },
      completed: { label: "Completed", color: "bg-neutral-800 text-neutral-300 border-neutral-700" },
      cancelled: { label: "Cancelled", color: "bg-red-950 text-red-400 border-red-800" },
    };
    const s = map[status] || { label: status, color: "bg-neutral-800 text-neutral-300 border-neutral-700" };
    return (
      <span className={`text-[10px] font-mono uppercase px-2.5 py-0.5 rounded border ${s.color}`}>
        {s.label}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-indigo-400 font-mono text-sm animate-pulse">
        Loading firmware project #{id?.slice(0, 8)}...
      </div>
    );
  }

  if (!softwareReq) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4">
        <h2 className="text-xl font-bold mb-2">Software Request Not Found</h2>
        <p className="text-sm text-neutral-400 mb-6">{errorMessage || "Unable to retrieve requested software project."}</p>
        <Link href="/software/requests" className="text-sm text-indigo-400 hover:underline">
          &larr; Return to Software Requests
        </Link>
      </div>
    );
  }

  const deliverables = softwareReq.files?.filter((f) => f.source === "team_deliverable") || [];
  const customerFiles = softwareReq.files?.filter((f) => f.source !== "team_deliverable") || [];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 pb-20">
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/software/requests" className="text-sm font-medium text-neutral-400 hover:text-white transition">
              &larr; Software Requests
            </Link>
            <span className="text-neutral-600">/</span>
            <span className="text-xs font-mono text-neutral-400 truncate max-w-xs">{softwareReq.title}</span>
          </div>
          <div className="flex items-center gap-3">
            {getStatusBadge(softwareReq.status)}
            {softwareReq.status === "delivered" && (
              <button
                onClick={handleCompleteRequest}
                disabled={isCompleting}
                className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-neutral-950 px-3 py-1.5 rounded-md transition shadow-md shadow-emerald-500/20"
              >
                {isCompleting ? "Completing..." : "Accept & Complete Project"}
              </button>
            )}
            {softwareReq.status !== "cancelled" && !softwareReq.cancellation_requested && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="text-xs text-red-400 hover:text-red-300 px-2.5 py-1 rounded border border-red-900/50 bg-red-950/30 transition"
              >
                Cancel Request
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Cancellation Notice Banner */}
        {softwareReq.cancellation_requested && (
          <div className="rounded-xl border border-red-800 bg-red-950/40 p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-red-300 uppercase font-mono">Cancellation Review Pending</span>
              <p className="text-xs text-red-200">
                Reason: &ldquo;{softwareReq.cancellation_reason}&rdquo; — An engineering manager is reviewing your request.
              </p>
            </div>
          </div>
        )}

        {/* Active Quote Banner */}
        {softwareReq.active_quote && (
          <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase bg-emerald-900/80 text-emerald-300 px-2 py-0.5 rounded">
                  Formal Quotation Available
                </span>
                <span className="text-xs text-emerald-400 font-mono">Status: {softwareReq.active_quote.status}</span>
              </div>
              <p className="text-xs text-neutral-300 mt-1">
                Total: ₹{(softwareReq.active_quote.total_paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <Link
              href={`/quotes/${softwareReq.active_quote.id}`}
              className="inline-flex items-center text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-neutral-950 px-4 py-2 rounded-lg transition shrink-0 shadow-md shadow-emerald-500/20"
            >
              Review & Approve Quotation &rarr;
            </Link>
          </div>
        )}

        {/* Deliverables Banner */}
        {deliverables.length > 0 && (
          <div className="rounded-xl border border-indigo-800/80 bg-gradient-to-r from-indigo-950/40 to-neutral-900/60 p-6 space-y-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Software & Firmware Deliverables Ready
              </h3>
              <p className="text-xs text-neutral-300 mt-0.5">
                Official firmware builds, flash programming scripts, and source archives published by the software engineering team.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {deliverables.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border border-neutral-800 bg-neutral-950/80">
                  <div className="flex items-center gap-2.5 truncate">
                    <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    <span className="text-xs font-mono text-neutral-200 truncate">{d.filename}</span>
                  </div>
                  <a
                    href={`/api/v1/files/${d.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-400 hover:text-indigo-300 ml-2 font-mono shrink-0"
                  >
                    Download
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Project Details Overview Card */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 sm:p-8 space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">{softwareReq.title}</h1>
              <p className="text-xs text-neutral-400 font-mono mt-1">
                Requested on {new Date(softwareReq.created_at).toLocaleDateString()} &bull; Target: {softwareReq.target_timeline || "Standard"}
              </p>
            </div>
            {softwareReq.hardware_platform && (
              <span className="text-xs font-mono bg-neutral-800 text-neutral-300 px-2.5 py-1 rounded">
                {softwareReq.hardware_platform}
              </span>
            )}
          </div>

          <div>
            <h3 className="text-xs font-mono uppercase text-neutral-400 mb-2">Scope of Work</h3>
            <p className="text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed bg-neutral-950 p-4 rounded-lg border border-neutral-800">
              {softwareReq.project_overview}
            </p>
          </div>

          {/* Technical Specifications */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
            {softwareReq.programming_language && (
              <div className="p-3 rounded border border-neutral-800 bg-neutral-950">
                <span className="text-neutral-500 block mb-1">Language:</span>
                <span className="text-neutral-200 font-mono">{softwareReq.programming_language}</span>
              </div>
            )}
            {softwareReq.os_framework && (
              <div className="p-3 rounded border border-neutral-800 bg-neutral-950">
                <span className="text-neutral-500 block mb-1">OS / Framework:</span>
                <span className="text-neutral-200 font-mono">{softwareReq.os_framework}</span>
              </div>
            )}
            {softwareReq.interfaces_protocols && (
              <div className="p-3 rounded border border-neutral-800 bg-neutral-950">
                <span className="text-neutral-500 block mb-1">Protocols & Interfaces:</span>
                <span className="text-neutral-200">{softwareReq.interfaces_protocols}</span>
              </div>
            )}
            {softwareReq.repository_url && (
              <div className="p-3 rounded border border-neutral-800 bg-neutral-950">
                <span className="text-neutral-500 block mb-1">Repository:</span>
                <a
                  href={softwareReq.repository_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 hover:underline font-mono truncate block"
                >
                  {softwareReq.repository_url}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Customer Attachments */}
        {customerFiles.length > 0 && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 space-y-3">
            <h3 className="text-sm font-semibold text-white">Your Attached Files</h3>
            <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-950">
              {customerFiles.map((f) => (
                <li key={f.id} className="flex items-center justify-between p-3 text-xs">
                  <span className="text-neutral-300 font-mono truncate">{f.filename}</span>
                  <a
                    href={`/api/v1/files/${f.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 font-mono"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Engineering Status Updates Feed */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 sm:p-8 space-y-4">
          <h3 className="text-base font-bold text-white">Development Progress Log</h3>
          {(!softwareReq.status_updates || softwareReq.status_updates.length === 0) ? (
            <p className="text-xs text-neutral-500 italic">No progress updates posted yet.</p>
          ) : (
            <div className="space-y-3">
              {softwareReq.status_updates.map((u) => (
                <div key={u.id} className="p-3.5 rounded-lg border border-neutral-800 bg-neutral-950 space-y-1">
                  <p className="text-sm text-neutral-200 whitespace-pre-wrap">{u.note}</p>
                  <span className="text-[10px] font-mono text-neutral-500 block">
                    {new Date(u.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clarifications / Discussion Thread */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Technical Clarifications</h3>
            <span className="text-xs font-mono text-neutral-500">
              {softwareReq.clarifications?.length || 0} questions
            </span>
          </div>

          {(!softwareReq.clarifications || softwareReq.clarifications.length === 0) ? (
            <p className="text-xs text-neutral-500 italic">No open clarifications.</p>
          ) : (
            <div className="space-y-4">
              {softwareReq.clarifications.map((item) => (
                <div key={item.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <span className="text-xs font-mono text-indigo-400">Engineering Staff Query:</span>
                      <p className="text-sm text-white font-medium">{item.question}</p>
                    </div>
                    <span className="text-[10px] font-mono text-neutral-500">
                      {new Date(item.raised_at).toLocaleDateString()}
                    </span>
                  </div>

                  {item.response_text ? (
                    <div className="mt-3 pl-4 border-l-2 border-indigo-500 space-y-1">
                      <span className="text-xs font-mono text-neutral-400">Your Response:</span>
                      <p className="text-sm text-neutral-200">{item.response_text}</p>
                    </div>
                  ) : (
                    <div className="mt-3 pt-3 border-t border-neutral-800">
                      {activeClarId === item.id ? (
                        <div className="space-y-2">
                          <textarea
                            rows={3}
                            value={clarResponseText}
                            onChange={(e) => setClarResponseText(e.target.value)}
                            placeholder="Provide your clarification or repo link..."
                            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-indigo-500 focus:outline-none"
                          />
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveClarId(null);
                                setClarResponseText("");
                              }}
                              className="text-xs text-neutral-400 hover:text-white px-2.5 py-1"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={isRespondingClar || !clarResponseText.trim()}
                              onClick={() => handleSendClarification(item.id)}
                              className="text-xs font-semibold bg-indigo-500 hover:bg-indigo-400 text-neutral-950 px-3 py-1 rounded transition disabled:opacity-50"
                            >
                              {isRespondingClar ? "Sending..." : "Submit Answer"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveClarId(item.id);
                            setClarResponseText("");
                          }}
                          className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
                        >
                          + Answer this clarification &rarr;
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Cancellation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Request Cancellation</h3>
            <p className="text-xs text-neutral-400">
              Please provide the reason for requesting cancellation of this embedded software project.
            </p>
            <form onSubmit={handleCancelSubmit} className="space-y-4">
              <textarea
                rows={4}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-red-500 focus:outline-none"
                required
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="text-xs text-neutral-400 hover:text-white px-3 py-1.5"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isCancelling}
                  className="text-xs font-semibold bg-red-600 hover:bg-red-500 text-white px-4 py-1.5 rounded transition disabled:opacity-50"
                >
                  {isCancelling ? "Submitting..." : "Confirm Cancellation Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
