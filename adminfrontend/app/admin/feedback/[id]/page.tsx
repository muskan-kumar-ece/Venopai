"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";
import { adminFeedbackApi } from "@/lib/api/client";

interface AdminFeedbackItem {
  id: string;
  feedback_type?: string;
  priority?: string;
  status?: string;
  subject?: string;
  description?: string;
  page_url?: string;
  order_id?: string;
  screenshot_url?: string;
  browser_info?: string;
  user_email?: string;
  user_full_name?: string;
  guest_email?: string;
  guest_name?: string;
  guest_phone?: string;
  admin_notes?: string;
  admin_response?: string;
  created_at?: string;
  updated_at?: string;
  resolved_at?: string;
  resolved_by_email?: string;
  resolved_by_name?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export default function AdminFeedbackDetailPage() {
  const params = useParams();
  const feedbackId = params?.id as string;
  const { adminToken, isAuthenticated, isLoading } = useAdminAuth();

  const [mounted, setMounted] = useState(false);
  const [item, setItem] = useState<AdminFeedbackItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Form State
  const [status, setStatus] = useState<string>("open");
  const [priority, setPriority] = useState<string>("medium");
  const [adminNotes, setAdminNotes] = useState<string>("");
  const [adminResponse, setAdminResponse] = useState<string>("");
  const [updating, setUpdating] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFeedbackApi.getFeedback(feedbackId, adminToken || undefined);
      if (res?.data) {
        setItem(res.data);
        setStatus(res.data.status || "open");
        setPriority(res.data.priority || "medium");
        setAdminNotes(res.data.admin_notes || "");
        setAdminResponse(res.data.admin_response || "");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load feedback item");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (feedbackId && !isLoading && isAuthenticated && adminToken) {
      fetchDetail();
    }
  }, [feedbackId, isLoading, isAuthenticated, adminToken]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    setSuccessMsg(null);
    try {
      const res = await adminFeedbackApi.updateFeedback(
        feedbackId,
        {
          status,
          priority,
          admin_notes: adminNotes.trim(),
          admin_response: adminResponse.trim(),
        },
        adminToken || undefined
      );
      if (res?.data) {
        setItem(res.data);
        setSuccessMsg("Feedback record updated and customer notified (if resolved).");
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update feedback");
    } finally {
      setUpdating(false);
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
          You must be signed in as an administrator or support staff to inspect this feedback record.
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

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Loading feedback record #{feedbackId?.slice(0, 8)}...
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/feedback"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-500"
        >
          ← Back to Feedback Triage
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          {error || "Report not found."}
        </div>
      </div>
    );
  }

  const submitterName = item.user_full_name || item.guest_name || "Guest";
  const submitterEmail = item.user_email || item.guest_email || "-";
  const isRegistered = !!item.user_email;

