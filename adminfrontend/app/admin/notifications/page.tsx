"use client";

import React, { useEffect, useState } from "react";
import { adminNotificationsApi } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

interface NotificationItem {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  status: string;
  retry_count?: number;
  failure_reason?: string;
  sent_at?: string;
  created_at: string;
}

export default function AdminNotificationsPage() {
  const { hasRole, isAuthenticated } = useAdminAuth();
  const isAllowed = hasRole(["SUPER_ADMIN", "SUPPORT_EXECUTIVE", "ORDER_MANAGER"]);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchNotifications = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminNotificationsApi.listNotifications({
        page,
        page_size: 50,
      });
      if (res?.data) {
        setNotifications(res.data);
      } else if (Array.isArray(res)) {
        setNotifications(res);
      } else {
        setNotifications([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load notification logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && isAllowed) {
      fetchNotifications();
    }
  }, [isAuthenticated, isAllowed, page]);

  if (!isAllowed) {
    return (
      <div className="p-8 text-center text-red-400">
        Access Restricted: Notification dispatch requires SUPER_ADMIN, SUPPORT_EXECUTIVE, or ORDER_MANAGER role.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Notification Dispatch & Delivery Logs
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            Monitoring asynchronous email delivery, Celery worker dispatch, and retry backoff states.
          </p>
        </div>

        <button
          onClick={fetchNotifications}
          className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
        >
          Refresh Logs
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        {loading ? (
          <div className="p-8 text-center text-xs text-zinc-500">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-500">No dispatched notifications recorded.</div>
        ) : (
          <table className="min-w-full divide-y divide-zinc-800 text-left text-xs">
            <thead className="bg-zinc-950/50">
              <tr>
                <th className="px-6 py-3 font-semibold text-zinc-400">Event / Title</th>
                <th className="px-6 py-3 font-semibold text-zinc-400">Status</th>
                <th className="px-6 py-3 font-semibold text-zinc-400">Retries</th>
                <th className="px-6 py-3 font-semibold text-zinc-400">Dispatched At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {notifications.map((n) => (
                <tr key={n.id} className="hover:bg-zinc-800/40">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-white">{n.title}</div>
                    <div className="text-[11px] text-zinc-400 truncate max-w-md">{n.message}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      n.status === "sent"
                        ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800"
                        : n.status === "failed"
                        ? "bg-red-950/60 text-red-400 border border-red-800"
                        : "bg-amber-950/60 text-amber-400 border border-amber-800"
                    }`}>
                      {n.status}
                    </span>
                    {n.failure_reason && (
                      <p className="mt-1 text-[10px] text-red-400">{n.failure_reason}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono text-zinc-400">
                    {n.retry_count ?? 0}
                  </td>
                  <td className="px-6 py-4 font-mono text-zinc-500">
                    {n.sent_at ? new Date(n.sent_at).toLocaleString() : new Date(n.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page <= 1 || loading}
          className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
        >
          &larr; Previous
        </button>
        <span className="text-xs text-zinc-500">Page {page}</span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={notifications.length < 50 || loading}
          className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}
