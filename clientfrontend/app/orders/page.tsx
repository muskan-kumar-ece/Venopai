"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api/client";

interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price: string;
  tax_amount: string;
  total_price: string;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  subtotal: string;
  shipping_fee: string;
  tax_amount: string;
  total_amount: string;
  shipping_address_snapshot: any;
  items: OrderItem[];
  created_at: string;
  paid_at: string | null;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const getAuthHeaders = (): Record<string, string> => {
    try {
      const token = localStorage.getItem("access_token");
      if (token) return { Authorization: `Bearer ${token}` };
    } catch {
      // ignore
    }
    return {};
  };

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeaders();
      const res = await apiClient.get("/orders", { headers });
      setOrders(res?.data || []);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load your orders");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    const reason = prompt("Please provide a reason for cancelling this order:");
    if (!reason || !reason.trim()) return;

    setCancellingId(orderId);
    try {
      const headers = getAuthHeaders();
      await apiClient.post(
        `/orders/${orderId}/cancel`,
        { reason: reason.trim() },
        { headers }
      );
      alert("Order cancelled successfully.");
      await loadOrders();
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(`Failed to cancel order: ${err.message}`);
      } else {
        alert("Failed to cancel order.");
      }
    } finally {
      setCancellingId(null);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "paid":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300";
      case "processing":
        return "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300";
      case "shipped":
        return "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300";
      case "delivered":
        return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300";
      default:
        return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300";
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            My Orders
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Track and manage your verified hardware & engineering orders.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Browse Catalog
        </Link>
      </div>

      {loading ? (
        <div className="mt-8 space-y-4">
          <div className="h-36 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-36 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      ) : error ? (
        <div className="mt-8 rounded-xl bg-red-50 p-6 text-center text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-semibold">Unable to load orders</p>
          <p className="mt-1 text-xs">{error}</p>
          <button
            onClick={loadOrders}
            className="mt-4 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-500"
          >
            Try Again
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-900 dark:text-white">
            No orders placed yet
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            Once you complete a purchase, your orders will appear here.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {orders.map((order) => {
            const canCancel = ["paid", "processing"].includes(order.status.toLowerCase());
            return (
              <div
                key={order.id}
                className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                {/* Header banner */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 bg-zinc-50/60 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                  <div className="flex flex-wrap items-center gap-6">
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                        Order Placed
                      </span>
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {new Date(order.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                        Total Amount
                      </span>
                      <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                        ₹{order.total_amount}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                        Order #
                      </span>
                      <span className="font-mono text-xs font-bold text-zinc-900 dark:text-white">
                        {order.order_number}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${getStatusBadge(
                        order.status
                      )}`}
                    >
                      {order.status}
                    </span>

                    {canCancel && (
                      <button
                        disabled={cancellingId === order.id}
                        onClick={() => handleCancelOrder(order.id)}
                        className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        {cancellingId === order.id ? "Cancelling..." : "Cancel"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Items & details */}
                <div className="p-6">
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {order.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                        <div>
                          <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                            {it.product_name}
                          </p>
                          <p className="text-xs text-zinc-500">
                            Qty: {it.quantity} × ₹{it.unit_price}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                          ₹{it.total_price}
                        </span>
                      </div>
                    ))}
                  </div>

                  {order.shipping_address_snapshot && (
                    <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        Delivering to:{" "}
                      </span>
                      {order.shipping_address_snapshot.recipient_name},{" "}
                      {order.shipping_address_snapshot.line1},{" "}
                      {order.shipping_address_snapshot.city},{" "}
                      {order.shipping_address_snapshot.state} —{" "}
                      {order.shipping_address_snapshot.pincode}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
