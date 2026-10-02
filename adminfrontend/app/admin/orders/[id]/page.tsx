"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { adminOrdersApi, adminShippingApi } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

interface OrderItem {
  id: string;
  product_id: string;
  title: string;
  sku: string | null;
  quantity: number;
  unit_price_paise: number;
  total_price_paise: number;
}

interface OrderDetail {
  id: string;
  order_number: string;
  user_id: string;
  status: string;
  payment_status: string;
  total_amount_paise: number;
  subtotal_paise: number;
  tax_paise: number;
  shipping_amount_paise: number;
  shipping_address?: {
    recipient_name?: string;
    phone?: string;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  items: OrderItem[];
  shipment?: {
    id: string;
    tracking_number?: string | null;
    carrier?: string | null;
    status: string;
    estimated_delivery?: string | null;
  } | null;
  created_at?: string;
  updated_at?: string;
}

export default function AdminOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;

  const { hasRole, isAuthenticated } = useAdminAuth();
  const isAllowed = hasRole(["SUPER_ADMIN", "ORDER_MANAGER", "FINANCE_MANAGER"]);

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Status update state
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [statusNotes, setStatusNotes] = useState<string>("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Internal note state
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [internalNote, setInternalNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Shipment dispatch state
  const [showShipModal, setShowShipModal] = useState(false);
  const [carrier, setCarrier] = useState("Delhivery");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [weightGrams, setWeightGrams] = useState(500);
  const [dispatchingShipment, setDispatchingShipment] = useState(false);

  // Feedback banner
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadOrder = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminOrdersApi.getOrder(orderId);
      if (res?.data) {
        setOrder(res.data);
        setSelectedStatus(res.data.status);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load order details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && isAllowed && orderId) {
      loadOrder();
    }
  }, [isAuthenticated, isAllowed, orderId]);

  const handleUpdateStatus = async () => {
    if (!selectedStatus) return;
    setUpdatingStatus(true);
    setFeedback(null);
    try {
      await adminOrdersApi.updateStatus(orderId, selectedStatus, statusNotes || undefined);
      setFeedback({ type: "success", message: `Order status updated to "${selectedStatus}".` });
      setStatusNotes("");
      await loadOrder();
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Failed to update order status" });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!internalNote.trim()) return;
    setSavingNote(true);
    try {
      await adminOrdersApi.addNote(orderId, internalNote.trim());
      setFeedback({ type: "success", message: "Internal administrative note recorded." });
      setInternalNote("");
      setShowNoteModal(false);
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Failed to save note" });
    } finally {
      setSavingNote(false);
    }
  };

  const handleCreateShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setDispatchingShipment(true);
    try {
      await adminShippingApi.createOrderShipment(orderId, {
        carrier: carrier.trim(),
        tracking_number: trackingNumber.trim() || undefined,
        weight_grams: Number(weightGrams) || 500,
      });
      setFeedback({ type: "success", message: "Shipment registered and tracking assigned successfully!" });
      setShowShipModal(false);
      await loadOrder();
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Failed to dispatch shipment" });
    } finally {
      setDispatchingShipment(false);
    }
  };

  if (!isAllowed) {
    return (
      <div className="p-8 text-center text-red-400">
        Access Restricted: Order detail inspection requires ORDER_MANAGER, FINANCE_MANAGER, or SUPER_ADMIN role.
      </div>
    );
  }

