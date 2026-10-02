"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { designApi, filesApi } from "@/lib/api/client";

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

interface DesignDetail {
  id: string;
  title: string;
  project_overview: string;
  status: string;
  layer_count: number;
  dimensions?: string;
  power_requirements?: string;
  key_components?: string;
  deliverables_required?: string;
  target_timeline?: string;
  scope_schematic: boolean;
  scope_layout: boolean;
  scope_component_selection: boolean;
  scope_simulation: boolean;
  scope_firmware_prep: boolean;
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

export default function DesignRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [designReq, setDesignReq] = useState<DesignDetail | null>(null);
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

  // Start Manufacturing action
  const [isStartingMfg, setIsStartingMfg] = useState(false);

  const fetchDetail = async () => {
    try {
      const res = await designApi.getRequest(id);
      if (res?.data) {
        setDesignReq(res.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load design request detail";
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
      await designApi.respondClarification(id, clarId, clarResponseText.trim());
      setClarResponseText("");
      setActiveClarId(null);
      await fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to respond";
      setErrorMessage(msg);
    } finally {
      setIsRespondingClar(false);
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReason.trim()) return;
    setIsCancelling(true);
    try {
      await designApi.cancelRequest(id, cancelReason.trim());
      setShowCancelModal(false);
      await fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to request cancellation";
      setErrorMessage(msg);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleStartManufacturing = async () => {
    // Start manufacturing

    setIsStartingMfg(true);
    try {
      const res = await designApi.startManufacturing(id);
      if (res?.data) {
        sessionStorage.setItem("venopai_mfg_draft", JSON.stringify(res.data));
        router.push("/manufacturing/request?source=design");
      } else {
        router.push("/manufacturing/request");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate manufacturing";
      setErrorMessage(msg);
    } finally {
      setIsStartingMfg(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      submitted: { label: "Submitted", color: "bg-blue-950 text-blue-400 border-blue-800" },
      under_review: { label: "Under Review", color: "bg-amber-950 text-amber-400 border-amber-800" },
      clarification_needed: { label: "Clarification Needed", color: "bg-orange-950 text-orange-400 border-orange-800 animate-pulse" },
      requirements_confirmed: { label: "Requirements Confirmed", color: "bg-cyan-950 text-cyan-400 border-cyan-800" },
      quote_ready: { label: "Quote Ready", color: "bg-emerald-950 text-emerald-400 border-emerald-800 animate-pulse" },
      in_progress: { label: "In Progress", color: "bg-cyan-950 text-cyan-400 border-cyan-800" },
      completed_execution: { label: "Design Complete", color: "bg-indigo-950 text-indigo-400 border-indigo-800" },
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
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-cyan-400 font-mono text-sm animate-pulse">
        Loading design project #{id?.slice(0, 8)}...
      </div>
    );
  }

  if (!designReq) {
    const isAuthError = errorMessage?.includes("401") || errorMessage?.includes("Unauthorized") || errorMessage?.includes("credentials");
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 text-center">
        <h2 className="text-xl font-bold mb-2">{isAuthError ? "Sign In Required" : "Design Request Not Found"}</h2>
        <p className="text-sm text-neutral-400 mb-6">
          {isAuthError
            ? "Please sign in to view and collaborate on this electronics design request."
            : errorMessage || "Unable to retrieve requested design."}
        </p>
        {isAuthError ? (
          <Link
            href={`/login?redirect=${encodeURIComponent(`/design/requests/${id}`)}`}
            className="rounded-xl bg-cyan-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-cyan-500 transition-colors"
          >
            Sign In to Account
          </Link>
        ) : (
          <Link href="/design/requests" className="text-sm text-cyan-400 hover:underline">
            &larr; Return to Design Requests
          </Link>
        )}
      </div>
    );
  }

  const deliverables = designReq.files?.filter((f) => f.source === "team_deliverable") || [];
  const customerFiles = designReq.files?.filter((f) => f.source !== "team_deliverable") || [];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 pb-20">
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/account/design" className="text-sm font-medium text-neutral-400 hover:text-white transition">
              &larr; PCB Design Queue
            </Link>
            <span className="text-neutral-600">/</span>
            <span className="text-xs font-mono text-neutral-400 truncate max-w-xs">{designReq.title}</span>
          </div>
          <div className="flex items-center gap-3">
            {getStatusBadge(designReq.status)}
            {designReq.status !== "cancelled" && !designReq.cancellation_requested && (
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
        {designReq.cancellation_requested && (
          <div className="rounded-xl border border-red-800 bg-red-950/40 p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-red-300 uppercase font-mono">Cancellation Review Pending</span>
              <p className="text-xs text-red-200">
                Reason: &ldquo;{designReq.cancellation_reason}&rdquo; — An engineering manager is reviewing your request.
              </p>
            </div>
          </div>
        )}

        {/* Active Quote Banner */}
        {designReq.active_quote && (
          <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase bg-emerald-900/80 text-emerald-300 px-2 py-0.5 rounded">
                  Formal Quotation Available
                </span>
                <span className="text-xs text-emerald-400 font-mono">Status: {designReq.active_quote.status}</span>
              </div>
              <p className="text-xs text-neutral-300 mt-1">
                Total: ₹{(designReq.active_quote.total_paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <Link
              href={`/account/quotes/${designReq.active_quote.id}`}
              className="inline-flex items-center text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-neutral-950 px-4 py-2 rounded-lg transition shrink-0 shadow-md shadow-emerald-500/20"
            >
              Review & Approve Quotation &rarr;
            </Link>
          </div>
        )}

        {/* Deliverables Banner with Start Manufacturing CTA */}
        {deliverables.length > 0 && (
          <div className="rounded-xl border border-cyan-800/80 bg-gradient-to-r from-cyan-950/40 to-neutral-900/60 p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Official Engineering Deliverables Ready
                </h3>
                <p className="text-xs text-neutral-300 mt-0.5">
                  Verified fabrication-ready files (Gerbers, Schematics, BOM, 3D Models) uploaded by the VenopAI hardware engineering staff.
                </p>
              </div>

              <button
                onClick={handleStartManufacturing}
                disabled={isStartingMfg}
                className="shrink-0 inline-flex items-center text-xs font-bold bg-cyan-400 hover:bg-cyan-300 text-neutral-950 px-4 py-2.5 rounded-lg transition shadow-md shadow-cyan-400/20"
              >
                {isStartingMfg ? "Preparing..." : "⚡ Fabricate This Board (Start Manufacturing)"}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {deliverables.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border border-neutral-800 bg-neutral-950/80">
                  <div className="flex items-center gap-2.5 truncate">
                    <svg className="w-4 h-4 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs font-mono text-neutral-200 truncate">{d.filename}</span>
                  </div>
                  <a
                    href={`/api/v1/files/${d.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-cyan-400 hover:text-cyan-300 ml-2 font-mono shrink-0"
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
              <h1 className="text-2xl font-bold text-white">{designReq.title}</h1>
              <p className="text-xs text-neutral-400 font-mono mt-1">
                Requested on {new Date(designReq.created_at).toLocaleDateString()} &bull; Target: {designReq.target_timeline || "Standard"}
              </p>
            </div>
            <span className="text-xs font-mono bg-neutral-800 text-neutral-300 px-2.5 py-1 rounded">
              {designReq.layer_count} Layers
            </span>
          </div>

          <div>
            <h3 className="text-xs font-mono uppercase text-neutral-400 mb-2">Project Overview</h3>
            <p className="text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed bg-neutral-950 p-4 rounded-lg border border-neutral-800">
              {designReq.project_overview}
            </p>
          </div>

          {/* Scopes Grid */}
          <div>
            <h3 className="text-xs font-mono uppercase text-neutral-400 mb-2">Scopes Included</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className={`p-2.5 rounded border text-xs ${designReq.scope_schematic ? "border-cyan-800 bg-cyan-950/40 text-cyan-300" : "border-neutral-800 text-neutral-600 line-through"}`}>
                Schematic Capture
              </div>
              <div className={`p-2.5 rounded border text-xs ${designReq.scope_layout ? "border-cyan-800 bg-cyan-950/40 text-cyan-300" : "border-neutral-800 text-neutral-600 line-through"}`}>
                PCB Layout
              </div>
              <div className={`p-2.5 rounded border text-xs ${designReq.scope_component_selection ? "border-cyan-800 bg-cyan-950/40 text-cyan-300" : "border-neutral-800 text-neutral-600 line-through"}`}>
                BOM & Sourcing
              </div>
              <div className={`p-2.5 rounded border text-xs ${designReq.scope_simulation ? "border-cyan-800 bg-cyan-950/40 text-cyan-300" : "border-neutral-800 text-neutral-600 line-through"}`}>
                SI/PI Simulation
              </div>
              <div className={`p-2.5 rounded border text-xs ${designReq.scope_firmware_prep ? "border-cyan-800 bg-cyan-950/40 text-cyan-300" : "border-neutral-800 text-neutral-600 line-through"}`}>
                Firmware Bring-up Readiness
              </div>
            </div>
          </div>

          {/* Technical Specifications */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
            {designReq.dimensions && (
              <div className="p-3 rounded border border-neutral-800 bg-neutral-950">
                <span className="text-neutral-500 block mb-1">Dimensions:</span>
                <span className="text-neutral-200 font-mono">{designReq.dimensions}</span>
              </div>
            )}
            {designReq.power_requirements && (
              <div className="p-3 rounded border border-neutral-800 bg-neutral-950">
                <span className="text-neutral-500 block mb-1">Power Architecture:</span>
                <span className="text-neutral-200">{designReq.power_requirements}</span>
              </div>
            )}
            {designReq.key_components && (
              <div className="p-3 rounded border border-neutral-800 bg-neutral-950">
                <span className="text-neutral-500 block mb-1">Key Components:</span>
                <span className="text-neutral-200 font-mono">{designReq.key_components}</span>
              </div>
            )}
            {designReq.deliverables_required && (
              <div className="p-3 rounded border border-neutral-800 bg-neutral-950">
                <span className="text-neutral-500 block mb-1">Requested Deliverables:</span>
                <span className="text-neutral-200">{designReq.deliverables_required}</span>
              </div>
            )}
          </div>
        </div>

        {/* Customer Attachments */}
        {customerFiles.length > 0 && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 space-y-3">
            <h3 className="text-sm font-semibold text-white">Your Uploaded Files</h3>
            <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-950">
              {customerFiles.map((f) => (
                <li key={f.id} className="flex items-center justify-between p-3 text-xs">
                  <span className="text-neutral-300 font-mono truncate">{f.filename}</span>
                  <a
                    href={`/api/v1/files/${f.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 font-mono"
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
          <h3 className="text-base font-bold text-white">Engineering Progress Log</h3>
          {(!designReq.status_updates || designReq.status_updates.length === 0) ? (
            <p className="text-xs text-neutral-500 italic">No progress logs posted yet.</p>
          ) : (
            <div className="space-y-3">
              {designReq.status_updates.map((u) => (
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
            <h3 className="text-base font-bold text-white">Engineering Clarifications</h3>
            <span className="text-xs font-mono text-neutral-500">
              {designReq.clarifications?.length || 0} questions
            </span>
          </div>

          {(!designReq.clarifications || designReq.clarifications.length === 0) ? (
            <p className="text-xs text-neutral-500 italic">No open clarifications.</p>
          ) : (
            <div className="space-y-4">
              {designReq.clarifications.map((item) => (
                <div key={item.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <span className="text-xs font-mono text-cyan-400">Engineering Staff Query:</span>
                      <p className="text-sm text-white font-medium">{item.question}</p>
                    </div>
                    <span className="text-[10px] font-mono text-neutral-500">
                      {new Date(item.raised_at).toLocaleDateString()}
                    </span>
                  </div>

                  {item.response_text ? (
                    <div className="mt-3 pl-4 border-l-2 border-cyan-500 space-y-1">
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
                            placeholder="Provide design clarification..."
                            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-cyan-500 focus:outline-none"
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
                              className="text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-neutral-950 px-3 py-1 rounded transition disabled:opacity-50"
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
                          className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition"
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
              Please explain why you need to cancel this hardware design project. An engineering manager will evaluate the current progress and determine refund eligibility.
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
