'use client';

import React, { useEffect, useState } from 'react';
import { notificationsApi } from '@/lib/api/client';
import { LoadingState } from '@/components/account/LoadingState';
import { EmptyState } from '@/components/account/EmptyState';

interface NotificationLog {
  id: string;
  title: string;
  message: string;
  created_at: string;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationLog[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      const res = await notificationsApi.listNotifications({ page: p, page_size: 15 }, token);
      if (res?.data) {
        setNotifications(res.data);
      }
      if (res?.pagination) {
        setTotalPages(res.pagination.total_pages || 1);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications(page);
  }, [page]);

  if (loading && notifications.length === 0) {
    return <LoadingState message="Loading notification send-history log..." />;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Notification History (Audit Log)</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          Historical record of automated email notifications dispatched regarding quotes, payments, manufacturing updates, and shipments.
        </p>
      </div>

      <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed font-medium">
        <strong>Information Note:</strong> In VenopAI V1, notifications are delivered to your verified email address. This view provides an immutable send-history log for transactional transparency.
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded-2xl text-xs font-medium">
          {error}
        </div>
      )}

      {notifications.length === 0 ? (
        <EmptyState
          title="No notification history"
          message="Automated event logs will appear here once transactional events (quotes, orders, shipments) occur on your account."
          icon="🔔"
        />
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
          {notifications.map((notif) => (
            <div key={notif.id} className="p-5 flex items-start justify-between gap-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-zinc-900 dark:text-white">{notif.title}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    Dispatched via Email
                  </span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{notif.message}</p>
              </div>
              <div className="text-[11px] text-zinc-400 dark:text-zinc-500 whitespace-nowrap pt-0.5 font-mono">
                {notif.created_at ? new Date(notif.created_at).toLocaleString() : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3.5 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            &larr; Previous
          </button>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3.5 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            Next &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
