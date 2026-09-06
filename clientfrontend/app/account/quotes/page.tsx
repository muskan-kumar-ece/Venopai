'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { quotesApi } from '@/lib/api/client';
import { StatusBadge } from '@/components/account/StatusBadge';
import { LoadingState } from '@/components/account/LoadingState';
import { EmptyState } from '@/components/account/EmptyState';

interface QuoteItem {
  id: string;
  request_type: string;
  request_id: string;
  status: string;
  current_version?: {
    version_number: number;
    total: string;
    valid_until?: string | null;
    estimated_timeline?: string | null;
  };
  created_at: string;
}

export default function QuotesListPage() {
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadQuotes() {
      setLoading(true);
      setError(null);
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
        const res = await quotesApi.listQuotes(token);
        if (res?.data) {
          setQuotes(res.data);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load quotes');
      } finally {
        setLoading(false);
      }
    }
    loadQuotes();
  }, []);

  if (loading) {
    return <LoadingState message="Loading engineering quotes..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Engineering Quotes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review itemized quotations for your manufacturing, electronics design, and software development requests.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {quotes.length === 0 ? (
        <EmptyState
          title="No quotes available"
          message="Once an engineering manager reviews your service request, an official quotation with pricing and timelines will appear here."
          icon="📄"
        />
      ) : (
        <div className="space-y-4">
          {quotes.map((q) => (
            <div
              key={q.id}
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:border-gray-300 transition"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 gap-2">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-gray-900 text-base">Quote #{q.id.slice(0, 8)}</span>
                    <span className="text-xs text-gray-500 capitalize bg-gray-100 px-2 py-0.5 rounded">
                      {q.request_type?.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    Created on {q.created_at ? new Date(q.created_at).toLocaleDateString() : 'N/A'}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 font-medium">
                    Version v{q.current_version?.version_number || 1}
                  </span>
                  <StatusBadge status={q.status} />
                </div>
              </div>

              <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 text-xs text-gray-600">
                  {q.current_version?.estimated_timeline && (
                    <div>
                      Timeline: <span className="font-semibold text-gray-900">{q.current_version.estimated_timeline}</span>
                    </div>
                  )}
                  {q.current_version?.valid_until && (
                    <div>
                      Valid Until: <span className="font-semibold text-gray-900">{new Date(q.current_version.valid_until).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-xs text-gray-500 block">Total Quotation</span>
                  <span className="text-xl font-bold text-gray-900">₹{q.current_version?.total || '0.00'}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400 font-mono">ID: {q.id}</span>
                <Link
                  href={`/account/quotes/${q.id}`}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
                >
                  Review Quote & Line Items →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
