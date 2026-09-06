'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { designApi } from '@/lib/api/client';
import { StatusBadge } from '@/components/account/StatusBadge';
import { LoadingState } from '@/components/account/LoadingState';
import { EmptyState } from '@/components/account/EmptyState';

interface DesignRequest {
  id: string;
  scope_type?: string;
  title?: string;
  status: string;
  created_at: string;
}

export default function AccountDesignPage() {
  const [requests, setRequests] = useState<DesignRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRequests() {
      setLoading(true);
      setError(null);
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
        const res = await designApi.listRequests({ page_size: 50 }, token);
        if (res?.data) {
          setRequests(res.data);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load design requests');
      } finally {
        setLoading(false);
      }
    }
    loadRequests();
  }, []);

  if (loading) {
    return <LoadingState message="Loading electronics design requests..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Electronics Design Requests</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your custom hardware design specifications, schematics creation, and PCB layout projects.
          </p>
        </div>
        <Link
          href="/design/request"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
        >
          + Request Design
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {requests.length === 0 ? (
        <EmptyState
          title="No design requests"
          message="Need a custom circuit schematic, multilayer PCB layout, or component selection review? Request engineering assistance."
          actionLabel="Submit Design Request"
          actionHref="/design/request"
          icon="🔧"
        />
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <div
              key={r.id}
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:border-gray-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-900 text-base">{r.title || `Design #${r.id.slice(0, 8)}`}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-xs text-gray-500 mt-1 space-x-3">
                  <span>Scope: <strong className="text-gray-700 capitalize">{r.scope_type || 'Full Circuit Design'}</strong></span>
                  <span>Submitted: {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href={`/design/requests/${r.id}`}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
                >
                  View Design Details →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
