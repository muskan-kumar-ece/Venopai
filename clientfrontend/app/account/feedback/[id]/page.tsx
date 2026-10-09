"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { feedbackApi } from "@/lib/api/client";
import { LoadingState } from "@/components/account/LoadingState";

interface FeedbackDetail {
  id: string;
  feedback_type?: string;
  priority?: string;
  subject?: string;
  status: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  resolved_at?: string;
  admin_response?: string;
  page_url?: string;
  order_id?: string;
  screenshot_url?: string;
  file_urls?: string[];
  [key: string]: unknown;
}

export default function AccountFeedbackDetailPage() {
  const params = useParams();
  const feedbackId = params?.id as string;

  const [item, setItem] = useState<FeedbackDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!feedbackId) return;

    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await feedbackApi.getMyFeedbackDetail(feedbackId);
        if (res?.data) {
          setItem(res.data);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load feedback item");
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [feedbackId]);

  if (loading) {
    return <LoadingState message="Loading report details..." />;
  }

  if (error || !item) {
    return (
      <div className="space-y-4">
        <Link
          href="/account/feedback"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-500"
        >
          ← Back to All Feedback
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          {error || "Report not found or access denied."}
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Open for Triage
          </span>
        );
      case "under_review":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            Under Investigation
          </span>
        );
      case "resolved":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Resolved
          </span>
        );
      case "closed":
      case "wont_fix":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
            Closed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/account/feedback"
          className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
        >
          ← Back to Feedback Queue
        </Link>
      </div>

      {/* Main Detail Header Card */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-mono font-bold text-zinc-500 dark:text-zinc-400">
                TICKET #{item.id?.slice(0, 8)}
              </span>
              <span className="text-zinc-300 dark:text-zinc-700">&bull;</span>
              <span className="font-semibold text-zinc-700 dark:text-zinc-300 uppercase">
                {item.feedback_type?.replace(/_/g, " ")}
              </span>
              <span className="text-zinc-300 dark:text-zinc-700">&bull;</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                {item.priority} PRIORITY
              </span>
            </div>
            <h1 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {item.subject}
            </h1>
          </div>

          <div className="shrink-0">
            {getStatusBadge(item.status)}
          </div>
        </div>

        {/* Timeline Stepper */}
        <div className="py-6 border-b border-zinc-100 dark:border-zinc-800">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4">
            Investigation Progress
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {/* Step 1: Logged */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold">
                <span>✓</span>
                <span>Report Logged</span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                {item.created_at
                  ? new Date(item.created_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Just now"}
              </p>
            </div>

            {/* Step 2: Under Review */}
            <div
              className={`rounded-xl border p-3.5 ${
                item.status === "under_review" || item.status === "resolved" || item.status === "closed"
                  ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/30"
                  : "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/50"
              }`}
            >
              <div
                className={`flex items-center gap-2 font-bold ${
                  item.status === "under_review" || item.status === "resolved" || item.status === "closed"
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-zinc-400"
                }`}
              >
                <span>{item.status === "open" ? "○" : "✓"}</span>
                <span>Engineering Triage</span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                {item.status === "open" ? "Queued for review" : "Assigned & analyzed"}
              </p>
            </div>

            {/* Step 3: Resolution */}
            <div
              className={`rounded-xl border p-3.5 ${
                item.status === "resolved"
                  ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/30"
                  : item.status === "closed"
                  ? "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50"
                  : "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/50"
              }`}
            >
              <div
                className={`flex items-center gap-2 font-bold ${
                  item.status === "resolved"
                    ? "text-emerald-700 dark:text-emerald-400"
                    : item.status === "closed"
                    ? "text-zinc-600 dark:text-zinc-300"
                    : "text-zinc-400"
                }`}
              >
                <span>{item.status === "resolved" ? "✓" : "○"}</span>
                <span>{item.status === "resolved" ? "Resolved" : "Resolution"}</span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                {item.resolved_at
                  ? new Date(item.resolved_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "Pending resolution"}
              </p>
            </div>
          </div>
        </div>

        {/* Engineer Response Card if resolved */}
        {item.admin_response && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
              <span>🛡️</span>
              <span>Engineering Team Response</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-emerald-900 dark:text-emerald-200 whitespace-pre-line">
              {item.admin_response}
            </p>
          </div>
        )}

        {/* Detailed Report Content */}
        <div className="mt-6 space-y-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Submitted Description
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-line bg-zinc-50 dark:bg-zinc-950/60 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 font-mono">
              {item.description}
            </p>
          </div>

          {/* Contextual metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {item.page_url && (
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950/40">
                <span className="text-zinc-400 block text-[11px] font-bold">AFFECTED URL</span>
                <span className="font-mono text-zinc-800 dark:text-zinc-200 break-all">
                  {item.page_url}
                </span>
              </div>
            )}

            {item.order_id && (
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950/40">
                <span className="text-zinc-400 block text-[11px] font-bold">LINKED ORDER</span>
                <Link
                  href={`/account/orders/${item.order_id}`}
                  className="font-mono text-emerald-600 dark:text-emerald-400 hover:underline font-bold"
                >
                  View Order #{item.order_id.slice(0, 8)} →
                </Link>
              </div>
            )}

            {item.screenshot_url && (
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950/40 sm:col-span-2">
                <span className="text-zinc-400 block text-[11px] font-bold">SCREENSHOT / ATTACHMENT</span>
                <a
                  href={item.screenshot_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 dark:text-emerald-400 hover:underline break-all"
                >
                  {item.screenshot_url} ↗
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
