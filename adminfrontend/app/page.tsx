"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";
import { adminDashboardApi } from "@/lib/api/client";

export default function AdminHomePage() {
  const { adminUser, isAuthenticated, isLoading: authLoading, hasRole } = useAdminAuth();
  const [metrics, setMetrics] = useState({
    mfgCount: 0,
    designCount: 0,
    softwareCount: 0,
    consultationsCount: 0,
    productsCount: 0,
    lowStockCount: 0,
  });
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    const loadMetrics = async () => {
      setLoadingMetrics(true);
      try {
        const res = await adminDashboardApi.getDashboard();
        if (res?.data) {
          const hm = res.data.headline_metrics || {};
          const queues = res.data.queues || {};
          setMetrics({
            mfgCount: hm.open_requests || (queues.new_requests_awaiting_review?.length || 0),
            designCount: queues.requests_in_clarification?.length || 0,
            softwareCount: hm.open_orders || (queues.new_orders?.length || 0),
            consultationsCount: queues.quotes_awaiting_customer_response?.length || 0,
            productsCount: hm.total_revenue_inr ? Math.round(hm.total_revenue_inr) : 0,
            lowStockCount: hm.low_stock_count || (queues.low_stock_alerts?.length || 0),
          });
        }
      } catch {
        // Fallback or ignore
      } finally {
        setLoadingMetrics(false);
      }
    };

    loadMetrics();
  }, [isAuthenticated]);

  if (!authLoading && !isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-6 text-center">
        <div className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-2xl space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-950 border border-emerald-800">
            <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">Staff Authentication Required</h1>
          <p className="text-xs text-zinc-400 leading-relaxed">
            The VenopAI Operations Console is restricted to authorized operations, engineering, and fulfillment personnel.
          </p>
          <div className="pt-2">
            <Link
              href="/admin/login"
              className="inline-block rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition"
            >
              Sign In to Operations Console
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-400">
              Operations Control Panel
            </span>
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Welcome back, {adminUser?.full_name || "Staff"}
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            Current role scope: <span className="font-semibold text-white">{adminUser?.role}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasRole(["SUPER_ADMIN", "ORDER_MANAGER"]) && (
            <Link
              href="/admin/catalog/products/new"
              className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition"
            >
              + Add Product
            </Link>
          )}
          {hasRole(["SUPER_ADMIN", "MANUFACTURING_MANAGER"]) && (
            <Link
              href="/admin/manufacturing"
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 transition"
            >
              Manufacturing Queue
            </Link>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-[11px] font-mono uppercase text-zinc-500">MFG Requests</p>
          <p className="mt-2 text-2xl font-bold text-white">
            {loadingMetrics ? "-" : metrics.mfgCount}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-[11px] font-mono uppercase text-zinc-500">PCB Design</p>
          <p className="mt-2 text-2xl font-bold text-white">
            {loadingMetrics ? "-" : metrics.designCount}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-[11px] font-mono uppercase text-zinc-500">Firmware Tasks</p>
          <p className="mt-2 text-2xl font-bold text-white">
            {loadingMetrics ? "-" : metrics.softwareCount}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-[11px] font-mono uppercase text-zinc-500">Consultations</p>
          <p className="mt-2 text-2xl font-bold text-white">
            {loadingMetrics ? "-" : metrics.consultationsCount}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-[11px] font-mono uppercase text-zinc-500">Catalog SKUs</p>
          <p className="mt-2 text-2xl font-bold text-white">
            {loadingMetrics ? "-" : metrics.productsCount}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-[11px] font-mono uppercase text-zinc-500">Low Stock SKUs</p>
          <p className="mt-2 text-2xl font-bold text-amber-400">
            {loadingMetrics ? "-" : metrics.lowStockCount}
          </p>
        </div>
      </div>

      {/* Operational Portals Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Catalog & Inventory */}
        {hasRole(["SUPER_ADMIN", "ORDER_MANAGER"]) && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-blue-400 uppercase">Catalog Ops</span>
                <span className="text-[10px] text-zinc-500 font-mono">ORDER_MANAGER</span>
              </div>
              <h3 className="mt-3 text-base font-bold text-white">Hardware Catalog & Inventory</h3>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Add or edit components, upload datasheet specs, adjust warehouse physical inventory with audit reasons, and inspect active reservations.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center gap-3">
              <Link
                href="/admin/catalog/products"
                className="text-xs font-semibold text-blue-400 hover:text-blue-300"
              >
                Manage Products &rarr;
              </Link>
              <Link
                href="/admin/inventory"
                className="text-xs font-semibold text-zinc-400 hover:text-white"
              >
                Inventory Stock &rarr;
              </Link>
            </div>
          </div>
        )}

        {/* Manufacturing Queue */}
        {hasRole(["SUPER_ADMIN", "MANUFACTURING_MANAGER"]) && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-cyan-400 uppercase">Fabrication Ops</span>
                <span className="text-[10px] text-zinc-500 font-mono">MANUFACTURING_MANAGER</span>
              </div>
              <h3 className="mt-3 text-base font-bold text-white">Manufacturing Pipeline</h3>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Review incoming Gerber/OBD++ files, confirm DFM requirements, raise customer clarification threads, and log production stage milestones.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center gap-3">
              <Link
                href="/admin/manufacturing"
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300"
              >
                Open Queue &rarr;
              </Link>
              <Link
                href="/admin/manufacturing/cancellation-review"
                className="text-xs font-semibold text-zinc-400 hover:text-white"
              >
                Cancellations &rarr;
              </Link>
            </div>
          </div>
        )}

        {/* Design & PCB Layout */}
        {hasRole(["SUPER_ADMIN", "MANUFACTURING_MANAGER"]) && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-cyan-400 uppercase">Design Ops</span>
                <span className="text-[10px] text-zinc-500 font-mono">MANUFACTURING_MANAGER</span>
              </div>
              <h3 className="mt-3 text-base font-bold text-white">PCB Layout & Schematics</h3>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Manage custom PCB design orders, upload Altium/KiCad schematic archives, and submit DFM simulation reports.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center gap-3">
              <Link
                href="/admin/design"
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300"
              >
                PCB Design Queue &rarr;
              </Link>
            </div>
          </div>
        )}

        {/* Software & Firmware */}
        {hasRole(["SUPER_ADMIN", "MANUFACTURING_MANAGER"]) && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-indigo-400 uppercase">Firmware Ops</span>
                <span className="text-[10px] text-zinc-500 font-mono">MANUFACTURING_MANAGER</span>
              </div>
              <h3 className="mt-3 text-base font-bold text-white">Embedded Firmware Pipeline</h3>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Coordinate board bring-up code, driver milestones, RTOS implementations, and binary deliverable delivery.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center gap-3">
              <Link
                href="/admin/software"
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300"
              >
                Firmware Queue &rarr;
              </Link>
            </div>
          </div>
        )}

        {/* Customer Consultations */}
        {hasRole(["SUPER_ADMIN", "SUPPORT_EXECUTIVE"]) && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-amber-400 uppercase">Support Ops</span>
                <span className="text-[10px] text-zinc-500 font-mono">SUPPORT_EXECUTIVE</span>
              </div>
              <h3 className="mt-3 text-base font-bold text-white">Technical Inquiries & Reviews</h3>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Respond to customer engineering questions, convert technical advisory into official quotations, and moderate reviews.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center gap-3">
              <Link
                href="/admin/consultations"
                className="text-xs font-semibold text-amber-400 hover:text-amber-300"
              >
                Consultations Queue &rarr;
              </Link>
              <Link
                href="/admin/reviews"
                className="text-xs font-semibold text-zinc-400 hover:text-white"
              >
                Reviews Queue &rarr;
              </Link>
            </div>
          </div>
        )}

        {/* Financial Ops */}
        {hasRole(["SUPER_ADMIN", "FINANCE_MANAGER"]) && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-purple-400 uppercase">Finance Ops</span>
                <span className="text-[10px] text-zinc-500 font-mono">FINANCE_MANAGER</span>
              </div>
              <h3 className="mt-3 text-base font-bold text-white">Payments & Refunds</h3>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Audit Razorpay payment captures, inspect transactions, and process structured customer refunds with audit trails.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center gap-3">
              <Link
                href="/admin/payments"
                className="text-xs font-semibold text-purple-400 hover:text-purple-300"
              >
                Process Refunds &rarr;
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
