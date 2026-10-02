"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { adminInventoryApi, adminCatalogApi } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

interface InventoryItem {
  product_id: string;
  stock_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  reorder_point?: number;
}

interface ProductInfo {
  id: string;
  name: string;
  sku: string;
  price: string;
}

interface Reservation {
  id: string;
  inventory_id: string;
  order_id?: string | null;
  quantity: number;
  status: string;
  created_at?: string;
  expires_at?: string;
}

export default function AdminInventoryPage() {
  const { hasRole, isAuthenticated } = useAdminAuth();
  const isAllowed = hasRole(["SUPER_ADMIN", "ORDER_MANAGER"]);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [productsMap, setProductsMap] = useState<Record<string, ProductInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Stock Adjustment Modal
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);
  const [delta, setDelta] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Reservation Inspection Modal
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loadingReservations, setLoadingReservations] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [invRes, prodRes] = await Promise.allSettled([
        adminInventoryApi.listInventory({ page_size: 100 }),
        adminCatalogApi.listProducts({ page_size: 100 }),
      ]);

      if (invRes.status === "fulfilled" && invRes.value?.data) {
        setItems(invRes.value.data);
      } else if (invRes.status === "rejected") {
        throw invRes.reason;
      }

      if (prodRes.status === "fulfilled" && prodRes.value?.data) {
        const map: Record<string, ProductInfo> = {};
        for (const p of prodRes.value.data) {
          map[p.id] = { id: p.id, name: p.name, sku: p.sku, price: p.price };
        }
        setProductsMap(map);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const handleOpenAdjust = (item: InventoryItem) => {
    setAdjustingItem(item);
    setDelta("");
    setReason("");
    setAdjustError(null);
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingItem) return;

    const deltaNum = parseInt(delta, 10);
    if (isNaN(deltaNum) || deltaNum === 0) {
      setAdjustError("Please specify a non-zero adjustment delta (e.g. +25 or -10).");
      return;
    }

    if (!reason.trim()) {
      setAdjustError("Reason is mandatory for inventory audit trail (AUDIT-001).");
      return;
    }

    setAdjusting(true);
    setAdjustError(null);

    try {
      await adminInventoryApi.adjustInventory(adjustingItem.product_id, {
        delta: deltaNum,
        reason: reason.trim(),
      });

      setSuccess(`Inventory adjusted by ${deltaNum > 0 ? `+${deltaNum}` : deltaNum} units.`);
      setAdjustingItem(null);
      await loadData();
      setTimeout(() => setSuccess(null), 3500);
    } catch (err: unknown) {
      setAdjustError(err instanceof Error ? err.message : "Failed to adjust inventory");
    } finally {
      setAdjusting(false);
    }
  };

  const handleInspectReservations = async (productId: string) => {
    setInspectingId(productId);
    setLoadingReservations(true);
    try {
      const res = await adminInventoryApi.listReservations(productId);
      if (res?.data) {
        setReservations(res.data);
      }
    } catch {
      setReservations([]);
    } finally {
      setLoadingReservations(false);
    }
  };

  if (!isAllowed) {
    return (
      <div className="p-8 text-center text-red-400">
        Access Restricted: Inventory management requires ORDER_MANAGER or SUPER_ADMIN role.
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase text-blue-400">
            <span>Warehouse Logistics</span>
            <span>&bull;</span>
            <span>Stock Balances</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
            Inventory & Stock Allocation
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time tracking of physical stock on hand, temporary checkout reservations, and available units.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/catalog/products"
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition"
          >
            Catalog Directory &rarr;
          </Link>
          <button
            onClick={loadData}
            className="rounded-lg bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-700 transition cursor-pointer"
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

      {success && (
        <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-4 text-xs text-emerald-300">
          {success}
        </div>
      )}

      {/* Inventory Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-xs font-mono text-zinc-400 animate-pulse">
            Loading warehouse inventory balances...
          </div>
        ) : items.length === 0 ? (
          <div className="p-16 text-center text-zinc-500 text-xs">
            No inventory records registered. Add products to initialize stock.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] font-mono uppercase text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Product Name & SKU</th>
                  <th className="px-4 py-3 text-right">Physical On-Hand</th>
                  <th className="px-4 py-3 text-right">Reserved (Holds)</th>
                  <th className="px-4 py-3 text-right">Available for Sale</th>
                  <th className="px-4 py-3 text-right">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {items.map((it) => {
                  const prod = productsMap[it.product_id];
                  const isLow = it.available_quantity <= (it.reorder_point || 5);

                  return (
                    <tr key={it.product_id} className="hover:bg-zinc-850/50 transition">
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-white max-w-sm truncate">
                          {prod?.name || "Product Record"}
                        </div>
                        <div className="font-mono text-[11px] text-zinc-400">
                          SKU: {prod?.sku || it.product_id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-zinc-200">
                        {it.stock_quantity}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-amber-400">
                        {it.reserved_quantity > 0 ? (
                          <button
                            type="button"
                            onClick={() => handleInspectReservations(it.product_id)}
                            className="underline hover:text-amber-300"
                          >
                            {it.reserved_quantity} units
                          </button>
                        ) : (
                          "0"
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-white">
                        {it.available_quantity}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            it.available_quantity === 0
                              ? "bg-red-950/80 text-red-400 border border-red-800"
                              : isLow
                              ? "bg-amber-950/80 text-amber-400 border border-amber-800"
                              : "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                          }`}
                        >
                          {it.available_quantity === 0
                            ? "Out of Stock"
                            : isLow
                            ? "Low Stock"
                            : "Available"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => handleOpenAdjust(it)}
                          className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-white hover:bg-zinc-700 transition cursor-pointer"
                        >
                          Adjust Stock
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

      {/* Adjust Stock Modal */}
      {adjustingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-white">Adjust Warehouse Stock</h3>
              <p className="text-xs text-zinc-400 mt-1">
                {productsMap[adjustingItem.product_id]?.name || "Product"}
              </p>
              <div className="mt-2 text-xs font-mono text-zinc-400">
                Current On-Hand: <span className="text-white font-bold">{adjustingItem.stock_quantity}</span>
              </div>
            </div>

            {adjustError && (
              <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300">
                {adjustError}
              </div>
            )}

            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Adjustment Delta (Positive or Negative) *
                </label>
                <input
                  type="number"
                  required
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  placeholder="e.g. +50 for restock or -5 for damage"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-500 font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Reason for Adjustment (AUDIT-001 Required) *
                </label>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Physical cycle count restock PO-9481"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustingItem(null)}
                  className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjusting}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition cursor-pointer"
                >
                  {adjusting ? "Updating..." : "Confirm Stock Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Reservations Modal */}
      {inspectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Active Stock Reservations</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Holds pending payment or order fulfillment
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingId(null)}
                className="text-zinc-500 hover:text-white text-xs"
              >
                Close
              </button>
            </div>

            {loadingReservations ? (
              <div className="p-8 text-center text-xs font-mono text-zinc-400 animate-pulse">
                Fetching reservation records...
              </div>
            ) : reservations.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                No active reservations for this component.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800 max-h-60 overflow-y-auto">
                {reservations.map((r) => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono text-white font-semibold">{r.quantity} units</span>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        Order ID: {r.order_id || "Checkout Session"}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                        {r.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
