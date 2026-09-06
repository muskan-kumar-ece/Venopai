'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  const router = useRouter();
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
      alert(err instanceof Error ? err.message : 'Failed to cancel order');
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
        window.open(res.data.invoice_url, '_blank');
      } else {
        alert('Invoice generated successfully.');
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to retrieve invoice');
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
        <Link href="/account/orders" className="text-sm font-medium text-blue-600 hover:text-blue-800">
          ← Back to Orders
        </Link>
        <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-xl">
          {error || 'Order not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/account/orders" className="hover:text-gray-900">
          Orders
        </Link>
        <span>/</span>
        <span className="font-semibold text-gray-900">{order.order_number}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order #{order.order_number}</h1>
          <div className="text-xs text-gray-500 mt-1">
            Placed on {order.created_at ? new Date(order.created_at).toLocaleString() : ''}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadInvoice}
            disabled={downloadingInvoice}
            className="px-3.5 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
          >
            {downloadingInvoice ? 'Fetching...' : '📄 Download Invoice'}
          </button>
          {order.can_cancel && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="px-3.5 py-2 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded-lg text-xs font-semibold transition"
            >
              Cancel Order
            </button>
          )}
        </div>
      </div>

      {/* THREE-WAY STATUS SEPARATION SECTION (MANDATORY REQUIREMENT) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">1. Order Lifecycle</span>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900 capitalize">{order.status}</span>
            <StatusBadge status={order.status} />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">2. Payment Lifecycle</span>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900 capitalize">{order.payment_status || 'Paid'}</span>
            <StatusBadge status={order.payment_status || 'paid'} />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">3. Shipment Lifecycle</span>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900 capitalize">{order.shipment_status || 'Pending'}</span>
            <StatusBadge status={order.shipment_status || 'pending'} />
          </div>
          {order.tracking_number && (
            <div className="text-xs text-gray-500 mt-2">
              AWB: <span className="font-mono text-gray-900">{order.tracking_number}</span> ({order.carrier || 'Standard'})
            </div>
          )}
        </div>
      </div>

      {/* Items Section */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Purchased Items</h2>
        <div className="divide-y divide-gray-100">
          {order.items?.map((item) => (
            <div key={item.id} className="py-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm text-gray-900">{item.product_name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  SKU: {item.sku || 'N/A'} • Qty: {item.quantity} • Unit: ₹{item.unit_price}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-bold text-sm text-gray-900">₹{item.total_price}</span>
                {order.status === 'delivered' && (
                  <Link
                    href={`/account/reviews?product_id=${item.product_id}`}
                    className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100"
                  >
                    ★ Review
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Pricing breakdown */}
        <div className="mt-6 pt-4 border-t border-gray-100 max-w-xs ml-auto space-y-1.5 text-xs text-gray-600">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span className="font-medium text-gray-900">₹{order.subtotal}</span>
          </div>
          <div className="flex justify-between">
            <span>Shipping:</span>
            <span className="font-medium text-gray-900">₹{order.shipping_fee}</span>
          </div>
          <div className="flex justify-between">
            <span>GST / Taxes:</span>
            <span className="font-medium text-gray-900">₹{order.tax_amount}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-gray-200 text-sm font-bold text-gray-900">
            <span>Total:</span>
            <span>₹{order.total_amount}</span>
          </div>
        </div>
      </div>

      {/* Shipping Address */}
      {order.shipping_address_snapshot && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Shipping Destination</h2>
          <div className="text-sm text-gray-700 space-y-0.5">
            <div className="font-semibold text-gray-900">{order.shipping_address_snapshot.recipient_name}</div>
            <div>{order.shipping_address_snapshot.line1}</div>
            {order.shipping_address_snapshot.line2 && <div>{order.shipping_address_snapshot.line2}</div>}
            <div>
              {order.shipping_address_snapshot.city}, {order.shipping_address_snapshot.state} -{' '}
              {order.shipping_address_snapshot.pincode}
            </div>
            <div className="text-xs text-gray-500 mt-1">Phone: {order.shipping_address_snapshot.phone}</div>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Cancel Order</h3>
            <p className="text-sm text-gray-500 mb-4">
              Pre-fulfillment cancellation will immediately halt processing and initiate automatic refund.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-1">Reason for cancellation</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
                placeholder="Reason (e.g. ordered wrong part quantity)..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Keep Order
              </button>
              <button
                onClick={handleCancelOrder}
                disabled={cancelling}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
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
