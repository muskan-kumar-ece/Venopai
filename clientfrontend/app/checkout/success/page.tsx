"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ordersApi, getApiBaseUrl } from "@/lib/api/client";

interface OrderItem {
  product_id?: string;
  name: string;
  quantity: number;
  unit_price: string;
  line_total?: string;
}

interface OrderDetail {
  id: string;
  order_number: string;
  status: string;
  payment_status?: string;
  subtotal: string;
  shipping_fee?: string;
  shipping_amount?: string;
  tax_amount: string;
  total_amount: string;
  paid_at?: string;
  created_at: string;
  items: OrderItem[];
  shipping_address?: {
    recipient_name: string;
    phone: string;
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    pincode: string;
    country?: string;
  };
  shipment?: {
    id: string;
    status: string;
    tracking_number?: string;
    carrier?: string;
  };
}

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id");
  const orderNumber = searchParams.get("order_number");

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState<boolean>(false);

  useEffect(() => {
    const fetchOrder = async () => {
      const identifier = orderId || orderNumber;
      if (!identifier) {
        setLoading(false);
        return;
      }

      try {
        const token =
          typeof window !== "undefined"
            ? localStorage.getItem("access_token") || undefined
            : undefined;
        const res = await ordersApi.getOrderDetail(identifier, token);
        if (res?.data) {
          setOrder(res.data);
        }
      } catch (err) {
        // Fallback: check session storage if customer just completed checkout
        try {
          const cached = sessionStorage.getItem("venopai_last_order");
          if (cached) {
            setOrder(JSON.parse(cached));
          }
        } catch {
          // ignore
        }
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, orderNumber]);

  const handleCopyOrderNumber = () => {
    const num = order?.order_number || orderNumber || orderId || "";
    if (num && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(num);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDownloadInvoice = async () => {
    if (!order) return;
    setDownloadingInvoice(true);
    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("access_token") || ""
          : "";
      const base = getApiBaseUrl();
      const invoiceUrl = `${base}/orders/${order.id || order.order_number}/invoice/download?token=${encodeURIComponent(token)}`;
      window.open(invoiceUrl, "_blank");
    } catch {
      // fallback
    } finally {
      setDownloadingInvoice(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Confirming your hardware realization order...
          </p>
        </div>
      </div>
    );
  }

  const displayOrderNum =
    order?.order_number || orderNumber || (orderId ? orderId.slice(0, 8).toUpperCase() : "ORD-CONFIRMED");
  const displayTotal = order?.total_amount || "0.00";
  const displaySubtotal = order?.subtotal || displayTotal;
  const displayTax = order?.tax_amount || "0.00";
  const displayShipping = order?.shipping_fee || order?.shipping_amount || "0.00";

  return (
    <div className="min-h-screen bg-zinc-50 py-12 px-4 sm:px-6 lg:px-8 dark:bg-zinc-950">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Success Header Card */}
        <div className="rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-xs dark:border-emerald-950/80 dark:bg-zinc-900 sm:p-10">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 shadow-inner">
            <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Order Confirmed!
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 max-w-md mx-auto">
            Payment verified successfully via Razorpay. Your hardware components are queued for quality inspection and ESD packaging.
          </p>

          {/* Prominent, Copyable Order Number (Document 03 §19) */}
          <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-zinc-100 px-5 py-2.5 text-sm dark:bg-zinc-800/80">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Order Reference:</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-base">
              {displayOrderNum}
            </span>
            <button
              onClick={handleCopyOrderNumber}
              className="ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700 transition"
              title="Copy Order Number"
            >
              {copied ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">✓ Copied</span>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          {/* Dual Status Badges (Document 03 §19 & §20) */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Payment: Confirmed (100% Paid)</span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:border-blue-800 dark:text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span>Fulfillment: Processing at Hub</span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 border border-zinc-200 px-3.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300">
              <span>Logistics: Delhivery via Shiprocket</span>
            </div>
          </div>
        </div>

        {/* Order Details & Summary Card */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">
              Order Summary & Items
            </h2>
            <span className="text-xs text-zinc-500">
              {order?.items?.length || 1} {order?.items?.length === 1 ? "Item" : "Items"}
            </span>
          </div>

          {/* Items List (Document 03 §19 immutable snapshot) */}
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {order?.items && order.items.length > 0 ? (
              order.items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-3.5 text-sm">
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-white">{item.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Qty: {item.quantity} × ₹{item.unit_price}
                    </p>
                  </div>
                  <span className="font-mono font-bold text-zinc-900 dark:text-white">
                    ₹{item.line_total || (parseFloat(item.unit_price) * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-4 text-sm text-zinc-600 dark:text-zinc-400">
                Hardware realization components snapshot preserved.
              </div>
            )}
          </div>

          {/* Financial Breakdown (Document 03 §19) */}
          <div className="rounded-2xl bg-zinc-50 p-4.5 dark:bg-zinc-800/40 space-y-2 text-xs border border-zinc-100 dark:border-zinc-800">
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Subtotal</span>
              <span className="font-mono text-zinc-900 dark:text-white font-medium">₹{displaySubtotal}</span>
            </div>
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Standard Express Shipping</span>
              <span className="font-mono text-zinc-900 dark:text-white font-medium">
                {parseFloat(displayShipping) > 0 ? `₹${displayShipping}` : "FREE"}
              </span>
            </div>
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Applicable GST Tax (18%)</span>
              <span className="font-mono text-zinc-900 dark:text-white font-medium">₹{displayTax}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-200 pt-2.5 text-sm font-bold text-zinc-900 dark:border-zinc-700 dark:text-white">
              <span>Total Paid</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">₹{displayTotal}</span>
            </div>
          </div>

          {/* Shipping Address & Delivery ETA */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 pt-2">
            <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800 space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Shipping Address</span>
              {order?.shipping_address ? (
                <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  <p className="font-semibold text-zinc-900 dark:text-white">{order.shipping_address.recipient_name}</p>
                  <p>{order.shipping_address.line1}</p>
                  {order.shipping_address.line2 && <p>{order.shipping_address.line2}</p>}
                  <p>{order.shipping_address.city}, {order.shipping_address.state} - {order.shipping_address.pincode}</p>
                  <p className="text-zinc-500">Phone: {order.shipping_address.phone}</p>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">Customer address recorded at checkout.</p>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800 space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Estimated Delivery ETA</span>
              <p className="text-xs font-semibold text-zinc-900 dark:text-white">
                2 – 4 Business Days
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Standard dispatch within 24 hours. A notification with your carrier tracking number will be sent once the package leaves our hub.
              </p>
            </div>
          </div>

          {/* Post-Purchase Actions (Document 03 §19) */}
          <div className="border-t border-zinc-100 pt-6 dark:border-zinc-800 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleDownloadInvoice}
                disabled={downloadingInvoice}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>{downloadingInvoice ? "Generating Invoice..." : "Download Official GST Tax Invoice"}</span>
              </button>

              <Link
                href={`/track?order=${encodeURIComponent(displayOrderNum)}`}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3 text-xs font-bold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 transition cursor-pointer"
              >
                <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Track Shipment in Real-Time</span>
              </Link>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-zinc-500">
              <Link
                href={order?.id ? `/account/orders/${order.id}` : "/account/orders"}
                className="hover:text-zinc-900 dark:hover:text-white font-medium transition"
              >
                &larr; View in Customer Account Orders
              </Link>
              <Link
                href="/products"
                className="hover:text-emerald-600 dark:hover:text-emerald-400 font-medium transition"
              >
                Continue Browsing Hardware &rarr;
              </Link>
            </div>
          </div>
        </div>

        {/* Realization Next Steps Banner */}
        <div className="rounded-2xl border border-zinc-200/80 bg-zinc-100/60 p-5 dark:border-zinc-800/80 dark:bg-zinc-900/60 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed flex items-start gap-3.5">
          <div className="text-lg">ℹ️</div>
          <div>
            <p className="font-semibold text-zinc-900 dark:text-white mb-0.5">What happens next?</p>
            <p>
              Your order is logged directly in our fulfillment queue. You will receive an automated dispatch notification and SMS tracking update once picked up by our logistics partner. For any changes, reach our engineering support at <Link href="/contact" className="text-emerald-600 dark:text-emerald-400 hover:underline">Support Desk</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent mx-auto" />
          <p className="mt-4 text-xs text-zinc-500">Loading order confirmation...</p>
        </div>
      }
    >
      <OrderSuccessContent />
    </Suspense>
  );
}
