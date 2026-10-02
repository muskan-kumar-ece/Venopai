"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";
import { adminFeedbackApi, AdminFeedbackFilterParams } from "@/lib/api/client";

interface FeedbackItem {
  id: string;
  feedback_type: string;
  priority: string;
  status: string;
  subject: string;
  description: string;
  guest_name?: string;
  guest_email?: string;
  user_full_name?: string;
  user_email?: string;
  page_url?: string;
  order_id?: string;
  admin_notes?: string;
  admin_response?: string;
  created_at: string;
  resolved_at?: string;
}

interface FeedbackStats {
  total: number;
  open: number;
  under_review: number;
  resolved: number;
  closed: number;
  critical_pending: number;
  high_pending: number;
  by_type: Record<string, number>;
}

export default function AdminFeedbackPage() {
  const { adminToken, hasRole, isAuthenticated, isLoading } = useAdminAuth();

  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);

  const fetchStats = async () => {
    try {
      const res = await adminFeedbackApi.getStats(adminToken || undefined);
      if (res?.data) {
        setStats(res.data);
      }
    } catch {
      // stats error handled silently
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: AdminFeedbackFilterParams = {
        status: statusFilter === "all" ? undefined : statusFilter,
        feedback_type: typeFilter === "all" ? undefined : typeFilter,
        priority: priorityFilter === "all" ? undefined : priorityFilter,
        search: searchQuery.trim() || undefined,
        page,
        page_size: 20,
      };

      const res = await adminFeedbackApi.listFeedbacks(params, adminToken || undefined);
      if (res?.data) {
        setItems(res.data);
        if (res.pagination) {
          setTotalPages(res.pagination.total_pages || 1);
          setTotalItems(res.pagination.total_items || 0);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load feedback triage queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated && adminToken) {
      fetchStats();
    }
  }, [isLoading, isAuthenticated, adminToken]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && adminToken) {
      fetchItems();
    }
  }, [isLoading, isAuthenticated, adminToken, statusFilter, typeFilter, priorityFilter, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchItems();
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "critical":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-extrabold text-red-800 dark:bg-red-950/80 dark:text-red-300 animate-pulse border border-red-300 dark:border-red-800">
            CRITICAL
          </span>
        );
      case "high":
        return (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            HIGH
          </span>
        );
      case "medium":
        return (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
            MEDIUM
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            LOW
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Open
          </span>
        );
      case "under_review":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            Under Review
          </span>
        );
      case "resolved":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Resolved
          </span>
        );
      case "closed":
      case "wont_fix":
        return (
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            Closed
          </span>
        );
      default:
        return <span className="text-[11px]">{status}</span>;
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

  if (isLoading) {
    return (
      <div className="p-12 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Loading admin workspace...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900 space-y-3">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Admin Authentication Required</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          You must be signed in as an administrator or support staff to view customer feedback triage queue.
        </p>
        <div>
          <Link
            href="/admin/login"
            className="inline-block rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors"
          >
            Sign In to Admin Portal
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Customer Feedback & Bug Triage
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Operational triage desk for customer bug reports, platform errors, and feature requests.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Total Logged
            </span>
            <div className="mt-2 text-2xl font-extrabold text-zinc-900 dark:text-white">
              {stats.total}
            </div>
            <span className="text-[11px] text-zinc-400">Across all categories</span>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs dark:border-amber-900/50 dark:bg-amber-950/20">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
              Open For Triage
            </span>
            <div className="mt-2 text-2xl font-extrabold text-amber-900 dark:text-amber-200">
              {stats.open}
            </div>
            <span className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
              Needs engineer review
            </span>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 shadow-xs dark:border-red-900/50 dark:bg-red-950/20">
            <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider">
              Critical & High
            </span>
            <div className="mt-2 text-2xl font-extrabold text-red-900 dark:text-red-200">
              {stats.critical_pending + stats.high_pending}
            </div>
            <span className="text-[11px] text-red-700/80 dark:text-red-400/80">
              Payment & error issues
            </span>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              Resolved Reports
            </span>
            <div className="mt-2 text-2xl font-extrabold text-emerald-900 dark:text-emerald-200">
              {stats.resolved}
            </div>
            <span className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
              Completed fixes & replies
            </span>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            {[
              { key: "all", label: "All Status" },
              { key: "open", label: "Open" },
              { key: "under_review", label: "Under Review" },
              { key: "resolved", label: "Resolved" },
              { key: "closed", label: "Closed" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setStatusFilter(tab.key);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  statusFilter === tab.key
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="flex gap-2" suppressHydrationWarning>
            <input
              type="text"
              placeholder="Search keyword or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
              suppressHydrationWarning
              className="w-full sm:w-64 rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
            <button
              type="submit"
              className="rounded-xl bg-zinc-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors"
            >
              Search
            </button>
          </form>
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Category:</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              suppressHydrationWarning
              className="rounded-lg border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            >
              <option value="all">All Categories</option>
              <option value="bug_report">Bug Reports</option>
              <option value="feature_request">Feature Requests</option>
              <option value="order_issue">Order Issues</option>
              <option value="service_issue">Service Issues</option>
              <option value="payment_issue">Payment Issues</option>
              <option value="ui_ux_suggestion">UI/UX Suggestions</option>
              <option value="general_feedback">General Feedback</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Priority:</label>
            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              suppressHydrationWarning
              className="rounded-lg border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="ml-auto flex items-center text-xs text-zinc-400">
            Total results: <strong className="ml-1 text-zinc-700 dark:text-zinc-300">{totalItems}</strong>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
        {loading ? (
          <div className="p-12 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Loading triage queue...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-500 dark:text-zinc-400">
            No feedback submissions matching selected criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Ref & Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Subject & Details</th>
                  <th className="py-3 px-4">Submitter</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {items.map((item) => {
                  const submitterName = item.user_full_name || item.guest_name || "Guest";
                  const submitterEmail = item.user_email || item.guest_email || "-";
                  const isRegistered = !!item.user_email;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      {/* Ref & Date */}
                      <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                        <span className="font-bold text-zinc-900 dark:text-white block">
                          #{item.id.slice(0, 8)}
                        </span>
                        <span className="text-[11px] text-zinc-400" suppressHydrationWarning>
                          {mounted
                            ? new Date(item.created_at).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                              })
                            : ""}
                        </span>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
                          <span>{getTypeIcon(item.feedback_type)}</span>
                          <span className="capitalize">{item.feedback_type.replace(/_/g, " ")}</span>
                        </div>
                      </td>

                      {/* Subject & Details */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <Link
                          href={`/admin/feedback/${item.id}`}
                          className="font-bold text-zinc-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 block truncate"
                        >
                          {item.subject}
                        </Link>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          {item.description}
                        </p>
                      </td>

                      {/* Submitter */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-zinc-900 dark:text-white">
                            {submitterName}
                          </span>
                          {!isRegistered && (
                            <span className="rounded bg-zinc-100 px-1 py-0.2 text-[9px] font-bold text-zinc-500 dark:bg-zinc-800">
                              GUEST
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-400 block font-mono">
                          {submitterEmail}
                        </span>
                      </td>

                      {/* Priority */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getPriorityBadge(item.priority)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getStatusBadge(item.status)}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <Link
                          href={`/admin/feedback/${item.id}`}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                        >
                          Triage & Manage →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-zinc-200 dark:border-zinc-800 text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
