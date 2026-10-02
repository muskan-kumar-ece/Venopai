"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { adminCustomersApi } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

interface CustomerItem {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
  is_verified?: boolean;
  status?: string;
  is_active?: boolean;
  created_at?: string;
  orders_count?: number;
  requests_count?: number;
}

export default function AdminCustomersPage() {
  const { hasRole, isAuthenticated } = useAdminAuth();
  const isAllowed = hasRole(["SUPER_ADMIN", "ORDER_MANAGER", "SUPPORT_EXECUTIVE"]);

  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  // Selected customer for modal/drawer
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [customerRequests, setCustomerRequests] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const fetchCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminCustomersApi.listCustomers({
        search: search || undefined,
        status: statusFilter || undefined,
        segment: segmentFilter || undefined,
        page,
        page_size: 25,
      });
      if (res?.data) {
        setCustomers(res.data);
      } else if (Array.isArray(res)) {
        setCustomers(res);
      } else {
        setCustomers([]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && isAllowed) {
      fetchCustomers();
    }
  }, [isAuthenticated, isAllowed, search, statusFilter, segmentFilter, page]);

  const handleSelectCustomer = async (cust: CustomerItem) => {
    setSelectedCustomer(cust);
    setLoadingDetails(true);
    try {
      const [ordersRes, reqsRes] = await Promise.allSettled([
        adminCustomersApi.getCustomerOrders(cust.id),
        adminCustomersApi.getCustomerRequests(cust.id),
      ]);
      if (ordersRes.status === "fulfilled" && ordersRes.value?.data) {
        setCustomerOrders(ordersRes.value.data);
      } else {
        setCustomerOrders([]);
      }
      if (reqsRes.status === "fulfilled" && reqsRes.value?.data) {
        setCustomerRequests(reqsRes.value.data);
      } else {
        setCustomerRequests([]);
      }
    } catch {
      // ignore
    } finally {
      setLoadingDetails(false);
    }
  };

  // Deactivate modal state
  const [deactivateCust, setDeactivateCust] = useState<CustomerItem | null>(null);
  const [deactivateReason, setDeactivateReason] = useState("");
  const [deactivating, setDeactivating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const confirmDeactivate = async () => {
    if (!deactivateCust || !deactivateReason.trim()) return;
    setDeactivating(true);
    setFeedback(null);
    try {
      await adminCustomersApi.deactivateCustomer(deactivateCust.id, deactivateReason.trim());
      setFeedback({ type: "success", message: `Customer account ${deactivateCust.email} deactivated successfully.` });
      setDeactivateCust(null);
      setDeactivateReason("");
      fetchCustomers();
      if (selectedCustomer?.id === deactivateCust.id) setSelectedCustomer(null);
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Failed to deactivate customer account.",
      });
    } finally {
      setDeactivating(false);
    }
  };

  const handleDeactivate = (cust: CustomerItem) => {
    setDeactivateCust(cust);
    setDeactivateReason("");
  };

  if (!isAuthenticated) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-xs text-zinc-500">Authenticating operations credentials...</p>
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="rounded-2xl border border-red-900/50 bg-red-950/20 p-8 text-center">
        <h2 className="text-lg font-bold text-red-400">Access Restricted</h2>
        <p className="mt-2 text-xs text-zinc-400">
          Customer Management is scoped to Support Executives, Order Managers, and Super Administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Customer Accounts &amp; Triage</h1>
          <p className="text-xs text-zinc-400">
            Audit customer profiles, triage engineering clients vs retail buyers, and inspect order pipelines.
          </p>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-xl border p-4 text-xs font-semibold ${
            feedback.type === "success"
              ? "border-emerald-800 bg-emerald-950/60 text-emerald-300"
              : "border-red-800 bg-red-950/60 text-red-300"
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-zinc-400 hover:text-white font-mono cursor-pointer"
          >
            &#10005;
          </button>
        </div>
      )}

      {/* Client Segment Tabs (Module 6) */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
        <button
          onClick={() => {
            setSegmentFilter("");
            setPage(1);
          }}
          className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
            segmentFilter === ""
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          }`}
        >
          All Customers
        </button>
        <button
          onClick={() => {
            setSegmentFilter("engineering");
            setPage(1);
          }}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
            segmentFilter === "engineering"
              ? "bg-cyan-950/80 text-cyan-300 border border-cyan-800"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          }`}
        >
          <span>⚡ Engineering Clients</span>
        </button>
        <button
          onClick={() => {
            setSegmentFilter("retail");
            setPage(1);
          }}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
            segmentFilter === "retail"
              ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          }`}
        >
          <span>📦 Hardware Buyers</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder="Search by email, name, or phone..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 focus:border-emerald-500 focus:outline-none"
        >
          <option value="">All Account Statuses</option>
          <option value="active">Active</option>
          <option value="deactivated">Deactivated</option>
          <option value="unverified">Unverified</option>
        </select>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Customers Table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        {loading ? (
          <div className="p-8 text-center text-xs text-zinc-500">Loading customer directory...</div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-500">No customer accounts found matching criteria.</div>
        ) : (
          <table className="min-w-full divide-y divide-zinc-800 text-left text-xs">
            <thead className="bg-zinc-950/50">
              <tr>
                <th className="px-6 py-3 font-semibold text-zinc-400">Customer</th>
                <th className="px-6 py-3 font-semibold text-zinc-400">Client Type &amp; Activity</th>
                <th className="px-6 py-3 font-semibold text-zinc-400">Verification</th>
                <th className="px-6 py-3 font-semibold text-zinc-400">Phone</th>
                <th className="px-6 py-3 font-semibold text-zinc-400">Registered</th>
                <th className="px-6 py-3 text-right font-semibold text-zinc-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {customers.map((c) => {
                const isActive = c.is_active ?? true;
                const reqCount = c.requests_count || 0;
                const ordCount = c.orders_count || 0;

                return (
                  <tr key={c.id} className="hover:bg-zinc-800/40 transition">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white">{c.full_name || "—"}</div>
                      <div className="font-mono text-[11px] text-zinc-400">{c.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {reqCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-950/80 px-2 py-0.5 text-[10px] font-bold text-cyan-300 border border-cyan-800">
                            ⚡ {reqCount} {reqCount === 1 ? "Project" : "Projects"}
                          </span>
                        )}
                        {ordCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/80 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-800">
                            📦 {ordCount} {ordCount === 1 ? "Order" : "Orders"}
                          </span>
                        )}
                        {reqCount === 0 && ordCount === 0 && (
                          <span className="text-[11px] text-zinc-500">New Prospect</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {c.is_verified ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-800">
                          &#10003; Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-950/60 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-800">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-zinc-400">
                      {c.phone || "—"}
                    </td>
                    <td className="px-6 py-4 text-zinc-500">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => handleSelectCustomer(c)}
                          className="font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer"
                        >
                          View 360° Record
                        </button>
                        {isActive && (
                          <button
                            onClick={() => handleDeactivate(c)}
                            className="font-semibold text-red-400 hover:text-red-300 cursor-pointer"
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page <= 1 || loading}
          className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
        >
          &larr; Previous
        </button>
        <span className="text-xs text-zinc-500">Page {page}</span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={customers.length < 25 || loading}
          className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
        >
          Next &rarr;
        </button>
      </div>

      {/* Customer 360 Detail Drawer Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Customer 360° Operational Dossier
                </h3>
                <p className="font-mono text-xs text-zinc-400">{selectedCustomer.email}</p>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
              >
                &#10005;
              </button>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-2xl bg-zinc-950 p-4 border border-zinc-800/80">
                  <span className="text-zinc-500 font-semibold uppercase text-[10px]">Customer Name &amp; ID</span>
                  <p className="mt-1 font-bold text-white text-sm">{selectedCustomer.full_name || "Anonymous Client"}</p>
                  <p className="font-mono text-[10px] text-zinc-500 truncate mt-0.5">{selectedCustomer.id}</p>
                </div>
                <div className="rounded-2xl bg-zinc-950 p-4 border border-zinc-800/80">
                  <span className="text-zinc-500 font-semibold uppercase text-[10px]">Direct Contact Phone</span>
                  <p className="mt-1 font-mono font-bold text-white text-sm">{selectedCustomer.phone || "No phone registered"}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Primary verified recipient contact</p>
                </div>
              </div>

              {/* Direct Queue Jump Links (Module 6) */}
              <div className="flex flex-wrap gap-2.5">
                <Link
                  href={`/admin/orders?search=${encodeURIComponent(selectedCustomer.email)}`}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 px-3.5 py-2.5 text-xs font-bold text-white transition border border-zinc-700"
                >
                  <span>📦 View Orders in Orders Queue &rarr;</span>
                </Link>
                <Link
                  href={`/admin/manufacturing?search=${encodeURIComponent(selectedCustomer.email)}`}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/60 px-3.5 py-2.5 text-xs font-bold text-cyan-300 transition border border-cyan-800"
                >
                  <span>⚡ View Projects in Manufacturing &rarr;</span>
                </Link>
              </div>

              {/* Orders Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Order History ({customerOrders.length})</h4>
                </div>
                {loadingDetails ? (
                  <div className="text-xs text-zinc-500">Loading order records...</div>
                ) : customerOrders.length === 0 ? (
                  <div className="rounded-xl bg-zinc-950 p-4 text-xs text-zinc-500">No placed orders recorded.</div>
                ) : (
                  <div className="space-y-2">
                    {customerOrders.slice(0, 5).map((ord) => (
                      <div key={ord.id} className="flex items-center justify-between rounded-xl bg-zinc-950 p-3 text-xs border border-zinc-800/60">
                        <div>
                          <span className="font-mono font-bold text-white">{ord.order_number || ord.id.slice(0, 8)}</span>
                          <span className="ml-2 capitalize text-zinc-400">{ord.status}</span>
                        </div>
                        <div className="font-mono font-bold text-emerald-400">
                          ₹{parseFloat(ord.total_amount || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Engineering Requests Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Engineering Requests ({customerRequests.length})</h4>
                </div>
                {loadingDetails ? (
                  <div className="text-xs text-zinc-500">Loading engineering projects...</div>
                ) : customerRequests.length === 0 ? (
                  <div className="rounded-xl bg-zinc-950 p-4 text-xs text-zinc-500">No custom engineering requests.</div>
                ) : (
                  <div className="space-y-2">
                    {customerRequests.slice(0, 5).map((req) => (
                      <div key={req.id} className="flex items-center justify-between rounded-xl bg-zinc-950 p-3 text-xs border border-zinc-800/60">
                        <div>
                          <span className="font-mono font-bold text-cyan-400">{req.id.slice(0, 8)}</span>
                          <span className="ml-2 font-medium text-white">{req.title}</span>
                          <span className="ml-2 text-[10px] uppercase font-mono text-zinc-500">({req.type})</span>
                        </div>
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
                          {req.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end border-t border-zinc-800 pt-4">
              <button
                onClick={() => setSelectedCustomer(null)}
                className="rounded-xl bg-zinc-800 px-5 py-2 text-xs font-semibold text-white hover:bg-zinc-700 cursor-pointer"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Account Modal */}
      {deactivateCust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-red-900/50 bg-zinc-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-red-400">
              Deactivate Customer Account
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Are you sure you want to deactivate <strong className="text-white">{deactivateCust.email}</strong>? The user will be logged out and prevented from signing in.
            </p>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Deactivation Reason (Mandatory Audit Log) *
              </label>
              <textarea
                value={deactivateReason}
                onChange={(e) => setDeactivateReason(e.target.value)}
                placeholder="Specify regulatory or fraud reason for deactivation..."
                rows={3}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setDeactivateCust(null);
                  setDeactivateReason("");
                }}
                disabled={deactivating}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeactivate}
                disabled={deactivating || !deactivateReason.trim()}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-40 cursor-pointer"
              >
                {deactivating ? "Deactivating..." : "Confirm Deactivation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