  const formatRupees = (paise?: number) => {
    return ((paise || 0) / 100).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    const map: Record<string, { label: string; color: string }> = {
      pending: { label: "Pending", color: "bg-amber-950/80 text-amber-400 border-amber-800" },
      paid: { label: "Paid", color: "bg-emerald-950/80 text-emerald-400 border-emerald-800" },
      processing: { label: "Processing", color: "bg-blue-950/80 text-blue-400 border-blue-800" },
      shipped: { label: "Shipped", color: "bg-cyan-950/80 text-cyan-400 border-cyan-800" },
      delivered: { label: "Delivered", color: "bg-emerald-950/80 text-emerald-300 border-emerald-800" },
      cancelled: { label: "Cancelled", color: "bg-red-950/80 text-red-400 border-red-800" },
    };
    const c = map[s] || { label: status, color: "bg-zinc-800 text-zinc-300 border-zinc-700" };
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${c.color}`}>
        {c.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-xs font-mono text-zinc-400 animate-pulse">
        Loading order details...
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <Link href="/admin/orders" className="text-xs text-blue-400 hover:underline">
          ← Back to Orders Queue
        </Link>
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-6 text-xs text-red-300">
          {error || "Order not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
        <Link href="/admin/orders" className="hover:text-white">
          Orders
        </Link>
        <span>/</span>
        <span className="text-white font-semibold">#{order.order_number}</span>
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

      {/* Main Order Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
              Order #{order.order_number}
            </h1>
            {getStatusBadge(order.status)}
          </div>
          <div className="text-xs text-zinc-400 mt-1 space-x-3">
            <span>Customer ID: <strong className="font-mono text-zinc-300">{order.user_id.slice(0, 8)}</strong></span>
            <span>&bull;</span>
            <span>Placed: {order.created_at ? new Date(order.created_at).toLocaleString() : "N/A"}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNoteModal(true)}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 transition"
          >
            + Internal Note
          </button>
          {!order.shipment && ["paid", "processing"].includes(order.status.toLowerCase()) && (
            <button
              onClick={() => setShowShipModal(true)}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500 transition"
            >
              Dispatch Shipment 🚚
            </button>
          )}
        </div>
      </div>

      {/* Status Transition Control Card */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
          Operational Lifecycle Controls
        </h3>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] text-zinc-400 mb-1">Update Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid (Fulfillment Queue)</option>
              <option value="processing">Processing (Packing / Picking)</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="flex-1 min-w-[280px]">
            <label className="block text-[11px] text-zinc-400 mb-1">Status Notes (Optional)</label>
            <input
              type="text"
              value={statusNotes}
              onChange={(e) => setStatusNotes(e.target.value)}
              placeholder="e.g. Packing completed, transferred to courier hub"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="self-end">
            <button
              disabled={updatingStatus || selectedStatus === order.status}
              onClick={handleUpdateStatus}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition disabled:opacity-50"
            >
              {updatingStatus ? "Saving..." : "Apply Status Transition"}
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Shipping & Shipment Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Shipping Address */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
          <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            Delivery Destination
          </h3>
          {order.shipping_address ? (
            <div className="text-xs text-zinc-300 space-y-1">
              <div className="font-semibold text-white text-sm">
                {order.shipping_address.recipient_name}
              </div>
              <div>{order.shipping_address.line1}</div>
              {order.shipping_address.line2 && <div>{order.shipping_address.line2}</div>}
              <div>
                {order.shipping_address.city}, {order.shipping_address.state} —{" "}
                <span className="font-mono font-bold text-white">{order.shipping_address.pincode}</span>
              </div>
              {order.shipping_address.phone && (
                <div className="pt-2 text-zinc-400">
                  Contact Phone: <strong className="text-zinc-200">{order.shipping_address.phone}</strong>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-zinc-500">No snapshot address recorded.</div>
          )}
        </div>

        {/* Shipment Details */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
          <h3 className="text-xs font-mono uppercase tracking-wider text-cyan-400">
            Logistics & Carrier Details
          </h3>
          {order.shipment ? (
            <div className="text-xs text-zinc-300 space-y-2">
              <div className="flex items-center justify-between">
                <span>Carrier Partner:</span>
                <strong className="text-white">{order.shipment.carrier || "Delhivery"}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>AWB / Tracking Number:</span>
                <strong className="font-mono text-cyan-400">{order.shipment.tracking_number || "Unassigned"}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Shipment Status:</span>
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-mono text-zinc-300 uppercase">
                  {order.shipment.status}
                </span>
              </div>
              {order.shipment.estimated_delivery && (
                <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
                  <span>Est. Delivery:</span>
                  <span className="text-zinc-400">{new Date(order.shipment.estimated_delivery).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-zinc-500 py-3">
              Shipment has not been dispatched yet. Click &quot;Dispatch Shipment&quot; above to assign carrier tracking.
            </div>
          )}
        </div>
      </div>

      {/* Ordered BOM Items Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden space-y-2">
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/70 flex items-center justify-between">
          <h3 className="text-xs font-mono uppercase tracking-wider text-white">
            Ordered Hardware Items & Components
          </h3>
          <span className="text-xs text-zinc-400 font-mono">
            {order.items?.length || 0} Line Items
          </span>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="border-b border-zinc-800 text-[10px] font-mono uppercase text-zinc-400">
            <tr>
              <th className="px-4 py-2.5">Component / Product</th>
              <th className="px-4 py-2.5">SKU</th>
              <th className="px-4 py-2.5 text-center">Qty</th>
              <th className="px-4 py-2.5 text-right">Unit Price</th>
              <th className="px-4 py-2.5 text-right">Total Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {order.items?.map((item) => (
              <tr key={item.id} className="hover:bg-zinc-850/40">
                <td className="px-4 py-3 font-medium text-white">{item.title}</td>
                <td className="px-4 py-3 font-mono text-zinc-400">{item.sku || "N/A"}</td>
                <td className="px-4 py-3 text-center font-mono text-zinc-300">{item.quantity}</td>
                <td className="px-4 py-3 text-right font-mono text-zinc-400">₹{formatRupees(item.unit_price_paise)}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-400">
                  ₹{formatRupees(item.total_price_paise)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Financial Summary */}
        <div className="p-5 border-t border-zinc-800 bg-zinc-950/40">
          <div className="max-w-xs ml-auto space-y-1.5 text-xs text-zinc-400">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-mono text-zinc-200">₹{formatRupees(order.subtotal_paise)}</span>
            </div>
            <div className="flex justify-between">
              <span>Shipping Fee:</span>
              <span className="font-mono text-zinc-200">₹{formatRupees(order.shipping_amount_paise)}</span>
            </div>
            <div className="flex justify-between">
              <span>GST / Taxes:</span>
              <span className="font-mono text-zinc-200">₹{formatRupees(order.tax_paise)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-zinc-800 text-sm font-bold text-white">
              <span>Grand Total:</span>
              <span className="font-mono text-emerald-400">₹{formatRupees(order.total_amount_paise)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Internal Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Record Internal Administrative Note</h3>
            <p className="text-xs text-zinc-400">
              Internal notes are recorded to the platform audit log and visible only to staff.
            </p>
            <form onSubmit={handleAddNote} className="space-y-4">
              <textarea
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder="Enter operational observations, customer communication details..."
                rows={4}
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNoteModal(false)}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingNote}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {savingNote ? "Recording..." : "Save Note"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dispatch Shipment Modal */}
      {showShipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Dispatch Order & Assign Tracking</h3>
            <p className="text-xs text-zinc-400">
              Assign courier partner and tracking AWB to notify customer and trigger logistics status.
            </p>
            <form onSubmit={handleCreateShipment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Carrier Partner</label>
                <input
                  type="text"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  required
                  placeholder="e.g. Delhivery, BlueDart, DTDC"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Tracking Number / AWB (Optional)</label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="Leave blank to auto-generate via Shiprocket"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Package Weight (Grams)</label>
                <input
                  type="number"
                  value={weightGrams}
                  onChange={(e) => setWeightGrams(Number(e.target.value))}
                  min={50}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowShipModal(false)}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dispatchingShipment}
                  className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
                >
                  {dispatchingShipment ? "Dispatching..." : "Confirm Dispatch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
