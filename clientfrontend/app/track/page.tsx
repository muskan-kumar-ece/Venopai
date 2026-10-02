"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api/client";

interface Milestone {
  step: number;
  title: string;
  description: string;
  status: "completed" | "current" | "pending";
  timestamp: string | null;
}

interface TrackingData {
  order_number: string;
  order_date: string | null;
  order_status: string;
  shipment_status: string;
  carrier: string;
  tracking_number: string | null;
  estimated_delivery: string | null;
  destination: string;
  item_count: number;
  milestones: Milestone[];
}

function PublicTrackingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialOrder = searchParams.get("order") || "";
  const initialAwb = searchParams.get("awb") || "";

  const [queryInput, setQueryInput] = useState(initialOrder || initialAwb);
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTracking = async (val: string) => {
    if (!val.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const isAwb = /^\d{8,16}$/.test(val.trim());
      const paramName = isAwb ? "awb" : "order_number";
      const res = await apiClient.get(`/orders/track/public?${paramName}=${encodeURIComponent(val.trim())}`);
      if (res?.data) {
        setTrackingData(res.data);
      } else {
        setError("Shipment tracking details could not be found for this reference.");
      }
    } catch (err: unknown) {
      setTrackingData(null);
      setError(
        err instanceof Error
          ? err.message
          : "No shipment or order found matching the provided reference. Please verify your Order # or AWB."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const val = initialOrder || initialAwb;
    if (val) {
      setQueryInput(val);
      fetchTracking(val);
    }
  }, [initialOrder, initialAwb]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) return;
    router.push(`/track?order=${encodeURIComponent(queryInput.trim())}`);
    fetchTracking(queryInput);
  };

  const statusColorMap: Record<string, string> = {
    paid: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-900",
    processing: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-900",
    ready_to_ship: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-400 dark:border-cyan-900",
    shipped: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-400 dark:border-indigo-900",
    in_transit: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-400 dark:border-indigo-900",
    delivered: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-900",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-900",
    cancelled: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-900",
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Header Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <nav className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <Link href="/" className="hover:text-zinc-900 dark:hover:text-white transition">
              Home
            </Link>
            <span>/</span>
            <span className="font-semibold text-zinc-900 dark:text-white">Public Order Tracking</span>
          </nav>
          <Link
            href="/account/orders"
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 transition"
          >
            Sign In to View All Orders &rarr;
          </Link>
        </div>

        {/* Hero Card */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 sm:p-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-center max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
              Live Shipment Tracking
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
              Track Your Hardware Delivery
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
              Enter your VenopAI Order Number (e.g., <code className="font-mono text-zinc-800 dark:text-zinc-200">ORD-2026-0001</code>) or courier Air Waybill (AWB) number to track progress from manufacturing to your doorstep.
            </p>

            {/* Tracking Search Form */}
            <form onSubmit={handleSubmit} className="mt-8 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Enter Order # or Tracking AWB..."
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-300 bg-zinc-50 pl-11 pr-4 py-3.5 text-sm text-zinc-900 font-mono placeholder:font-sans placeholder-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-white dark:placeholder-zinc-500"
                />
                <svg className="absolute left-4 top-4 h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <button
                type="submit"
                disabled={loading || !queryInput.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-6 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-all disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border border-white border-t-transparent" />
                ) : (
                  <>
                    <span>Track Status</span>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400 text-center">
              {error}
            </div>
          )}

          {/* Tracking Result View */}
          {trackingData && (
            <div className="mt-10 border-t border-zinc-200 pt-8 dark:border-zinc-800">
              {/* Order Status Ribbon */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-850">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Order Reference</span>
                  <div className="text-base font-bold text-zinc-900 dark:text-white font-mono">
                    {trackingData.order_number}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border uppercase tracking-wider ${statusColorMap[trackingData.order_status] || "bg-zinc-100 text-zinc-700 border-zinc-200"}`}>
                    Order: {trackingData.order_status}
                  </span>
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border uppercase tracking-wider ${statusColorMap[trackingData.shipment_status] || "bg-zinc-100 text-zinc-700 border-zinc-200"}`}>
                    Shipment: {trackingData.shipment_status}
                  </span>
                </div>
              </div>

              {/* Carrier & Delivery Info Grid */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <span className="text-[11px] font-medium text-zinc-400">Logistics Carrier</span>
                  <div className="mt-1 font-bold text-zinc-900 dark:text-white text-sm">
                    {trackingData.carrier}
                  </div>
                  {trackingData.tracking_number && (
                    <div className="mt-1 font-mono text-xs text-emerald-600 dark:text-emerald-400">
                      AWB: {trackingData.tracking_number}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <span className="text-[11px] font-medium text-zinc-400">Destination Hub</span>
                  <div className="mt-1 font-bold text-zinc-900 dark:text-white text-sm">
                    {trackingData.destination}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {trackingData.item_count} item{trackingData.item_count === 1 ? "" : "s"} in consignment
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <span className="text-[11px] font-medium text-zinc-400">Estimated Arrival</span>
                  <div className="mt-1 font-bold text-zinc-900 dark:text-white text-sm">
                    {trackingData.estimated_delivery
                      ? new Date(trackingData.estimated_delivery).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "2-4 Business Days"}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    Standard Express Surface / Air
                  </div>
                </div>
              </div>

              {/* 4-Step Visual Stepper */}
              <div className="mt-10">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-white mb-6">
                  Fulfillment Progression
                </h3>

                <div className="space-y-6">
                  {trackingData.milestones.map((m, idx) => (
                    <div key={m.step} className="relative flex items-start gap-4">
                      {/* Vertical line connecting steps */}
                      {idx !== trackingData.milestones.length - 1 && (
                        <div
                          className={`absolute left-4 top-8 -bottom-6 w-0.5 ${
                            m.status === "completed"
                              ? "bg-emerald-500"
                              : "bg-zinc-200 dark:bg-zinc-800"
                          }`}
                        />
                      )}

                      {/* Step Circle Indicator */}
                      <div
                        className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold text-xs shadow-sm transition-colors ${
                          m.status === "completed"
                            ? "bg-emerald-600 text-white"
                            : m.status === "current"
                            ? "border-2 border-emerald-500 bg-white text-emerald-600 dark:bg-zinc-900 dark:text-emerald-400"
                            : "border border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800"
                        }`}
                      >
                        {m.status === "completed" ? (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          m.step
                        )}
                      </div>

                      {/* Step Details */}
                      <div className="flex-1 pt-0.5">
                        <div className="flex items-center justify-between">
                          <h4
                            className={`text-sm font-bold ${
                              m.status === "completed" || m.status === "current"
                                ? "text-zinc-900 dark:text-white"
                                : "text-zinc-400 dark:text-zinc-500"
                            }`}
                          >
                            {m.title}
                          </h4>
                          {m.timestamp && (
                            <span className="font-mono text-xs text-zinc-400">
                              {new Date(m.timestamp).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {m.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Support & Assistance Footer */}
              <div className="mt-10 rounded-2xl bg-zinc-100 p-4 text-center dark:bg-zinc-800/60">
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  Questions regarding this shipment? Our engineering operations desk is ready to help.{" "}
                  <Link href="/contact" className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
                    Contact Hardware Support
                  </Link>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PublicTrackingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      }
    >
      <PublicTrackingContent />
    </Suspense>
  );
}
