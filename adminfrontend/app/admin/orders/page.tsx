"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { adminOrdersApi } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

interface OrderSummary {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total_amount: string;
  items_count?: number;
  created_at: string;
  shipping_address?: {
    full_name: string;
    city: string;
    state: string;
    pincode: string;
  };
}

export default function AdminOrdersPage() {
  const { hasRole, isAuthenticated } = useAdminAuth();
  const isAllowed = hasRole(["SUPER_ADMIN", "ORDER_MANAGER", "FINANCE_MANAGER"]);

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminOrdersApi.listOrders({
        status: statusFilter || undefined,
        page_size: 50,
      });
      if (res?.data) {
        setOrders(res.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadOrders();
    }
  }, [isAuthenticated, statusFilter]);

  if (!isAllowed) {
    return (
      <div className="p-8 text-center text-red-400">
        Access Restricted: Order fulfillment requires ORDER_MANAGER, FINANCE_MANAGER, or SUPER_ADMIN role.
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      pending: { label: "Pending", color: "bg-amber-950/80 text-amber-400 border-amber-800" },
      paid: { label: "Paid", color: "bg-emerald-950/80 text-emerald-400 border-emerald-800" },
      processing: { label: "Processing", color: "bg-blue-950/80 text-blue-400 border-blue-800" },
      shipped: { label: "Shipped", color: "bg-cyan-950/80 text-cyan-400 border-cyan-800" },
      delivered: { label: "Delivered", color: "bg-emerald-950/80 text-emerald-300 border-emerald-800" },
      cancelled: { label: "Cancelled", color: "bg-red-950/80 text-red-400 border-red-800" },
    };
    const s = map[status] || { label: status, color: "bg-zinc-800 text-zinc-300 border-zinc-700" };
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${s.color}`}>
        {s.label}
      </span>
    );
  };

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase text-blue-400">
            <span>Fulfillment</span>
            <span>&bull;</span>
            <span>Customer Orders</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
            Order Fulfillment Queue
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Track customer orders, verify payment confirmation, and coordinate warehouse dispatch.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="paid">Paid (Ready for Packing)</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <button
            onClick={loadOrders}
            className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-700 transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Orders Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-xs font-mono text-zinc-400 animate-pulse">
            Loading customer orders...
          </div>
        ) : orders.length === 0 ? (
          <div className="p-16 text-center text-zinc-500 text-xs">
            No orders found matching criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] font-mono uppercase text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Order Number</th>
                  <th className="px-4 py-3">Customer / City</th>
                  <th className="px-4 py-3">Fulfillment Status</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3 text-right">Total Amount</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {orders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-zinc-850/50 transition">
                    <td className="px-4 py-3.5 font-mono font-semibold">
                      <Link
                        href={`/admin/orders/${ord.id}`}
                        className="text-white hover:text-blue-400 hover:underline"
                      >
                        {ord.order_number || ord.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-zinc-300">
                      {ord.shipping_address ? (
                        <div>
                          <div className="font-medium text-white">{ord.shipping_address.full_name}</div>
                          <div className="text-[11px] text-zinc-400">{ord.shipping_address.city}, {ord.shipping_address.state}</div>
                        </div>
                      ) : (
                        "Direct Customer"
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {getStatusBadge(ord.status)}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-zinc-300">
                      {ord.payment_status || "confirmed"}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-400">
                      ₹{parseFloat(ord.total_amount || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-500 text-[11px]">
                      {new Date(ord.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={`/admin/orders/${ord.id}`}
                        className="rounded-lg bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 transition"
                      >
                        Inspect & Fulfill →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
