'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { consultationsApi } from '@/lib/api/client';
import { StatusBadge } from '@/components/account/StatusBadge';
import { LoadingState } from '@/components/account/LoadingState';
import { EmptyState } from '@/components/account/EmptyState';

interface ConsultationRequest {
  id: string;
  topic: string;
  description: string;
  status: string;
  created_at: string;
}

export default function AccountConsultationsPage() {
  const [requests, setRequests] = useState<ConsultationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRequests() {
      setLoading(true);
      setError(null);
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
        const res = await consultationsApi.listRequests({ page_size: 50 }, token);
        if (res?.data) {
          setRequests(res.data);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load consultation inquiries');
      } finally {
        setLoading(false);
      }
    }
    loadRequests();
  }, []);

  if (loading) {
    return <LoadingState message="Loading engineering consultations..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Engineering Consultations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Direct advisory sessions with senior hardware architects on component selection, power optimization, and EMI compliance.
          </p>
        </div>
        <Link
          href="/consultations/request"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
        >
          + Book Consultation
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {requests.length === 0 ? (
        <EmptyState
          title="No consultation inquiries"
          message="Need expert hardware advice or technical architecture review? Submit a consultation request to connect with our senior engineers."
          actionLabel="Request Consultation"
          actionHref="/consultations/request"
          icon="💬"
        />
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <div
              key={r.id}
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:border-gray-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-900 text-base">{r.topic}</span>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-xs text-gray-600 line-clamp-1 max-w-xl">{r.description}</p>
                <div className="text-xs text-gray-400">
                  Submitted: {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href={`/consultations/${r.id}`}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
                >
                  View Discussion →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
