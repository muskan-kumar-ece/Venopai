'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { manufacturingApi, getCustomerToken } from "@/lib/api/client";
import { StatusBadge } from '@/components/account/StatusBadge';
import { LoadingState } from '@/components/account/LoadingState';
import { EmptyState } from '@/components/account/EmptyState';

interface ManufacturingRequest {
  id: string;
  service_type?: string;
  quantity?: number;
  status: string;
  created_at: string;
  notes?: string;
}

export default function AccountManufacturingPage() {
  const [requests, setRequests] = useState<ManufacturingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRequests() {
      setLoading(true);
      setError(null);
      try {
        const token = getCustomerToken() || undefined;
        const res = await manufacturingApi.listRequests({ page_size: 50 }, token);
        if (res?.data) {
          setRequests(res.data);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load manufacturing requests');
      } finally {
        setLoading(false);
      }
    }
    loadRequests();
  }, []);

  if (loading) {
    return <LoadingState message="Loading manufacturing requests..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Manufacturing Requests</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Track your custom PCB fabrication, CNC machining, 3D printing, and sheet metal fabrication jobs.
          </p>
        </div>
        <Link
          href="/manufacturing/request"
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer self-start sm:self-auto"
        >
          + Request Manufacturing
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded-2xl text-xs font-medium">
          {error}
        </div>
      )}

      {requests.length === 0 ? (
        <EmptyState
          title="No manufacturing requests"
          message="Submit Gerber files, CAD models, or engineering BOMs to receive fabrication quotes and lead times."
          actionLabel="Submit Request"
          actionHref="/manufacturing/request"
          icon="🏭"
        />
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <div
              key={r.id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-zinc-900 dark:text-white text-base">Request #{r.id.slice(0, 8)}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 space-x-3">
                  <span>
                    Type:{' '}
                    <strong className="text-zinc-800 dark:text-zinc-200 capitalize">
                      {r.service_type || 'PCB Fabrication'}
                    </strong>
                  </span>
                  {r.quantity && (
                    <span>
                      Qty: <strong className="text-zinc-800 dark:text-zinc-200">{r.quantity}</strong>
                    </span>
                  )}
                  <span>Submitted: {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href={`/manufacturing/requests/${r.id}`}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow-xs cursor-pointer"
                >
                  View Request Details &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
