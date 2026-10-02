"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { adminPaymentsApi } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

interface PaymentItem {
  id: string;
  order_id?: string | null;
  quote_id?: string | null;
  checkout_session_id?: string | null;
  source_type: string;
  customer_email: string;
  customer_name: string;
  gateway_order_id: string;
  gateway_payment_id?: string | null;
  amount_paise: number;
  amount_rupees: string;
  status: string;
  refund_amount_paise: number;
  created_at: string;
}

export default function AdminPaymentsPage() {
  const { hasRole, isAuthenticated } = useAdminAuth();
  const isAllowed = hasRole(["SUPER_ADMIN", "FINANCE_MANAGER"]);

  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Refund Modal State
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundPaymentId, setRefundPaymentId] = useState("");
  const [refundAmountRupees, setRefundAmountRupees] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("admin_access_token") || undefined : undefined;
      const res = await adminPaymentsApi.listPayments(
        {
          status: statusFilter !== "all" ? statusFilter : undefined,
          source_type: sourceFilter !== "all" ? sourceFilter : undefined,
          search: search.trim() || undefined,
        },
        token
      );
      if (res?.data) {
        setPayments(res.data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadPayments();
    }
  }, [isAuthenticated, statusFilter, sourceFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadPayments();
  };

  const handleOpenRefund = (payment: PaymentItem) => {
    setRefundPaymentId(payment.id);
    setRefundAmountRupees(payment.amount_rupees);
    setRefundReason("");
    setRefundError(null);
    setShowRefundModal(true);
  };

  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundReason.trim()) {
      setRefundError("A refund reason is mandatory.");
      return;
    }

    setIsRefunding(true);
    setRefundError(null);

    try {
      const payload: { amount?: number; reason: string } = {
        reason: refundReason.trim(),
      };
      if (refundAmountRupees.trim()) {
        payload.amount = Math.round(parseFloat(refundAmountRupees) * 100);
      }

      await adminPaymentsApi.refundPayment(refundPaymentId.trim(), payload);
      setShowRefundModal(false);
      setBanner({ type: "success", message: `Refund processed successfully for ${refundPaymentId}` });
      await loadPayments();
    } catch (err: unknown) {
      setRefundError(err instanceof Error ? err.message : "Failed to process refund");
    } finally {
      setIsRefunding(false);
    }
  };

  if (!isAllowed) {
    return (
      <div className="p-8 text-center text-red-400">
        Access Restricted: Payments administration requires FINANCE_MANAGER or SUPER_ADMIN role.
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase text-purple-400">
            <span>Finance & Accounts</span>
            <span>&bull;</span>
            <span>Razorpay Gateway</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
            Payments & Refund Management
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Audit payment receipts, inspect Razorpay transaction captures, and issue verified customer refunds.
          </p>
        </div>
      </div>

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

      {/* Transactions Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden space-y-4 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white">Payment Transactions Ledger</h3>
            <p className="text-xs text-zinc-400 mt-0.5">Immutable record of gateway payment intents, settlements, and customer refunds.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <form onSubmit={handleSearchSubmit} className="flex items-center">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Gateway Ref or Email..."
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
              />
            </form>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 focus:outline-none"
            >
              <option value="all">All Sources</option>
              <option value="checkout_session">Commerce Order</option>
              <option value="quote">Service Quotation</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="captured">Captured / Success</option>
              <option value="pending">Pending</option>
              <option value="refunded">Refunded</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-zinc-500">Loading payments ledger...</div>
        ) : payments.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500 border border-zinc-800/80 rounded-xl bg-zinc-950/40">
            No payment transactions recorded matching criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-900/80 text-zinc-500 uppercase text-[11px] font-mono border-b border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3">Gateway Payment ID</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Type / Reference</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-800/40">
                    <td className="py-3 px-3">
                      <div className="font-mono text-purple-400 font-medium">{p.gateway_payment_id || p.gateway_order_id}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">UUID: {p.id.slice(0, 8)}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-white font-medium">{p.customer_name}</div>
                      <div className="text-[11px] text-zinc-400">{p.customer_email}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {p.source_type === "quote" ? "Quotation" : "Commerce"}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-mono font-bold text-white">₹{p.amount_rupees}</div>
                      {p.refund_amount_paise > 0 && (
                        <div className="text-[10px] font-mono text-amber-400">
                          Refunded: ₹{(p.refund_amount_paise / 100).toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border ${
                          p.status === "captured" || p.status === "successful"
                            ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                            : p.status === "refunded"
                            ? "bg-purple-950 text-purple-400 border-purple-800"
                            : p.status === "failed"
                            ? "bg-red-950 text-red-400 border-red-800"
                            : "bg-amber-950 text-amber-400 border-amber-800"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-zinc-400">
                      {p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {(p.status === "captured" || p.status === "successful") && (
                        <button
                          onClick={() => handleOpenRefund(p)}
                          className="px-2.5 py-1 rounded bg-purple-950/60 hover:bg-purple-900/60 text-purple-300 border border-purple-800 text-[11px] font-medium transition cursor-pointer"
                        >
                          Issue Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-white">Process Customer Refund</h3>
            <p className="text-xs text-zinc-400">
              Issuing a refund will transmit a refund request to Razorpay and mark the payment record as refunded.
            </p>

            {refundError && (
              <div className="p-3 rounded-lg bg-red-950/40 border border-red-900/60 text-xs text-red-300">
                {refundError}
              </div>
            )}

            <form onSubmit={handleRefundSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Payment ID</label>
                <input
                  type="text"
                  disabled
                  value={refundPaymentId}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Refund Amount in INR</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-zinc-500">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={refundAmountRupees}
                    onChange={(e) => setRefundAmountRupees(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 pl-7 pr-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Reason / Justification *</label>
                <textarea
                  required
                  rows={2}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g. Customer cancelled prototype order prior to manufacturing"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRefundModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-xs text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRefunding}
                  className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {isRefunding ? "Processing..." : "Confirm & Issue Refund"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
