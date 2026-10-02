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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Engineering Quotes</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Review itemized quotations for your manufacturing, electronics design, and software development requests.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded-2xl text-xs font-medium">
          {error}
        </div>
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
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800 gap-2">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-zinc-900 dark:text-white text-base">Quote #{q.id.slice(0, 8)}</span>
                    <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 capitalize bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
                      {q.request_type?.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                    Created on {q.created_at ? new Date(q.created_at).toLocaleDateString() : 'N/A'}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                    Version v{q.current_version?.version_number || 1}
                  </span>
                  <StatusBadge status={q.status} />
                </div>
              </div>

              <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  {q.current_version?.estimated_timeline && (
                    <div>
                      Timeline:{' '}
                      <span className="font-semibold text-zinc-900 dark:text-white">
                        {q.current_version.estimated_timeline}
                      </span>
                    </div>
                  )}
                  {q.current_version?.valid_until && (
                    <div>
                      Valid Until:{' '}
                      <span className="font-semibold text-zinc-900 dark:text-white">
                        {new Date(q.current_version.valid_until).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 block">Total Quotation</span>
                  <span className="text-xl font-bold font-mono text-zinc-900 dark:text-white">
                    ₹{q.current_version?.total || '0.00'}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">ID: {q.id}</span>
                <Link
                  href={`/account/quotes/${q.id}`}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow-xs cursor-pointer"
                >
                  Review Quote & Line Items &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
