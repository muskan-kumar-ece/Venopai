"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { consultationsApi, filesApi } from "@/lib/api/client";

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
  topic: string;
  description: string;
  status: string;
  admin_response?: string;
  converted_quote_id?: string;
  created_at: string;
  updated_at: string;
  clarifications: ClarificationItem[];
}

export default function ConsultationDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [consultation, setConsultation] = useState<ConsultationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Response to clarification
  const [activeClarId, setActiveClarId] = useState<string | null>(null);
  const [clarResponseText, setClarResponseText] = useState("");
  const [isResponding, setIsResponding] = useState(false);

  // Resolving consultation
  const [isResolving, setIsResolving] = useState(false);

  const fetchDetail = async () => {
    try {
      const res = await consultationsApi.getRequest(id);
      if (res?.data) {
        setConsultation(res.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load consultation detail";
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

  const handleSendClarificationResponse = async (clarificationId: string) => {
    if (!clarResponseText.trim()) return;
    setIsResponding(true);
    try {
      await consultationsApi.respondClarification(id, clarificationId, clarResponseText.trim());
      setClarResponseText("");
      setActiveClarId(null);
      await fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to respond to clarification";
      setErrorMessage(msg);
    } finally {
      setIsResponding(false);
    }
  };

  const handleResolveConsultation = async () => {
    // Resolve consultation

    setIsResolving(true);
    try {
      await consultationsApi.resolveRequest(id);
      await fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resolve consultation";
      setErrorMessage(msg);
    } finally {
      setIsResolving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      submitted: { label: "Submitted", color: "bg-blue-950 text-blue-400 border-blue-800" },
      in_progress: { label: "In Review", color: "bg-amber-950 text-amber-400 border-amber-800" },
      responded: { label: "Answer Ready", color: "bg-emerald-950 text-emerald-400 border-emerald-800" },
      closed: { label: "Closed", color: "bg-neutral-800 text-neutral-300 border-neutral-700" },
      completed: { label: "Completed", color: "bg-neutral-800 text-neutral-300 border-neutral-700" },
    };
    const s = map[status] || { label: status, color: "bg-neutral-800 text-neutral-300 border-neutral-700" };
    return (
      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${s.color}`}>
        {s.label}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-emerald-400 font-mono text-sm animate-pulse">
        Loading technical consultation #{id?.slice(0, 8)}...
      </div>
    );
  }

  if (!consultation) {
    const isAuthError = errorMessage?.includes("401") || errorMessage?.includes("Unauthorized") || errorMessage?.includes("credentials");
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 text-center">
        <h2 className="text-xl font-bold mb-2">{isAuthError ? "Sign In Required" : "Consultation Not Found"}</h2>
        <p className="text-sm text-neutral-400 mb-6">
          {isAuthError
            ? "Please sign in to view and interact with this technical consultation inquiry."
            : errorMessage || "The requested consultation could not be retrieved."}
        </p>
        {isAuthError ? (
          <Link
            href={`/login?redirect=${encodeURIComponent(`/consultations/${id}`)}`}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
          >
            Sign In to Account
          </Link>
        ) : (
          <Link href="/consultations" className="text-sm text-emerald-400 hover:underline">
            &larr; Return to Consultations
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 pb-20">
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/consultations" className="text-sm font-medium text-neutral-400 hover:text-white transition">
              &larr; Consultations
            </Link>
            <span className="text-neutral-600">/</span>
            <span className="text-xs font-mono text-neutral-400 truncate max-w-xs">{consultation.topic}</span>
          </div>
          <div className="flex items-center gap-3">
            {getStatusBadge(consultation.status)}
            {consultation.status !== "closed" && consultation.status !== "completed" && (
              <button
                onClick={handleResolveConsultation}
                disabled={isResolving}
                className="text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 px-3 py-1.5 rounded-md transition"
              >
                {isResolving ? "Resolving..." : "Mark as Resolved"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Converted to Quote Banner */}
        {consultation.converted_quote_id && (
          <div className="rounded-xl border border-purple-800 bg-purple-950/40 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold text-purple-300">Quotation Ready for this Engagement</h4>
              <p className="text-xs text-purple-200/80 mt-1">
                Our engineering team has prepared an official formal quotation based on this consultation.
              </p>
            </div>
            <Link
              href={`/account/quotes/${consultation.converted_quote_id}`}
              className="inline-flex items-center text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg transition shrink-0"
            >
              View & Approve Quotation &rarr;
            </Link>
          </div>
        )}

        {/* Overview Card */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 sm:p-8 space-y-4">
          <div className="flex items-start justify-between">
            <h1 className="text-2xl font-bold text-white">{consultation.topic}</h1>
            <span className="text-xs font-mono text-neutral-500 shrink-0">
              {new Date(consultation.created_at).toLocaleString()}
            </span>
          </div>

          <div className="pt-2">
            <h3 className="text-xs font-mono uppercase text-neutral-400 mb-2">Technical Description</h3>
            <p className="text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed bg-neutral-950/80 p-4 rounded-lg border border-neutral-800/80">
              {consultation.description}
            </p>
          </div>
        </div>

        {/* Engineering Response */}
        {consultation.admin_response && (
          <div className="rounded-xl border border-emerald-800/80 bg-emerald-950/20 p-6 sm:p-8 space-y-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-base font-bold text-white">Senior Engineering Response</h3>
            </div>
            <div className="text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed bg-neutral-950/80 p-5 rounded-lg border border-emerald-900/50">
              {consultation.admin_response}
            </div>
          </div>
        )}

        {/* Discussion / Clarifications Thread */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Clarification Q&A</h3>
            <span className="text-xs font-mono text-neutral-500">
              {consultation.clarifications?.length || 0} discussion items
            </span>
          </div>

          {(!consultation.clarifications || consultation.clarifications.length === 0) ? (
            <p className="text-xs text-neutral-500 italic">No clarifying questions have been raised.</p>
          ) : (
            <div className="space-y-4">
              {consultation.clarifications.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <span className="text-xs font-mono text-emerald-400">Engineering Staff Query:</span>
                      <p className="text-sm text-white font-medium">{item.question}</p>
                    </div>
                    <span className="text-[10px] font-mono text-neutral-500">
                      {new Date(item.raised_at).toLocaleDateString()}
                    </span>
                  </div>

                  {item.response_text ? (
                    <div className="mt-3 pl-4 border-l-2 border-emerald-500 space-y-1">
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
                            placeholder="Provide your technical answer or clarification..."
                            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none"
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
                              disabled={isResponding || !clarResponseText.trim()}
                              onClick={() => handleSendClarificationResponse(item.id)}
                              className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-neutral-950 px-3 py-1 rounded transition disabled:opacity-50"
                            >
                              {isResponding ? "Submitting..." : "Send Response"}
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
                          className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition"
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
    </div>
  );
}
