"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { feedbackApi } from "@/lib/api/client";
import { LoadingState } from "@/components/account/LoadingState";
import { EmptyState } from "@/components/account/EmptyState";

interface FeedbackItem {
  id: string;
  feedback_type: string;
  priority: string;
  status: string;
  subject: string;
  description: string;
  page_url?: string;
  order_id?: string;
  admin_response?: string;
  created_at: string;
  resolved_at?: string;
}

export default function AccountFeedbackListPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");

  const loadFeedbacks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await feedbackApi.listMyFeedbacks({
        status: activeTab === "all" ? undefined : activeTab,
      });
      if (res?.data) {
        setItems(res.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load feedback records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeedbacks();
  }, [activeTab]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Open
          </span>
        );
      case "under_review":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            Under Review
          </span>
        );
      case "resolved":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Resolved
          </span>
        );
      case "closed":
      case "wont_fix":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
            Closed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {status}
          </span>
        );
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "bug_report":
        return "🐛";
      case "feature_request":
        return "✨";
      case "order_issue":
        return "📦";
      case "service_issue":
        return "🔧";
      case "payment_issue":
        return "💳";
      case "ui_ux_suggestion":
        return "🎨";
      default:
        return "💬";
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "critical":
        return <span className="font-bold text-red-600 dark:text-red-400 text-[11px] uppercase">CRITICAL</span>;
      case "high":
        return <span className="font-semibold text-amber-600 dark:text-amber-400 text-[11px] uppercase">HIGH</span>;
      case "medium":
        return <span className="font-medium text-blue-600 dark:text-blue-400 text-[11px] uppercase">MEDIUM</span>;
      default:
        return <span className="text-zinc-500 dark:text-zinc-400 text-[11px] uppercase">LOW</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Feedback & Issue Reports
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Track bug reports, feature requests, and operational queries submitted to our engineering staff.
          </p>
        </div>
        <Link
          href="/feedback"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 transition-colors"
        >
          <span>+</span>
          <span>Submit New Report</span>
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 gap-2 overflow-x-auto">
        {[
          { key: "all", label: "All Submissions" },
          { key: "open", label: "Open" },
          { key: "under_review", label: "Under Review" },
          { key: "resolved", label: "Resolved" },
          { key: "closed", label: "Closed" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pb-3 px-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === tab.key
                ? "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400 font-bold"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <LoadingState message="Loading your feedback records..." />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No feedback reports logged"
          message={
            activeTab === "all"
              ? "You haven't reported any bugs or feature requests yet. If you notice anything broken or have an idea, let us know!"
              : `No reports found matching status '${activeTab}'.`
          }
          icon="💬"
          actionLabel="Submit Feedback"
          actionHref="/feedback"
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/account/feedback/${item.id}`}
              className="block rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-xs hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl mt-0.5">{getTypeIcon(item.feedback_type)}</span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono text-zinc-400">
                        #{item.id.slice(0, 8)}
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-700">&bull;</span>
                      <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 capitalize">
                        {item.feedback_type.replace(/_/g, " ")}
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-700">&bull;</span>
                      {getPriorityBadge(item.priority)}
                    </div>
                    <h3 className="mt-1 text-sm font-bold text-zinc-900 dark:text-white">
                      {item.subject}
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between shrink-0 gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-100 dark:border-zinc-800">
                  {getStatusBadge(item.status)}
                  <span className="text-[11px] text-zinc-400 font-mono">
                    {new Date(item.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>

              {/* Resolution pill preview */}
              {item.admin_response && (
                <div className="mt-3 rounded-lg bg-emerald-50/60 border border-emerald-100 p-2.5 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-300 flex items-start gap-2">
                  <span className="font-bold shrink-0">Engineer Response:</span>
                  <span className="line-clamp-1">{item.admin_response}</span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
