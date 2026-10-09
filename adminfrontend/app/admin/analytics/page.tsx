"use client";

import React, { useEffect, useState } from "react";
import { adminAnalyticsApi } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

interface AnalyticsData {
  total_revenue_inr?: number;
  total_revenue_paise?: number;
  total_orders?: number;
  total_customers?: number;
  total_products?: number;
  low_stock_sku_count?: number;
  active_services?: {
    manufacturing?: number;
    pcb_design?: number;
    firmware_software?: number;
    consultations?: number;
    total?: number;
  };
  quote_conversion_rate_percent?: number;
  [key: string]: unknown;
}

export default function AdminAnalyticsPage() {
  const { hasRole, isAuthenticated } = useAdminAuth();
  const isAllowed = hasRole(["SUPER_ADMIN", "FINANCE_MANAGER", "ORDER_MANAGER"]);

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleExportCsv = async () => {
    setExporting(true);
    setFeedback(null);
    try {
      const csvText = await adminAnalyticsApi.exportAnalytics();
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `venopai-analytics-export-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setFeedback({ type: "success", message: "CSV analytics report downloaded successfully." });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to export CSV report",
      });
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && isAllowed) {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminAnalyticsApi.getAnalytics()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((res: any) => {
          const data = res?.data || res;
          if (data) {
            setAnalytics(data as AnalyticsData);
          }
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Failed to load operational analytics");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isAuthenticated, isAllowed]);

  if (!isAllowed) {
    return (
      <div className="p-8 text-center text-red-400">
        Access Restricted: Operational analytics requires SUPER_ADMIN, FINANCE_MANAGER, or ORDER_MANAGER role.
      </div>
    );
  }

  const totalRevenue = typeof analytics?.total_revenue_inr === "number"
    ? analytics.total_revenue_inr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : (analytics?.total_revenue_paise ? (analytics.total_revenue_paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00");

  const totalOrders = analytics?.total_orders ?? 0;
  const totalCustomers = analytics?.total_customers ?? 0;
  const totalProducts = analytics?.total_products ?? 0;
  const lowStockCount = analytics?.low_stock_sku_count ?? 0;

  const mfgActive = analytics?.active_services?.manufacturing ?? 0;
  const designActive = analytics?.active_services?.pcb_design ?? 0;
  const swActive = analytics?.active_services?.firmware_software ?? 0;
  const consultActive = analytics?.active_services?.consultations ?? 0;
  const totalActiveServices = analytics?.active_services?.total ?? (mfgActive + designActive + swActive + consultActive);

  const quoteConvRate = typeof analytics?.quote_conversion_rate_percent === "number"
    ? `${analytics.quote_conversion_rate_percent.toFixed(1)}%`
    : "0.0%";

  const servicesSum = Math.max(totalActiveServices, 1);
  const mfgPercent = Math.round((mfgActive / servicesSum) * 100);
  const designPercent = Math.round((designActive / servicesSum) * 100);
  const swPercent = Math.round((swActive / servicesSum) * 100);
  const consultPercent = Math.round((consultActive / servicesSum) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Operations & Financial Analytics
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            Real-time pipeline metrics, fabrication turnaround, and revenue breakdown.
          </p>
        </div>

        <button
          disabled={exporting}
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {exporting ? "Generating CSV..." : "Export CSV Summary"}
        </button>
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

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Gross Sales Volume</span>
          <div className="mt-2 text-2xl font-extrabold text-white">
            ₹{totalRevenue}
          </div>
          <span className="mt-1 inline-flex items-center text-[11px] text-emerald-400">
            Realized via verified Razorpay payments
          </span>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Total Fulfillments</span>
          <div className="mt-2 text-2xl font-extrabold text-white">
            {totalOrders} Orders
          </div>
          <span className="mt-1 inline-flex items-center text-[11px] text-zinc-400">
            {totalCustomers} registered customer accounts
          </span>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Active Fabrication Queue</span>
          <div className="mt-2 text-2xl font-extrabold text-cyan-400">
            {mfgActive} Batches
          </div>
          <span className="mt-1 text-[11px] text-zinc-400">
            {totalActiveServices} total active engineering services
          </span>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Quote Conversion Rate</span>
          <div className="mt-2 text-2xl font-extrabold text-white">
            {quoteConvRate}
          </div>
          <span className="mt-1 text-[11px] text-zinc-400">
            Approved client engineering quotations
          </span>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Low Stock SKUs</span>
          <div className={`mt-2 text-2xl font-extrabold ${lowStockCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
            {lowStockCount} SKUs
          </div>
          <span className="mt-1 text-[11px] text-zinc-400">
            Below warehouse reorder threshold
          </span>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Active Catalog Products</span>
          <div className="mt-2 text-2xl font-extrabold text-emerald-400">
            {totalProducts} Products
          </div>
          <span className="mt-1 text-[11px] text-zinc-400">
            Live components across 8 categories
          </span>
        </div>
      </div>

      {/* Domain Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="text-sm font-bold text-white">Active Engineering Services Breakdown</h3>
          <p className="text-xs text-zinc-400 mt-0.5">Live distribution of client requests in execution</p>
          <div className="mt-5 space-y-4">
            <div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-300">Rapid PCB Manufacturing &amp; SMT</span>
                <span className="font-bold text-white font-mono">{mfgActive} active ({totalActiveServices > 0 ? `${mfgPercent}%` : "0%"})</span>
              </div>
              <div className="mt-1.5 h-2 w-full rounded-full bg-zinc-800">
                <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: totalActiveServices > 0 ? `${mfgPercent}%` : "0%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-300">Custom PCB Layout Design</span>
                <span className="font-bold text-white font-mono">{designActive} active ({totalActiveServices > 0 ? `${designPercent}%` : "0%"})</span>
              </div>
              <div className="mt-1.5 h-2 w-full rounded-full bg-zinc-800">
                <div className="h-2 rounded-full bg-cyan-500 transition-all" style={{ width: totalActiveServices > 0 ? `${designPercent}%` : "0%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-300">Firmware &amp; Embedded Software</span>
                <span className="font-bold text-white font-mono">{swActive} active ({totalActiveServices > 0 ? `${swPercent}%` : "0%"})</span>
              </div>
              <div className="mt-1.5 h-2 w-full rounded-full bg-zinc-800">
                <div className="h-2 rounded-full bg-purple-500 transition-all" style={{ width: totalActiveServices > 0 ? `${swPercent}%` : "0%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-300">Architecture Consultations</span>
                <span className="font-bold text-white font-mono">{consultActive} active ({totalActiveServices > 0 ? `${consultPercent}%` : "0%"})</span>
              </div>
              <div className="mt-1.5 h-2 w-full rounded-full bg-zinc-800">
                <div className="h-2 rounded-full bg-amber-500 transition-all" style={{ width: totalActiveServices > 0 ? `${consultPercent}%` : "0%" }} />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="text-sm font-bold text-white">Logistics &amp; Courier Coverage</h3>
          <p className="text-xs text-zinc-400 mt-0.5">Automated Shiprocket courier carrier routing</p>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-zinc-950 p-3 text-xs border border-zinc-800/60">
              <span className="font-semibold text-white">Shiprocket Express Air</span>
              <span className="font-mono text-emerald-400">Delhivery, BlueDart, DTDC</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-zinc-950 p-3 text-xs border border-zinc-800/60">
              <span className="font-semibold text-white">Surface Heavy Logistics</span>
              <span className="font-mono text-cyan-400">SafeXpress, SpotOn, GATI</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-zinc-950 p-3 text-xs border border-zinc-800/60">
              <span className="font-semibold text-white">Pin Code Serviceability</span>
              <span className="font-mono text-emerald-400">All India Coverage (27,000+ PINs)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
