"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { adminQuotesApi } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

interface QuoteVersion {
  id: string;
  version_number: number;
  status: string;
  scope_summary?: string;
  line_items?: Array<{
    description: string;
    quantity: number;
    unit_price: string;
    total: string;
  }>;
  subtotal: string;
  tax_amount: string;
  shipping_amount: string;
  total: string;
  valid_until?: string;
  estimated_timeline?: string;
  terms?: string;
}

interface QuoteItem {
  id: string;
  request_type: string;
  request_id: string;
  project_id?: string;
  status: string;
  customer?: {
    id: string;
    email: string;
    full_name?: string;
  };
  current_version?: QuoteVersion;
  created_at: string;
  updated_at: string;
}

export default function AdminQuotesPage() {
  const { hasRole, isAuthenticated } = useAdminAuth();
  const isAllowed = hasRole(["SUPER_ADMIN", "MANUFACTURING_MANAGER", "FINANCE_MANAGER"]);

  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  // Modal inspection / action state
  const [selectedQuote, setSelectedQuote] = useState<QuoteItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadQuotes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminQuotesApi.listQuotes({
        status: statusFilter || undefined,
        request_type: typeFilter || undefined,
        search: search || undefined,
        page_size: 50,
      });
      if (res?.data) {
        setQuotes(res.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load quotations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && isAllowed) {
      loadQuotes();
    }
  }, [isAuthenticated, isAllowed, statusFilter, typeFilter]);

  const handleSendQuote = async (quoteId: string) => {
    setActionLoading(true);
    setFeedback(null);
    try {
      await adminQuotesApi.sendQuote(quoteId);
      setFeedback({ type: "success", message: "Quotation officially issued and sent to customer!" });
      await loadQuotes();
      if (selectedQuote?.id === quoteId) {
        setSelectedQuote(null);
      }
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Failed to send quote" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelQuote = async (quoteId: string) => {
    setActionLoading(true);
    setFeedback(null);
    try {
      await adminQuotesApi.cancelQuote(quoteId);
      setFeedback({ type: "success", message: "Quotation cancelled successfully." });
      await loadQuotes();
      if (selectedQuote?.id === quoteId) {
        setSelectedQuote(null);
      }
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Failed to cancel quote" });
    } finally {
      setActionLoading(false);
    }
  };

  if (!isAllowed) {
    return (
      <div className="p-8 text-center text-red-400">
        Access Restricted: Quote management requires SUPER_ADMIN, MANUFACTURING_MANAGER, or FINANCE_MANAGER role.
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    switch (s) {
      case "draft":
        return <span className="rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">Draft</span>;
      case "sent":
        return <span className="rounded-full bg-blue-950/80 border border-blue-800 px-2 py-0.5 text-[10px] font-semibold text-blue-400">Sent to Customer</span>;
      case "viewed":
        return <span className="rounded-full bg-purple-950/80 border border-purple-800 px-2 py-0.5 text-[10px] font-semibold text-purple-400">Viewed</span>;
      case "approved":
      case "accepted":
        return <span className="rounded-full bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">Accepted</span>;
      case "rejected":
        return <span className="rounded-full bg-rose-950/80 border border-rose-800 px-2 py-0.5 text-[10px] font-semibold text-rose-400">Rejected</span>;
      case "expired":
        return <span className="rounded-full bg-amber-950/80 border border-amber-800 px-2 py-0.5 text-[10px] font-semibold text-amber-400">Expired</span>;
      case "cancelled":
        return <span className="rounded-full bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">Cancelled</span>;
      default:
        return <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">{status}</span>;
    }
  };

  const getRequestLink = (quote: QuoteItem) => {
    const type = quote.request_type?.toLowerCase();
    if (type === "manufacturing") return `/admin/manufacturing/${quote.request_id}`;
    if (type === "design") return `/admin/design/${quote.request_id}`;
    if (type === "software") return `/admin/software/${quote.request_id}`;
    if (type === "consultation") return `/admin/consultations/${quote.request_id}`;
    return "#";
  };

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase text-emerald-400">
            <span>Engineering Operations</span>
            <span>&bull;</span>
            <span>Quotation Control</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
            Quotations & Estimates
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Authoritative quotation pricing, customer approvals, immutable versioning, and lead times.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadQuotes}
            className="rounded-lg bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-700 transition"
          >
            Refresh List
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border p-4 text-xs font-medium flex items-center justify-between ${
            feedback.type === "success"
              ? "border-emerald-800 bg-emerald-950/60 text-emerald-300"
              : "border-red-800 bg-red-950/60 text-red-300"
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-zinc-400 hover:text-white ml-4">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft (Unsent)</option>
            <option value="sent">Sent (Awaiting Response)</option>
            <option value="approved">Approved / Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
          >
            <option value="">All Service Types</option>
            <option value="manufacturing">Manufacturing</option>
            <option value="design">PCB Design</option>
            <option value="software">Firmware / Software</option>
            <option value="consultation">Consultation</option>
          </select>
        </div>

        <div className="text-xs text-zinc-500 font-mono">
          Total Quotes: <strong className="text-zinc-300">{quotes.length}</strong>
        </div>
      </div>

      {/* Quotations Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-xs font-mono text-zinc-400 animate-pulse">
            Loading quotation records...
          </div>
        ) : quotes.length === 0 ? (
          <div className="p-16 text-center text-zinc-500 text-xs">
            No quotations found matching selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] font-mono uppercase text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Quote ID / Version</th>
                  <th className="px-4 py-3">Service & Request</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total Amount</th>
                  <th className="px-4 py-3">Valid Until</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {quotes.map((q) => {
                  const v = q.current_version;
                  const reqLink = getRequestLink(q);

                  return (
                    <tr key={q.id} className="hover:bg-zinc-850/50 transition">
                      <td className="px-4 py-3.5 font-mono text-white font-medium">
                        <div>
                          <span>#{q.id.slice(0, 8)}</span>
                          <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 font-normal">
                            v{v?.version_number || 1}
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {new Date(q.created_at).toLocaleDateString()}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="capitalize font-semibold text-zinc-200">
                          {q.request_type}
                        </span>
                        {q.request_id && (
                          <div className="text-[11px] mt-0.5">
                            <Link
                              href={reqLink}
                              className="font-mono text-emerald-400 hover:underline"
                            >
                              Req: {q.request_id.slice(0, 8)} →
                            </Link>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-zinc-300">
                        {q.customer ? (
                          <div>
                            <div className="font-medium text-white">{q.customer.full_name || "Customer"}</div>
                            <div className="text-[11px] text-zinc-400 font-mono">{q.customer.email}</div>
                          </div>
                        ) : (
                          <span className="text-zinc-500">Unspecified</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        {getStatusBadge(q.status)}
                      </td>

                      <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-400">
                        ₹{v?.total || "0.00"}
                      </td>

                      <td className="px-4 py-3.5 text-zinc-400 text-[11px]">
                        {v?.valid_until ? new Date(v.valid_until).toLocaleDateString() : "No Expiry Set"}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => setSelectedQuote(q)}
                          className="rounded-lg bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 transition"
                        >
                          Inspect Quote
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quote Inspection Drawer / Modal */}
      {selectedQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <div className="text-xs font-mono uppercase text-emerald-400">Quotation Specification</div>
                <h3 className="text-lg font-bold text-white mt-0.5">
                  Quote #{selectedQuote.id.slice(0, 8)} (v{selectedQuote.current_version?.version_number || 1})
                </h3>
              </div>
              <button
                onClick={() => setSelectedQuote(null)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 text-sm"
              >
                ✕
              </button>
            </div>

            {/* Overview Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800/80 text-xs">
              <div>
                <span className="text-zinc-500 block">Service</span>
                <span className="font-semibold text-white capitalize">{selectedQuote.request_type}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Status</span>
                <div className="mt-0.5">{getStatusBadge(selectedQuote.status)}</div>
              </div>
              <div>
                <span className="text-zinc-500 block">Timeline</span>
                <span className="font-semibold text-white">
                  {selectedQuote.current_version?.estimated_timeline || "Standard"}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block">Valid Until</span>
                <span className="font-semibold text-white">
                  {selectedQuote.current_version?.valid_until
                    ? new Date(selectedQuote.current_version.valid_until).toLocaleDateString()
                    : "Open"}
                </span>
              </div>
            </div>

            {/* Scope Summary */}
            {selectedQuote.current_version?.scope_summary && (
              <div>
                <span className="text-xs font-semibold text-zinc-400 block mb-1">Scope of Work</span>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-xs text-zinc-300 whitespace-pre-wrap">
                  {selectedQuote.current_version.scope_summary}
                </div>
              </div>
            )}

            {/* Line Items */}
            <div>
              <span className="text-xs font-semibold text-zinc-400 block mb-2">Itemized Breakdown</span>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-800 bg-zinc-900/60 text-[10px] font-mono uppercase text-zinc-400">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2 text-center">Qty</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {(selectedQuote.current_version?.line_items || []).map((it, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 text-zinc-200">{it.description}</td>
                        <td className="px-3 py-2 text-center text-zinc-400 font-mono">{it.quantity}</td>
                        <td className="px-3 py-2 text-right text-zinc-400 font-mono">₹{it.unit_price}</td>
                        <td className="px-3 py-2 text-right text-zinc-200 font-mono font-medium">₹{it.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financial Totals */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3.5 space-y-1.5 text-xs ml-auto max-w-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal:</span>
                <span className="font-mono text-zinc-200">₹{selectedQuote.current_version?.subtotal}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Tax / GST:</span>
                <span className="font-mono text-zinc-200">₹{selectedQuote.current_version?.tax_amount}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Shipping:</span>
                <span className="font-mono text-zinc-200">₹{selectedQuote.current_version?.shipping_amount}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-zinc-800">
                <span>Total Quotation:</span>
                <span className="text-emerald-400 font-mono">₹{selectedQuote.current_version?.total}</span>
              </div>
            </div>

            {/* Operational Actions */}
            <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
              <Link
                href={getRequestLink(selectedQuote)}
                className="text-xs text-emerald-400 hover:underline font-medium"
              >
                Go to Associated Request Page →
              </Link>

              <div className="flex items-center gap-3">
                {selectedQuote.status === "draft" && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleSendQuote(selectedQuote.id)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition disabled:opacity-50"
                  >
                    {actionLoading ? "Sending..." : "Send Quote to Customer"}
                  </button>
                )}

                {["draft", "sent"].includes(selectedQuote.status) && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleCancelQuote(selectedQuote.id)}
                    className="rounded-lg border border-red-900/60 bg-red-950/40 px-3.5 py-2 text-xs font-semibold text-red-400 hover:bg-red-900/40 transition disabled:opacity-50"
                  >
                    Cancel Quote
                  </button>
                )}

                <button
                  onClick={() => setSelectedQuote(null)}
                  className="rounded-lg border border-zinc-800 bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
