"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { adminSoftwareApi, adminFilesApi, adminQuotesApi } from "@/lib/api/client";

interface ClarificationItem {
  id: string;
  question: string;
  raised_at: string;
  status: string;
  response_text?: string;
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

interface SoftwareDetail {
  id: string;
  user_id: string;
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
  created_at: string;
  updated_at: string;
  clarifications: ClarificationItem[];
  status_updates: StatusUpdateItem[];
  files: FileItem[];
}

export default function AdminSoftwareDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [softwareReq, setSoftwareReq] = useState<SoftwareDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Actions state
  const [confirmNotes, setConfirmNotes] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [clarQuestion, setClarQuestion] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Deliverable upload
  const [isUploadingDeliverable, setIsUploadingDeliverable] = useState(false);

  // Quote modal
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [lineItems, setLineItems] = useState([
    { description: "Board Bring-Up & Peripheral HAL Drivers", amount: "24000.00" },
    { description: "FreeRTOS Application Architecture & CAN Telemetry", amount: "36000.00" },
  ]);
  const [quoteTimeline, setQuoteTimeline] = useState("4 weeks");
  const [isGeneratingQuote, setIsGeneratingQuote] = useState(false);

  const fetchDetail = async () => {
    try {
      const res = await adminSoftwareApi.getRequest(id);
      if (res?.data) {
        setSoftwareReq(res.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load software request";
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

  const handleConfirmRequirements = async () => {
    setIsProcessing(true);
    try {
      await adminSoftwareApi.confirmRequirements(id, confirmNotes.trim() || undefined);
      alert("Requirements confirmed. Project moved to requirements_confirmed.");
      setConfirmNotes("");
      await fetchDetail();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to confirm");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePostStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusNote.trim()) return;
    setIsProcessing(true);
    try {
      await adminSoftwareApi.postStatusUpdate(id, statusNote.trim());
      setStatusNote("");
      await fetchDetail();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to post status update");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRaiseClarification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clarQuestion.trim()) return;
    setIsProcessing(true);
    try {
      await adminSoftwareApi.raiseClarification(id, clarQuestion.trim());
      setClarQuestion("");
      await fetchDetail();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to raise clarification");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResolveClarification = async (clarId: string) => {
    try {
      await adminSoftwareApi.resolveClarification(id, clarId);
      await fetchDetail();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to resolve");
    }
  };

  const handleDeliverableUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingDeliverable(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append("file", files[i]);
        formData.append("association_type", "software");
        formData.append("association_id", id);
        formData.append("source", "team_deliverable");
        await adminFilesApi.uploadDeliverable(formData);
      }
      alert("Deliverable(s) uploaded successfully.");
      await fetchDetail();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploadingDeliverable(false);
      e.target.value = "";
    }
  };

  const handleCompleteExecution = async () => {
    if (!confirm("Mark execution complete (completed_execution)?")) return;
    setIsProcessing(true);
    try {
      await adminSoftwareApi.completeExecution(id);
      await fetchDetail();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompleteRequest = async () => {
    if (!confirm("Mark entire project completed?")) return;
    setIsProcessing(true);
    try {
      await adminSoftwareApi.completeRequest(id);
      await fetchDetail();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGeneratingQuote(true);
    try {
      await adminQuotesApi.draftQuote({
        request_type: "software",
        request_id: id,
        line_items: lineItems,
        estimated_timeline: quoteTimeline,
        scope_summary: `Firmware Engineering Quote for ${softwareReq?.title}`,
      });
      setShowQuoteModal(false);
      alert("Quotation generated successfully!");
      await fetchDetail();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to generate quote");
    } finally {
      setIsGeneratingQuote(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-xs font-mono text-zinc-400">
        Loading firmware project...
      </div>
    );
  }

  if (!softwareReq) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
        <p className="text-red-400 text-sm">{errorMessage || "Software request not found."}</p>
        <Link href="/admin/software" className="text-xs text-indigo-400 hover:underline mt-4 block">
          &larr; Return to Queue
        </Link>
      </div>
    );
  }

  const deliverables = softwareReq.files?.filter((f) => f.source === "team_deliverable") || [];
  const customerFiles = softwareReq.files?.filter((f) => f.source !== "team_deliverable") || [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 sm:p-8 space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/admin/software" className="text-xs text-zinc-400 hover:text-white transition">
              &larr; Software Queue
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-xs font-mono text-zinc-400">{softwareReq.id}</span>
          </div>
          <h1 className="text-xl font-bold text-white mt-1">{softwareReq.title}</h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono uppercase bg-zinc-800 text-indigo-400 border border-zinc-700 px-2.5 py-1 rounded">
            {softwareReq.status}
          </span>
          <button
            onClick={() => setShowQuoteModal(true)}
            className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded transition"
          >
            Create Quote &rarr;
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Requirements & Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Specifications Card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
            <h2 className="text-xs font-mono uppercase text-zinc-400">Software & Firmware Scope</h2>
            <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed bg-zinc-950 p-4 rounded-lg border border-zinc-800">
              {softwareReq.project_overview}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-2">
              <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-500 block">Target MCU/Platform:</span>
                <span className="text-white font-mono">{softwareReq.hardware_platform || "Not specified"}</span>
              </div>
              <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-500 block">Language:</span>
                <span className="text-white font-mono">{softwareReq.programming_language || "C/C++"}</span>
              </div>
              <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-500 block">OS / Framework:</span>
                <span className="text-white font-mono">{softwareReq.os_framework || "Bare-metal"}</span>
              </div>
            </div>

            {softwareReq.interfaces_protocols && (
              <div className="p-3 rounded bg-zinc-950 border border-zinc-800 text-xs">
                <span className="text-zinc-500 block mb-1">Interfaces & Protocols:</span>
                <span className="text-zinc-200">{softwareReq.interfaces_protocols}</span>
              </div>
            )}
            {softwareReq.repository_url && (
              <div className="p-3 rounded bg-zinc-950 border border-zinc-800 text-xs">
                <span className="text-zinc-500 block mb-1">Customer Repository:</span>
                <a
                  href={softwareReq.repository_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 hover:underline font-mono"
                >
                  {softwareReq.repository_url}
                </a>
              </div>
            )}
          </div>

          {/* Deliverables Section */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-mono uppercase text-indigo-400">Team Deliverables (Binaries / Archives)</h2>
              <label className="cursor-pointer text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-zinc-950 px-3 py-1 rounded transition">
                <span>{isUploadingDeliverable ? "Uploading..." : "+ Upload Firmware/Code"}</span>
                <input
                  type="file"
                  multiple
                  disabled={isUploadingDeliverable}
                  onChange={handleDeliverableUpload}
                  className="hidden"
                />
              </label>
            </div>

            {deliverables.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">No firmware binaries or code archives uploaded yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {deliverables.map((d) => (
                  <div key={d.id} className="flex items-center justify-between p-2.5 rounded border border-zinc-800 bg-zinc-950">
                    <span className="font-mono text-zinc-300 truncate">{d.filename}</span>
                    <a
                      href={`/api/v1/files/${d.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-400 hover:underline ml-2"
                    >
                      Download
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Progress Log */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
            <h2 className="text-xs font-mono uppercase text-zinc-400">Development Progress Updates</h2>
            <form onSubmit={handlePostStatusUpdate} className="flex gap-2">
              <input
                type="text"
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="Post plain-language status update for customer..."
                className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isProcessing || !statusNote.trim()}
                className="text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded transition disabled:opacity-50"
              >
                Post Update
              </button>
            </form>

            <div className="space-y-2">
              {softwareReq.status_updates?.map((u) => (
                <div key={u.id} className="p-3 rounded border border-zinc-800 bg-zinc-950 text-xs space-y-1">
                  <p className="text-zinc-200">{u.note}</p>
                  <span className="text-[10px] font-mono text-zinc-500 block">
                    {new Date(u.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Actions & Clarifications */}
        <div className="space-y-6">
          {/* Operations Workflow Actions */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4 text-xs">
            <h3 className="font-mono uppercase text-zinc-400 font-bold">Lifecycle Progression</h3>

            {softwareReq.status === "under_review" || softwareReq.status === "submitted" ? (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Confirmation notes (optional)"
                  value={confirmNotes}
                  onChange={(e) => setConfirmNotes(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-white"
                />
                <button
                  onClick={handleConfirmRequirements}
                  disabled={isProcessing}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 rounded transition"
                >
                  Confirm Requirements
                </button>
              </div>
            ) : null}

            {softwareReq.status === "in_progress" && (
              <button
                onClick={handleCompleteExecution}
                disabled={isProcessing}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 rounded transition"
              >
                Mark Code Complete
              </button>
            )}

            {softwareReq.status === "delivered" && (
              <button
                onClick={handleCompleteRequest}
                disabled={isProcessing}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold py-2 rounded transition"
              >
                Mark Project Completed
              </button>
            )}
          </div>

          {/* Customer Uploads */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-3 text-xs">
            <h3 className="font-mono uppercase text-zinc-400 font-bold">Customer Attachments</h3>
            {customerFiles.length === 0 ? (
              <p className="text-zinc-500 italic">No customer files attached.</p>
            ) : (
              <div className="space-y-1.5">
                {customerFiles.map((f) => (
                  <div key={f.id} className="flex items-center justify-between p-2 rounded bg-zinc-950 border border-zinc-800">
                    <span className="font-mono text-zinc-300 truncate max-w-[160px]">{f.filename}</span>
                    <a
                      href={`/api/v1/files/${f.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-400 hover:underline"
                    >
                      Download
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Clarifications */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4 text-xs">
            <h3 className="font-mono uppercase text-zinc-400 font-bold">Clarifications</h3>

            <form onSubmit={handleRaiseClarification} className="space-y-2">
              <input
                type="text"
                placeholder="Ask technical question..."
                value={clarQuestion}
                onChange={(e) => setClarQuestion(e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-white placeholder-zinc-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isProcessing || !clarQuestion.trim()}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-1.5 rounded transition"
              >
                + Raise Clarification
              </button>
            </form>

            <div className="space-y-2">
              {softwareReq.clarifications?.map((c) => (
                <div key={c.id} className="p-3 rounded border border-zinc-800 bg-zinc-950 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">Q: {c.question}</span>
                    {c.status !== "resolved" && (
                      <button
                        onClick={() => handleResolveClarification(c.id)}
                        className="text-emerald-400 hover:underline text-[10px]"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                  {c.response_text && (
                    <div className="pl-2 border-l border-indigo-500 text-zinc-300 text-[11px]">
                      {c.response_text}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quote Modal */}
      {showQuoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4 text-xs">
            <h3 className="text-base font-bold text-white">Generate Firmware Engineering Quotation</h3>
            <form onSubmit={handleCreateQuote} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-zinc-300 font-medium">Line Items</label>
                {lineItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Service Item"
                      value={item.description}
                      onChange={(e) => {
                        const copy = [...lineItems];
                        copy[idx].description = e.target.value;
                        setLineItems(copy);
                      }}
                      className="flex-1 rounded border border-zinc-700 bg-zinc-950 p-2 text-white"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Amount"
                      value={item.amount}
                      onChange={(e) => {
                        const copy = [...lineItems];
                        copy[idx].amount = e.target.value;
                        setLineItems(copy);
                      }}
                      className="w-32 rounded border border-zinc-700 bg-zinc-950 p-2 text-white font-mono"
                      required
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-zinc-300 mb-1">Estimated Timeline</label>
                <input
                  type="text"
                  value={quoteTimeline}
                  onChange={(e) => setQuoteTimeline(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowQuoteModal(false)}
                  className="text-zinc-400 hover:text-white px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingQuote}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-1.5 rounded transition disabled:opacity-50"
                >
                  {isGeneratingQuote ? "Generating..." : "Create Formal Quote"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
