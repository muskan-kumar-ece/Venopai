"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminQuotesApi } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

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
  tax: { type: string; amount: string };
  total: string;
  estimated_timeline?: string;
  valid_until?: string;
  terms?: string;
  created_at?: string;
}

interface QuoteDetail {
  id: string;
  quote_number?: string;
  status: string;
  request_type: string;
  request_id: string;
  user_id: string;
  customer?: { email: string; full_name?: string };
  current_version: QuoteVersion;
  created_at: string;
}

export default function AdminQuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const quoteId = resolvedParams.id;
  const router = useRouter();

  const { hasRole, isAuthenticated } = useAdminAuth();
  const isAllowed = hasRole(["SUPER_ADMIN", "MANUFACTURING_MANAGER", "FINANCE_MANAGER"]);

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [versions, setVersions] = useState<QuoteVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<QuoteVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Revise Modal
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [reviseScope, setReviseScope] = useState("");
  const [reviseTimeline, setReviseTimeline] = useState("10 business days");
  const [reviseValidDays, setReviseValidDays] = useState(14);
  const [reviseLineItems, setReviseLineItems] = useState<LineItem[]>([
    { name: "Engineering deliverable", description: "Standard execution", amount: "5000" },
  ]);
  const [revising, setRevising] = useState(false);

  // Cancel Modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Action loading states
  const [sending, setSending] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [qRes, vRes] = await Promise.allSettled([
        adminQuotesApi.getQuote(quoteId),
        adminQuotesApi.listQuoteVersions(quoteId),
      ]);

      if (qRes.status === "fulfilled" && qRes.value?.data) {
        setQuote(qRes.value.data);
        if (vRes.status === "fulfilled" && Array.isArray(vRes.value?.data)) {
          setVersions(vRes.value.data);
          setSelectedVersion(vRes.value.data[0] || qRes.value.data.current_version);
        } else {
          setVersions([qRes.value.data.current_version]);
          setSelectedVersion(qRes.value.data.current_version);
        }
      } else {
        setError("Quotation could not be retrieved from records.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load quotation details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, quoteId]);

  const handleSendQuote = async () => {
    setSending(true);
    setBanner(null);
    try {
      await adminQuotesApi.sendQuote(quoteId);
      setBanner({ type: "success", message: "Quotation officially dispatched to customer." });
      await loadData();
    } catch (err: unknown) {
      setBanner({ type: "error", message: err instanceof Error ? err.message : "Failed to send quotation" });
    } finally {
      setSending(false);
    }
  };

  const handleCancelQuote = async () => {
    setCancelling(true);
    setBanner(null);
    try {
      await adminQuotesApi.cancelQuote(quoteId);
      setShowCancelModal(false);
      setBanner({ type: "success", message: "Quotation has been cancelled." });
      await loadData();
    } catch (err: unknown) {
      setBanner({ type: "error", message: err instanceof Error ? err.message : "Failed to cancel quotation" });
    } finally {
      setCancelling(false);
    }
  };

  const handleReviseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRevising(true);
    setBanner(null);
    try {
      await adminQuotesApi.reviseQuote(quoteId, {
        scope_summary: reviseScope,
        estimated_timeline: reviseTimeline,
        valid_until: new Date(Date.now() + reviseValidDays * 86400000).toISOString(),
        line_items: reviseLineItems.map((item) => ({
          description: item.description || item.name || "Engineering execution revision",
          amount: item.amount,
        })),
      });
      setShowReviseModal(false);
      setBanner({ type: "success", message: "New quotation revision version created." });
      await loadData();
    } catch (err: unknown) {
      setBanner({ type: "error", message: err instanceof Error ? err.message : "Failed to create quote revision" });
    } finally {
      setRevising(false);
    }
  };

  if (!isAllowed) {
    return (
      <div className="p-8 text-center text-red-400">
        Access Restricted: Quotation management requires MANUFACTURING_MANAGER, FINANCE_MANAGER, or SUPER_ADMIN role.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-zinc-400 text-xs">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        Loading quotation dossier and version history...
      </div>
    );
  }

  if (error || !quote || !selectedVersion) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Link href="/admin/quotes" className="text-xs text-purple-400 hover:text-purple-300">
          &larr; Back to Quotations Queue
        </Link>
        <div className="p-4 rounded-xl border border-red-900/60 bg-red-950/40 text-xs text-red-300">
          {error || "Quotation not found"}
        </div>
      </div>
    );
  }

  const isCurrent = selectedVersion.version_number === quote.current_version.version_number;

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6">
      {/* Top Breadcrumb & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase text-zinc-400">
            <Link href="/admin/quotes" className="hover:text-white transition">
              Quotations
            </Link>
            <span>/</span>
            <span className="text-purple-400">#{quote.id.slice(0, 8)}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            Quotation Specification
            <span className="text-xs font-mono uppercase px-2.5 py-1 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
              {quote.status}
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Request Type: <strong className="capitalize text-zinc-200">{quote.request_type?.replace("_", " ")}</strong> &bull; Customer: <span className="font-mono text-zinc-300">{quote.customer?.email || quote.user_id}</span>
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {quote.status === "draft" && (
            <button
              onClick={handleSendQuote}
              disabled={sending}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              {sending ? "Sending..." : "✓ Send to Customer"}
            </button>
          )}

          {quote.status !== "cancelled" && quote.status !== "paid" && (
            <button
              onClick={() => {
                setReviseScope(selectedVersion.scope_summary || "");
                setReviseTimeline(selectedVersion.estimated_timeline || "10 business days");
                setReviseLineItems(selectedVersion.line_items?.length ? selectedVersion.line_items : [{ name: "Engineering task", amount: "1000" }]);
                setShowReviseModal(true);
              }}
              className="px-4 py-2 border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition cursor-pointer"
            >
              + Create Revision
            </button>
          )}

          {quote.status !== "cancelled" && quote.status !== "paid" && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="px-3 py-2 border border-red-900/50 bg-red-950/30 hover:bg-red-900/50 text-red-400 rounded-lg text-xs font-medium transition cursor-pointer"
            >
              Cancel Quote
            </button>
          )}
        </div>
      </div>

      {/* Banner */}
      {banner && (
        <div
          className={`p-4 rounded-xl text-xs border ${
            banner.type === "success"
              ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-300"
              : "border-red-900/60 bg-red-950/40 text-red-300"
          }`}
        >
          {banner.message}
        </div>
      )}

      {/* Version Selector Tabs */}
      {versions.length > 1 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5 flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] font-mono text-zinc-500 uppercase px-2">Versions:</span>
          {versions.map((v) => {
            const isSelected = v.version_number === selectedVersion.version_number;
            const isLatest = v.version_number === quote.current_version.version_number;
            return (
              <button
                key={v.id}
                onClick={() => setSelectedVersion(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? "bg-purple-600 text-white font-semibold shadow-sm"
                    : "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-750"
                }`}
              >
                <span>v{v.version_number}</span>
                {isLatest && <span className="text-[10px] uppercase font-bold text-purple-200">(Latest)</span>}
              </button>
            );
          })}
        </div>
      )}

      {!isCurrent && (
        <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-3 text-xs text-amber-300 flex items-center justify-between">
          <span>Viewing historical quotation archive (v{selectedVersion.version_number}). Actions apply to the active version.</span>
          <button
            onClick={() => setSelectedVersion(quote.current_version)}
            className="text-xs font-bold underline ml-3 cursor-pointer"
          >
            Switch to Latest (v{quote.current_version.version_number})
          </button>
        </div>
      )}

      {/* Scope of Work */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-white">Deliverable Scope & Commitments</h3>
        <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
          {selectedVersion.scope_summary || "Standard project milestones."}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-zinc-800 text-xs">
          <div>
            <span className="text-zinc-500 uppercase text-[10px] font-mono block">Timeline</span>
            <span className="text-zinc-200 font-semibold">{selectedVersion.estimated_timeline || "TBD"}</span>
          </div>
          <div>
            <span className="text-zinc-500 uppercase text-[10px] font-mono block">Validity</span>
            <span className="text-zinc-200 font-semibold">
              {selectedVersion.valid_until ? new Date(selectedVersion.valid_until).toLocaleDateString() : "Open"}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 uppercase text-[10px] font-mono block">Tax Model</span>
            <span className="text-zinc-200 font-semibold">{selectedVersion.tax?.type || "GST 18%"}</span>
          </div>
          <div>
            <span className="text-zinc-500 uppercase text-[10px] font-mono block">Created</span>
            <span className="text-zinc-200 font-semibold">
              {selectedVersion.created_at ? new Date(selectedVersion.created_at).toLocaleDateString() : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <div className="p-5 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Itemized Deliverables & Financial Pricing</h3>
        </div>
        <table className="w-full text-left text-xs text-zinc-300">
          <thead className="bg-zinc-900 text-zinc-500 uppercase text-[11px] font-mono border-b border-zinc-800">
            <tr>
              <th className="py-2.5 px-4">Component / Milestone</th>
              <th className="py-2.5 px-4 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {selectedVersion.line_items?.map((item, idx) => (
              <tr key={idx} className="hover:bg-zinc-800/40">
                <td className="py-3 px-4">
                  <div className="font-semibold text-white">{item.name}</div>
                  {item.description && <div className="text-zinc-500 text-[11px] mt-0.5">{item.description}</div>}
                </td>
                <td className="py-3 px-4 text-right font-mono font-medium text-emerald-400">
                  ₹{item.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pricing Summary */}
        <div className="p-5 border-t border-zinc-800 bg-zinc-900/20 max-w-xs ml-auto space-y-2 text-xs text-zinc-400">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span className="font-mono text-zinc-200">₹{selectedVersion.subtotal}</span>
          </div>
          <div className="flex justify-between">
            <span>Logistics:</span>
            <span className="font-mono text-zinc-200">₹{selectedVersion.shipping_amount}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax ({selectedVersion.tax?.type}):</span>
            <span className="font-mono text-zinc-200">₹{selectedVersion.tax?.amount}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-zinc-800 text-sm font-bold text-white">
            <span>Grand Total:</span>
            <span className="font-mono text-purple-400 font-bold">₹{selectedVersion.total}</span>
          </div>
        </div>
      </div>

      {/* Revise Modal */}
      {showReviseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 max-w-lg w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-white">Issue Revised Quotation Version</h3>
            <p className="text-xs text-zinc-400">
              Creating a revision archives current version {quote.current_version.version_number} and produces a new draft version.
            </p>

            <form onSubmit={handleReviseSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Scope of Work</label>
                <textarea
                  required
                  rows={3}
                  value={reviseScope}
                  onChange={(e) => setReviseScope(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Estimated Timeline</label>
                  <input
                    type="text"
                    required
                    value={reviseTimeline}
                    onChange={(e) => setReviseTimeline(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Validity (Days)</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={reviseValidDays}
                    onChange={(e) => setReviseValidDays(parseInt(e.target.value, 10) || 14)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Line Item Amount (₹)</label>
                <input
                  type="number"
                  required
                  value={reviseLineItems[0]?.amount || "5000"}
                  onChange={(e) => setReviseLineItems([{ name: "Engineering execution revision", amount: e.target.value }])}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReviseModal(false)}
                  className="px-4 py-2 border border-zinc-700 bg-zinc-800 text-zinc-300 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={revising}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {revising ? "Generating..." : "Create Revision"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-white">Confirm Quotation Cancellation</h3>
            <p className="text-xs text-zinc-400">
              Are you sure you want to cancel this quotation? The customer will no longer be able to accept or pay for it.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-xs text-zinc-300"
              >
                No, Keep
              </button>
              <button
                onClick={handleCancelQuote}
                disabled={cancelling}
                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white disabled:opacity-50"
              >
                {cancelling ? "Cancelling..." : "Yes, Cancel Quote"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
