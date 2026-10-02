'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ordersApi } from '@/lib/api/client';
import { StatusBadge } from '@/components/account/StatusBadge';
import { LoadingState } from '@/components/account/LoadingState';
import { EmptyState } from '@/components/account/EmptyState';

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  total_price: string;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  payment_status?: string;
  shipment_status?: string;
  total_amount: string;
  items: OrderItem[];
  created_at: string;
}

export default function AccountOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      const res = await ordersApi.listOrders({ status: statusFilter || undefined }, token);
      if (res?.data) {
        setOrders(res.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [statusFilter]);

  if (loading) {
    return <LoadingState message="Loading your orders..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Your Orders</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Track hardware part purchases, view status, invoices, and shipment tracking.
          </p>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase">Filter:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-zinc-300 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Statuses</option>
            <option value="created">Created</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 rounded-lg text-sm">{error}</div>
      )}

      {orders.length === 0 ? (
        <EmptyState
          title="No orders found"
          message="You haven't placed any hardware component or board orders yet."
          actionLabel="Browse Catalog"
          actionHref="/"
          icon="📦"
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800 gap-2">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-zinc-900 dark:text-white text-base">{order.order_number}</span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {order.created_at ? new Date(order.created_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {order.items?.length || 0} {order.items?.length === 1 ? 'item' : 'items'}
                  </div>
                </div>

                {/* 3-way status separation indicator */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-zinc-400 font-medium">Order:</span>
                    <StatusBadge status={order.status} />
                  </div>
                  {order.payment_status && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-zinc-400 font-medium">Payment:</span>
                      <StatusBadge status={order.payment_status} />
                    </div>
                  )}
                  {order.shipment_status && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-zinc-400 font-medium">Shipment:</span>
                      <StatusBadge status={order.shipment_status} />
                    </div>
                  )}
                </div>
              </div>

              {/* Items summary */}
              <div className="py-3 text-sm text-zinc-700 dark:text-zinc-300">
                {order.items?.slice(0, 3).map((item, idx) => (
                  <div key={idx} className="flex justify-between py-1 text-xs">
                    <span className="text-zinc-600 dark:text-zinc-400 truncate max-w-md">
                      {item.quantity}x {item.product_name}
                    </span>
                    <span className="font-medium text-zinc-900 dark:text-white">₹{item.total_price}</span>
                  </div>
                ))}
                {order.items && order.items.length > 3 && (
                  <div className="text-xs text-zinc-400 dark:text-zinc-500 italic pt-1">
                    +{order.items.length - 3} more items...
                  </div>
                )}
              </div>

              {/* Actions footer */}
              <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <div className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Total: ₹{order.total_amount}
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/account/orders/${order.id}`}
                    className="px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition"
                  >
                    View Details & Tracking →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