  return (
    <div className="space-y-6">
      {/* Top back nav */}
      <div>
        <Link
          href="/admin/feedback"
          className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
        >
          ← Back to All Feedback
        </Link>
      </div>

      {/* Main Grid: Left Details, Right Management Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Submission Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-zinc-500 dark:text-zinc-400">
                  TICKET #{item.id?.slice(0, 8)}
                </span>
                <span className="text-zinc-300 dark:text-zinc-700">&bull;</span>
                <span className="text-xs font-semibold uppercase text-zinc-700 dark:text-zinc-300">
                  {item.feedback_type?.replace(/_/g, " ")}
                </span>
              </div>
              <span className="text-xs text-zinc-400 font-mono" suppressHydrationWarning>
                {mounted && item.created_at ? new Date(item.created_at).toLocaleString("en-IN") : ""}
              </span>
            </div>

            <h1 className="mt-4 text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {item.subject}
            </h1>

            <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 p-4 font-mono text-xs text-zinc-800 leading-relaxed dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-200 whitespace-pre-line">
              {item.description}
            </div>

            {/* Contextual Properties Grid */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {item.page_url && (
                <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950/40">
                  <span className="text-[11px] font-bold text-zinc-400 block uppercase">
                    Page / Affected URL
                  </span>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200 break-all">
                    {item.page_url}
                  </span>
                </div>
              )}

              {item.order_id && (
                <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950/40">
                  <span className="text-[11px] font-bold text-zinc-400 block uppercase">
                    Linked Order
                  </span>
                  <Link
                    href={`/admin/orders`}
                    className="font-mono text-emerald-600 dark:text-emerald-400 hover:underline font-bold"
                  >
                    Order #{item.order_id.slice(0, 8)} ↗
                  </Link>
                </div>
              )}

              {item.screenshot_url && (
                <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950/40 sm:col-span-2">
                  <span className="text-[11px] font-bold text-zinc-400 block uppercase">
                    Screenshot / Diagnostic URL
                  </span>
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

              {item.browser_info && (
                <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950/40 sm:col-span-2">
                  <span className="text-[11px] font-bold text-zinc-400 block uppercase">
                    User-Agent / Device
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 break-all">
                    {item.browser_info}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Submitter Customer 360 Card */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Submitter Profile
            </h3>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-zinc-700 dark:text-zinc-200">
                  {submitterName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-zinc-900 dark:text-white text-sm">
                      {submitterName}
                    </p>
                    {!isRegistered && (
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500 dark:bg-zinc-800">
                        ANONYMOUS GUEST
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                    {submitterEmail}
                  </p>
                </div>
              </div>

              {isRegistered && (
                <Link
                  href="/admin/customers"
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                >
                  Customer 360 →
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Triage & Action Panel */}
        <div>
          <form
            onSubmit={handleUpdate}
            suppressHydrationWarning
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-5 sticky top-6"
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white border-b border-zinc-100 dark:border-zinc-800 pb-3">
              Operational Triage
            </h3>

            {/* Status Select */}
            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                Workflow Status *
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                suppressHydrationWarning
                className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                <option value="open">Open (Needs Review)</option>
                <option value="under_review">Under Review / Investigating</option>
                <option value="resolved">Resolved (Fix Deployed / Addressed)</option>
                <option value="closed">Closed</option>
                <option value="wont_fix">Won&apos;t Fix / By Design</option>
              </select>
            </div>

            {/* Priority Select */}
            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                Triage Priority *
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                suppressHydrationWarning
                className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                <option value="critical">Critical (Payments, Outages)</option>
                <option value="high">High (Broken Flows, UI Bugs)</option>
                <option value="medium">Medium (Minor Glitches, Queries)</option>
                <option value="low">Low (Cosmetic, Feature Wishlist)</option>
              </select>
            </div>

            {/* Internal Staff Notes */}
            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                Internal Admin Notes (Staff Only)
              </label>
              <textarea
                rows={3}
                placeholder="Log internal developer tickets, git commits, or root cause analysis..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                autoComplete="off"
                suppressHydrationWarning
                className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <span className="text-[10px] text-zinc-400 mt-1 block">
                * Visible only to engineers and staff in audit logs.
              </span>
            </div>

            {/* Public Engineering Response */}
            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                Customer Facing Response
              </label>
              <textarea
                rows={4}
                placeholder="Message that the customer will see on their dashboard and resolution email..."
                value={adminResponse}
                onChange={(e) => setAdminResponse(e.target.value)}
                autoComplete="off"
                suppressHydrationWarning
                className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <span className="text-[10px] text-zinc-400 mt-1 block">
                * When status is Resolved, this triggers an automatic notification email.
              </span>
            </div>

            {/* Resolution Audit Info if resolved */}
            {item.resolved_at && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-400">
                <span className="font-bold block">Resolved On:</span>
                <span className="font-mono text-[11px]" suppressHydrationWarning>
                  {mounted && item.resolved_at ? new Date(item.resolved_at).toLocaleString("en-IN") : ""}
                </span>
                {item.resolved_by_name && (
                  <span className="block text-[11px] mt-0.5">By: {item.resolved_by_name}</span>
                )}
              </div>
            )}

            {/* Feedback alert */}
            {successMsg && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                ✓ {successMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={updating}
              className="w-full rounded-xl bg-zinc-900 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-zinc-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors cursor-pointer"
            >
              {updating ? "Updating..." : "Save Triage Changes"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
