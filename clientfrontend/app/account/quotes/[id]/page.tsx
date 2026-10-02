"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { quotesApi, apiClient } from "@/lib/api/client";
import { StatusBadge } from "@/components/account/StatusBadge";
import { LoadingState } from "@/components/account/LoadingState";

interface LineItem {
  name?: string;
  description?: string;
  amount: string;
}

interface QuoteVersion {
  id: string;
  version_number: number;
  status: string;
  scope_summary?: string;
  line_items: LineItem[];
  subtotal: string;
  shipping_amount: string;
  tax: {
    type: string;
    amount: string;
  };
  total: string;
  estimated_timeline?: string;
  valid_until?: string;
  terms?: string;
  created_at?: string;
}

interface QuoteDetail {
  id: string;
  status: string;
  request_type: string;
  request_id: string;
  current_version: QuoteVersion;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const quoteId = resolvedParams.id;

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [versions, setVersions] = useState<QuoteVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<QuoteVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Modals & Action loading
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approving, setApproving] = useState(false);

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const [paying, setPaying] = useState(false);

  const loadQuoteAndVersions = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") || undefined : undefined;
      const res = await quotesApi.getQuote(quoteId, token);
      if (res?.data) {
        setQuote(res.data);
        setSelectedVersion(res.data.current_version);
      }

      try {
        const vRes = await apiClient.get(`/quotes/${quoteId}/versions`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (vRes?.data && Array.isArray(vRes.data)) {
          setVersions(vRes.data);
          const current = vRes.data.find(
            (v: QuoteVersion) => v.version_number === res?.data?.current_version?.version_number
          );
          if (current) setSelectedVersion(current);
        } else if (res?.data?.current_version) {
          setVersions([res.data.current_version]);
        }
      } catch {
        if (res?.data?.current_version) {
          setVersions([res.data.current_version]);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load quote details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quoteId) {
      loadQuoteAndVersions();
    }
  }, [quoteId]);

  const handleApprove = async () => {
    setApproving(true);
    setBanner(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") || undefined : undefined;
      await quotesApi.approveQuote(quoteId, token);
      setShowApproveModal(false);
      setBanner({ type: "success", message: "Quotation approved successfully! You can now proceed to payment." });
      await loadQuoteAndVersions();
    } catch (err: unknown) {
      setBanner({ type: "error", message: err instanceof Error ? err.message : "Failed to approve quote" });
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setRejecting(true);
    setBanner(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") || undefined : undefined;
      await quotesApi.rejectQuote(quoteId, rejectReason.trim(), token);
      setShowRejectModal(false);
      setBanner({ type: "success", message: "Revision request submitted. The engineering manager has been notified." });
      await loadQuoteAndVersions();
    } catch (err: unknown) {
      setBanner({ type: "error", message: err instanceof Error ? err.message : "Failed to reject quote" });
    } finally {
      setRejecting(false);
    }
  };

  const handlePayWithRazorpay = async () => {
    if (!quote) return;
    setPaying(true);
    setBanner(null);

    const getAuthHeaders = (): Record<string, string> => {
      try {
        const token = localStorage.getItem("access_token");
        if (token) return { Authorization: `Bearer ${token}` };
      } catch {}
      return {};
    };

    try {
      const headers = getAuthHeaders();
      const initRes = await apiClient.post(
        "/payments/initiate",
        { source_type: "quote", source_id: quote.id },
        { headers }
      );

      const paymentData = initRes?.data;
      if (!paymentData) throw new Error("Failed to initialize payment gateway.");

      const { payment_id, gateway_order_id, amount_paise, key_id, customer } = paymentData;
      const scriptLoaded = await loadRazorpayScript();
      const isMockGateway = !key_id || key_id.includes("mock");

      const confirmCall = async (rzpPayId: string, rzpOrdId: string, sig: string) => {
        await apiClient.post(
          `/payments/${payment_id}/confirm`,
          {
            razorpay_payment_id: rzpPayId,
            razorpay_order_id: rzpOrdId,
            razorpay_signature: sig,
          },
          { headers }
        );
        setBanner({ type: "success", message: "Payment verified successfully! Engagement activated." });
        await loadQuoteAndVersions();
      };

      if (!scriptLoaded || isMockGateway) {
        await confirmCall(`pay_sim_${Date.now()}`, gateway_order_id, "mock_valid_signature");
        return;
      }

      const options = {
        key: key_id,
        amount: amount_paise,
        currency: "INR",
        name: "VenopAI Engineering",
        description: `Quotation Payment #${quote.id.slice(0, 8)}`,
        order_id: gateway_order_id,
        prefill: {
          name: customer?.name || "",
          email: customer?.email || "",
          contact: customer?.phone || "",
        },
        theme: { color: "#059669" },
        handler: async function (response: any) {
          await confirmCall(response.razorpay_payment_id, response.razorpay_order_id, response.razorpay_signature);
        },
        modal: {
          ondismiss: function () {
            setPaying(false);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err: unknown) {
      setBanner({ type: "error", message: err instanceof Error ? err.message : "Payment failed" });
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading quote and version history..." />;
  }

  if (error || !quote || !selectedVersion) {
    return (
      <div className="space-y-4">
        <Link href="/account/quotes" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
          &larr; Back to Quotes
        </Link>
        <div className="p-6 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded-2xl text-xs font-medium">
          {error || "Quote not found."}
        </div>
      </div>
    );
  }

  const isCurrent = selectedVersion.version_number === quote.current_version.version_number;
  const isExpired = selectedVersion.valid_until && new Date(selectedVersion.valid_until) < new Date();
  const canAct = isCurrent && !isExpired && (quote.status === "sent" || quote.status === "pending_approval");
  const canPay = quote.status === "approved" || quote.status === "payment_pending";

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <Link href="/account/quotes" className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition">
          Quotes
        </Link>
        <span>/</span>
        <span className="font-semibold text-zinc-900 dark:text-white font-mono">Quote #{quote.id.slice(0, 8)}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Quotation Specification</h1>
            <StatusBadge status={quote.status} />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Request Type:{" "}
            <span className="font-semibold capitalize text-zinc-800 dark:text-zinc-200">
              {quote.request_type?.replace("_", " ")}
            </span>
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/account/quotes/${quoteId}/print`}
            target="_blank"
            className="px-3.5 py-2 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Formal Quotation (Print/PDF)</span>
          </Link>

          {canAct && (
            <>
              <button
                onClick={() => setShowRejectModal(true)}
                className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Request Revision
              </button>
              <button
                onClick={() => setShowApproveModal(true)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                ✓ Approve Quote
              </button>
            </>
          )}

          {canPay && (
            <button
              onClick={handlePayWithRazorpay}
              disabled={paying}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-2"
            >
              {paying ? "Opening Gateway..." : `💳 Pay ₹${selectedVersion.total} with Razorpay`}
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div
          className={`p-4 rounded-2xl text-xs border font-medium ${
            banner.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
              : "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300"
          }`}
        >
          {banner.message}
        </div>
      )}

      {/* Version History Selector Tabs */}
      {versions.length > 1 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 shadow-sm flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider pl-2 pr-1">
            Versions:
          </span>
          {versions.map((v) => {
            const isSelected = v.version_number === selectedVersion.version_number;
            const isLatest = v.version_number === quote.current_version.version_number;
            return (
              <button
                key={v.id}
                onClick={() => setSelectedVersion(v)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                }`}
              >
                <span>v{v.version_number}</span>
                {isLatest && <span className="text-[10px] uppercase font-bold opacity-80">(Latest)</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Inactive version banner */}
      {!isCurrent && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between">
          <div>
            <strong>Historical Version (v{selectedVersion.version_number}):</strong> This version has been superseded by a newer quotation.
          </div>
          <button
            onClick={() => setSelectedVersion(quote.current_version)}
            className="text-xs font-bold underline ml-4 whitespace-nowrap cursor-pointer"
          >
            Switch to Latest (v{quote.current_version.version_number})
          </button>
        </div>
      )}

      {isCurrent && isExpired && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-2xl text-red-800 dark:text-red-300 text-xs">
          <strong>Quotation Expired:</strong> The validity period for this quote has elapsed. Please request a revised quote to proceed.
        </div>
      )}

      {/* Scope Summary */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white">Scope of Work</h2>
        <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
          {selectedVersion.scope_summary || "Standard engineering deliverable scope."}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 text-xs">
          <div>
            <span className="text-zinc-400 dark:text-zinc-500 block uppercase font-medium text-[10px]">Estimated Timeline</span>
            <span className="text-zinc-900 dark:text-white font-semibold">{selectedVersion.estimated_timeline || "TBD"}</span>
          </div>
          <div>
            <span className="text-zinc-400 dark:text-zinc-500 block uppercase font-medium text-[10px]">Valid Until</span>
            <span className="text-zinc-900 dark:text-white font-semibold">
              {selectedVersion.valid_until ? new Date(selectedVersion.valid_until).toLocaleDateString() : "N/A"}
            </span>
          </div>
          <div>
            <span className="text-zinc-400 dark:text-zinc-500 block uppercase font-medium text-[10px]">Taxation Model</span>
            <span className="text-zinc-900 dark:text-white font-semibold">{selectedVersion.tax?.type || "GST 18%"}</span>
          </div>
          <div>
            <span className="text-zinc-400 dark:text-zinc-500 block uppercase font-medium text-[10px]">Version Created</span>
            <span className="text-zinc-900 dark:text-white font-semibold">
              {selectedVersion.created_at ? new Date(selectedVersion.created_at).toLocaleDateString() : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Itemized Pricing Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white mb-4">Itemized Deliverables & Pricing</h2>
        <table className="w-full text-left text-xs text-zinc-700 dark:text-zinc-300">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-[11px] uppercase font-semibold text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-700">
            <tr>
              <th className="py-2.5 px-4">Deliverable / Component</th>
              <th className="py-2.5 px-4 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {selectedVersion.line_items?.map((item, idx) => (
              <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                <td className="py-3 px-4">
                  <div className="font-semibold text-zinc-900 dark:text-white">{item.name}</div>
                  {item.description && <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{item.description}</div>}
                </td>
                <td className="py-3 px-4 text-right font-mono font-medium text-zinc-900 dark:text-white">
                  ₹{item.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pricing Summary Breakdown */}
        <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800 max-w-xs ml-auto space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span className="font-mono font-medium text-zinc-900 dark:text-white">₹{selectedVersion.subtotal}</span>
          </div>
          <div className="flex justify-between">
            <span>Estimated Shipping:</span>
            <span className="font-mono font-medium text-zinc-900 dark:text-white">₹{selectedVersion.shipping_amount}</span>
          </div>
          <div className="flex justify-between">
            <span>GST / Tax ({selectedVersion.tax?.type}):</span>
            <span className="font-mono font-medium text-zinc-900 dark:text-white">₹{selectedVersion.tax?.amount}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-zinc-200 dark:border-zinc-700 text-sm font-bold text-zinc-900 dark:text-white">
            <span>Total Quotation:</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400">₹{selectedVersion.total}</span>
          </div>
        </div>
      </div>

      {/* Terms & Conditions */}
      {selectedVersion.terms && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white mb-2">Terms & Deliverable Milestones</h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">{selectedVersion.terms}</p>
        </div>
      )}

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Confirm Quotation Approval</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              You are approving quotation <strong className="text-zinc-900 dark:text-white">#{quote.id.slice(0, 8)}</strong> for total amount <strong className="text-emerald-600 dark:text-emerald-400 font-mono">₹{selectedVersion.total}</strong>. This confirms engineering deliverables and unlocks payment processing.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowApproveModal(false)}
                className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={approving}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
              >
                {approving ? "Approving..." : "Confirm Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Request Quote Revision</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Please state why this quote needs revision so the engineering manager can provide an updated estimate.
            </p>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Feedback / Requested Changes *</label>
              <textarea
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="e.g. Budget target is ₹40,000, please optimize component selection..."
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={rejecting || !rejectReason.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
              >
                {rejecting ? "Submitting..." : "Submit Revision Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
