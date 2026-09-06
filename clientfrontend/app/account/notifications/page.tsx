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
        <h1 className="text-2xl font-bold text-gray-900">Notification History (Audit Log)</h1>
        <p className="text-sm text-gray-500 mt-1">
          Historical record of automated email notifications dispatched regarding quotes, payments, manufacturing updates, and shipments.
        </p>
      </div>

      <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 leading-relaxed">
        <strong>Information Note:</strong> In VenopAI V1, notifications are delivered to your verified email address. This view provides an immutable send-history log for transactional transparency.
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {notifications.length === 0 ? (
        <EmptyState
          title="No notification history"
          message="Automated event logs will appear here once transactional events (quotes, orders, shipments) occur on your account."
          icon="🔔"
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">
          {notifications.map((notif) => (
            <div key={notif.id} className="p-5 flex items-start justify-between gap-4 hover:bg-gray-50 transition">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">{notif.title}</span>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                    Dispatched via Email
                  </span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{notif.message}</p>
              </div>
              <div className="text-xs text-gray-400 whitespace-nowrap pt-0.5">
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
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 disabled:opacity-40 hover:bg-gray-50"
          >
            ← Previous
          </button>
          <span className="text-xs text-gray-500 font-medium">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 disabled:opacity-40 hover:bg-gray-50"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
