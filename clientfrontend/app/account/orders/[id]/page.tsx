'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ordersApi } from '@/lib/api/client';
import { StatusBadge } from '@/components/account/StatusBadge';
import { LoadingState } from '@/components/account/LoadingState';

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

interface OrderDetail {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  shipment_status: string;
  subtotal: string;
  shipping_fee: string;
  tax_amount: string;
  total_amount: string;
  shipping_address_snapshot: {
    recipient_name?: string;
    phone?: string;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  items: OrderItem[];
  tracking_number?: string | null;
  carrier?: string | null;
  can_cancel: boolean;
  created_at: string;
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cancellation state
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Invoice state
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  const loadOrderDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      const res = await ordersApi.getOrderDetail(orderId, token);
      if (res?.data) {
        setOrder(res.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderId) {
      loadOrderDetail();
    }
  }, [orderId]);

  const handleCancelOrder = async () => {
    setCancelling(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      await ordersApi.cancelOrder(orderId, cancelReason, token);
      setShowCancelModal(false);
      loadOrderDetail();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to cancel order');
    } finally {
      setCancelling(false);
    }
  };

  const handleDownloadInvoice = async () => {
    setDownloadingInvoice(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      const res = await ordersApi.getInvoice(orderId, token);
      if (res?.data?.invoice_url) {
        const rawUrl = res.data.invoice_url;
        const fullUrl = rawUrl.startsWith('http')
          ? rawUrl
          : `${process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/api\/v1\/?$/, '') || 'http://127.0.0.1:8000'}${rawUrl}`;
        window.open(fullUrl, '_blank');
      } else {
        setError(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve invoice');
    } finally {
      setDownloadingInvoice(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading order details..." />;
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <Link href="/account/orders" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
          &larr; Back to Orders
        </Link>
        <div className="p-6 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded-2xl text-xs font-medium">
          {error || 'Order not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <Link href="/account/orders" className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition">
          Orders
        </Link>
        <span>/</span>
        <span className="font-semibold text-zinc-900 dark:text-white font-mono">{order.order_number}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Order #{order.order_number}
          </h1>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Placed on {order.created_at ? new Date(order.created_at).toLocaleString() : ''}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadInvoice}
            disabled={downloadingInvoice}
            className="px-3.5 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition cursor-pointer"
          >
            {downloadingInvoice ? 'Fetching...' : '📄 Download Invoice'}
          </button>
          {order.can_cancel && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="px-3.5 py-2 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/50 hover:bg-red-100 dark:hover:bg-red-950/70 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Cancel Order
            </button>
          )}
        </div>
      </div>

      {/* THREE-WAY STATUS SEPARATION SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            1. Order Lifecycle
          </span>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-bold text-zinc-900 dark:text-white capitalize">{order.status}</span>
            <StatusBadge status={order.status} />
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            2. Payment Lifecycle
          </span>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-bold text-zinc-900 dark:text-white capitalize">
              {order.payment_status || 'Paid'}
            </span>
            <StatusBadge status={order.payment_status || 'paid'} />
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            3. Shipment Lifecycle
          </span>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-bold text-zinc-900 dark:text-white capitalize">
              {order.shipment_status || 'Pending'}
            </span>
            <StatusBadge status={order.shipment_status || 'pending'} />
          </div>
          {order.tracking_number && (
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
              AWB:{' '}
              <span className="font-mono text-zinc-900 dark:text-white">{order.tracking_number}</span> (
              {order.carrier || 'Standard'})
            </div>
          )}
        </div>
      </div>

      {/* Items Section */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Purchased Items</h2>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {order.items?.map((item) => (
            <div key={item.id} className="py-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm text-zinc-900 dark:text-white">{item.product_name}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  SKU: {item.sku || 'N/A'} • Qty: {item.quantity} • Unit: ₹{item.unit_price}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono font-bold text-sm text-zinc-900 dark:text-white">₹{item.total_price}</span>
                {order.status === 'delivered' && (
                  <Link
                    href={`/account/reviews?target_type=order_item&target_id=${item.id}&product_id=${item.product_id}`}
                    className="px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 transition"
                  >
                    ★ Review
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Pricing breakdown */}
        <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800 max-w-xs ml-auto space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span className="font-mono font-medium text-zinc-900 dark:text-white">₹{order.subtotal}</span>
          </div>
          <div className="flex justify-between">
            <span>Shipping:</span>
            <span className="font-mono font-medium text-zinc-900 dark:text-white">₹{order.shipping_fee}</span>
          </div>
          <div className="flex justify-between">
            <span>GST / Taxes:</span>
            <span className="font-mono font-medium text-zinc-900 dark:text-white">₹{order.tax_amount}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-zinc-200 dark:border-zinc-700 text-sm font-bold text-zinc-900 dark:text-white">
            <span>Total:</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400">₹{order.total_amount}</span>
          </div>
        </div>
      </div>

      {/* Shipping Address */}
      {order.shipping_address_snapshot && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Shipping Destination</h2>
          <div className="text-xs text-zinc-700 dark:text-zinc-300 space-y-1">
            <div className="font-semibold text-sm text-zinc-900 dark:text-white">
              {order.shipping_address_snapshot.recipient_name}
            </div>
            <div>{order.shipping_address_snapshot.line1}</div>
            {order.shipping_address_snapshot.line2 && <div>{order.shipping_address_snapshot.line2}</div>}
            <div>
              {order.shipping_address_snapshot.city}, {order.shipping_address_snapshot.state} -{' '}
              {order.shipping_address_snapshot.pincode}
            </div>
            <div className="text-zinc-500 dark:text-zinc-400 mt-1">Phone: {order.shipping_address_snapshot.phone}</div>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Cancel Order</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              Pre-fulfillment cancellation will immediately halt processing and initiate automatic refund.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Reason for cancellation
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
                placeholder="Reason (e.g. ordered wrong part quantity)..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                Keep Order
              </button>
              <button
                onClick={handleCancelOrder}
                disabled={cancelling}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
