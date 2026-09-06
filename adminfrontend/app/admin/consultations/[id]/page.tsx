"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { adminConsultationsApi } from "@/lib/api/client";

interface ClarificationItem {
  id: string;
  question: string;
  raised_at: string;
  status: string;
  response_text?: string;
  responded_at?: string;
}

interface ConsultationDetail {
  id: string;
  user_id: string;
  topic: string;
  description: string;
  status: string;
  admin_response?: string;
  internal_notes?: string;
  converted_quote_id?: string;
  created_at: string;
  updated_at: string;
  clarifications: ClarificationItem[];
}

export default function AdminConsultationDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [consultation, setConsultation] = useState<ConsultationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Respond form
  const [adminResponse, setAdminResponse] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);

  // Clarification form
  const [newClarQuestion, setNewClarQuestion] = useState("");
  const [isRaisingClar, setIsRaisingClar] = useState(false);

  // Quote conversion modal
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [lineItems, setLineItems] = useState([{ name: "", amount: "" }]);
  const [quoteTimeline, setQuoteTimeline] = useState("2 weeks");
  const [quoteTerms, setQuoteTerms] = useState("Net 15 terms upon deliverable acceptance");
  const [quoteScope, setQuoteScope] = useState("");
  const [isConvertingQuote, setIsConvertingQuote] = useState(false);

  // Close modal
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeNotes, setCloseNotes] = useState("");
  const [isClosing, setIsClosing] = useState(false);

  const fetchDetail = async () => {
    try {
      const res = await adminConsultationsApi.getRequest(id);
      if (res?.data) {
        setConsultation(res.data);
        if (res.data.admin_response) setAdminResponse(res.data.admin_response);
        if (res.data.internal_notes) setInternalNotes(res.data.internal_notes);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load consultation";
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

  const handleSendResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminResponse.trim()) return;
    setIsSubmittingResponse(true);
    try {
      await adminConsultationsApi.respond(id, {
        admin_response: adminResponse.trim(),
        internal_notes: internalNotes.trim() || undefined,
      });
      alert("Technical response published successfully.");
      await fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to publish response";
      alert(msg);
    } finally {
      setIsSubmittingResponse(false);
    }
  };

  const handleRaiseClarification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClarQuestion.trim()) return;
    setIsRaisingClar(true);
    try {
      await adminConsultationsApi.raiseClarification(id, newClarQuestion.trim());
      setNewClarQuestion("");
      await fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to raise clarification";
      alert(msg);
    } finally {
      setIsRaisingClar(false);
    }
  };

  const handleResolveClarification = async (clarId: string) => {
    try {
      await adminConsultationsApi.resolveClarification(id, clarId);
      await fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resolve";
      alert(msg);
    }
  };

  const handleAddLineItem = () => {
    setLineItems([...lineItems, { name: "", amount: "" }]);
  };

  const handleConvertToQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = lineItems.filter((i) => i.name.trim() && i.amount.trim());
    if (validItems.length === 0) {
      alert("Please add at least one line item with a price.");
      return;
    }
    setIsConvertingQuote(true);
    try {
      await adminConsultationsApi.convertToQuote(id, {
        line_items: validItems,
        estimated_timeline: quoteTimeline,
        terms: quoteTerms,
        scope_summary: quoteScope || `Converted from consultation: ${consultation?.topic}`,
      });
      setShowQuoteModal(false);
      alert("Consultation converted to billable Quote successfully!");
      await fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to convert to quote";
      alert(msg);
    } finally {
      setIsConvertingQuote(false);
    }
  };

  const handleCloseConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsClosing(true);
    try {
      await adminConsultationsApi.close(id, { notes: closeNotes.trim() || undefined });
      setShowCloseModal(false);
      await fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to close consultation";
      alert(msg);
    } finally {
      setIsClosing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-xs font-mono text-zinc-400">
        Loading consultation...
      </div>
    );
  }

  if (!consultation) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
        <p className="text-red-400 text-sm">{errorMessage || "Consultation not found."}</p>
        <Link href="/admin/consultations" className="text-xs text-emerald-400 hover:underline mt-4 block">
          &larr; Return to Queue
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/admin/consultations" className="text-xs text-zinc-400 hover:text-white transition">
              &larr; Consultations Queue
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-xs font-mono text-zinc-400">{consultation.id}</span>
          </div>
          <h1 className="text-xl font-bold text-white mt-1">{consultation.topic}</h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono uppercase bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded border border-zinc-700">
            {consultation.status}
          </span>
          {!consultation.converted_quote_id && (
            <button
              onClick={() => setShowQuoteModal(true)}
              className="text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded transition"
            >
              Convert to Formal Quote &rarr;
            </button>
          )}
          {consultation.status !== "closed" && (
            <button
              onClick={() => setShowCloseModal(true)}
              className="text-xs text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-700 px-3 py-1.5 rounded transition"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {consultation.converted_quote_id && (
        <div className="p-4 rounded-xl border border-purple-800 bg-purple-950/30 flex items-center justify-between text-xs">
          <span className="text-purple-300">
            This consultation has been converted into Quotation: <strong className="font-mono">{consultation.converted_quote_id}</strong>
          </span>
          <Link
            href={`/admin/quotes/${consultation.converted_quote_id}`}
            className="text-purple-400 hover:text-purple-300 font-semibold"
          >
            Open Quote in Operations &rarr;
          </Link>
        </div>
      )}

      {/* Customer Context */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
        <h2 className="text-xs font-mono uppercase text-zinc-400">Customer Technical Inquiry</h2>
        <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed bg-zinc-950 p-4 rounded-lg border border-zinc-800 font-sans">
          {consultation.description}
        </p>
      </div>

      {/* Admin Technical Response Form */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
        <h2 className="text-xs font-mono uppercase text-emerald-400">Engineering Response</h2>
        <form onSubmit={handleSendResponse} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-300 mb-1 font-medium">
              Technical Answer (Visible to Customer)
            </label>
            <textarea
              rows={6}
              value={adminResponse}
              onChange={(e) => setAdminResponse(e.target.value)}
              placeholder="Provide component recommendations, schematic review feedback, circuit equations, or layout guidelines..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-300 mb-1 font-medium">
              Internal Team Notes (Private to Admin Staff)
            </label>
            <textarea
              rows={2}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Private discussion notes, manufacturer part pricing references, engineering hours..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmittingResponse}
            className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 py-2 rounded transition shadow-sm disabled:opacity-50"
          >
            {isSubmittingResponse ? "Publishing..." : "Publish Technical Response"}
          </button>
        </form>
      </div>

      {/* Clarifications Section */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-6">
        <h2 className="text-xs font-mono uppercase text-zinc-400">Discussion & Clarifications</h2>

        {/* Raise New Question */}
        <form onSubmit={handleRaiseClarification} className="flex gap-3">
          <input
            type="text"
            value={newClarQuestion}
            onChange={(e) => setNewClarQuestion(e.target.value)}
            placeholder="Ask the customer a clarifying question..."
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isRaisingClar || !newClarQuestion.trim()}
            className="text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-4 py-2 rounded transition disabled:opacity-50"
          >
            {isRaisingClar ? "Posting..." : "+ Raise Question"}
          </button>
        </form>

        {/* Thread List */}
        <div className="space-y-3">
          {consultation.clarifications?.map((c) => (
            <div key={c.id} className="p-4 rounded-lg border border-zinc-800 bg-zinc-950 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Q: {c.question}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${c.status === "resolved" ? "bg-emerald-950 text-emerald-400 border-emerald-800" : "bg-orange-950 text-orange-400 border-orange-800"}`}>
                    {c.status}
                  </span>
                  {c.status !== "resolved" && (
                    <button
                      onClick={() => handleResolveClarification(c.id)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 underline"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
              {c.response_text && (
                <div className="pl-3 border-l-2 border-emerald-500 text-zinc-300">
                  <span className="text-zinc-500 text-[10px] block">Customer Response:</span>
                  {c.response_text}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quote Conversion Modal */}
      {showQuoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Convert to Formal Quotation</h3>
            <p className="text-xs text-zinc-400">
              Create a billable quote linked to this consultation. Customer will be notified to review and approve.
            </p>

            <form onSubmit={handleConvertToQuote} className="space-y-4 text-xs">
              <div className="space-y-2">
                <label className="block text-zinc-300 font-medium">Line Items</label>
                {lineItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Service Item Description"
                      value={item.name}
                      onChange={(e) => {
                        const copy = [...lineItems];
                        copy[idx].name = e.target.value;
                        setLineItems(copy);
                      }}
                      className="flex-1 rounded border border-zinc-700 bg-zinc-950 p-2 text-white placeholder-zinc-500 focus:outline-none"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Amount (e.g. 15000.00)"
                      value={item.amount}
                      onChange={(e) => {
                        const copy = [...lineItems];
                        copy[idx].amount = e.target.value;
                        setLineItems(copy);
                      }}
                      className="w-32 rounded border border-zinc-700 bg-zinc-950 p-2 text-white placeholder-zinc-500 focus:outline-none font-mono"
                      required
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddLineItem}
                  className="text-xs text-emerald-400 hover:text-emerald-300"
                >
                  + Add Line Item
                </button>
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

              <div>
                <label className="block text-zinc-300 mb-1">Commercial Terms</label>
                <input
                  type="text"
                  value={quoteTerms}
                  onChange={(e) => setQuoteTerms(e.target.value)}
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
                  disabled={isConvertingQuote}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-semibold px-4 py-1.5 rounded transition disabled:opacity-50"
                >
                  {isConvertingQuote ? "Generating..." : "Generate Quote"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Mark Consultation Closed</h3>
            <form onSubmit={handleCloseConsultation} className="space-y-4 text-xs">
              <textarea
                rows={3}
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                placeholder="Reason or closing summary notes..."
                className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-white placeholder-zinc-500 focus:outline-none"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="text-zinc-400 hover:text-white px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isClosing}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-4 py-1.5 rounded transition"
                >
                  {isClosing ? "Closing..." : "Close Consultation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
