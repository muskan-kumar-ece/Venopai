'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { paymentsApi } from '@/lib/api/client';
import { StatusBadge } from '@/components/account/StatusBadge';
import { LoadingState } from '@/components/account/LoadingState';
import { EmptyState } from '@/components/account/EmptyState';

interface Payment {
  id: string;
  source_type: string;
  source_id: string;
  amount: string;
  currency: string;
  status: string;
  method?: string | null;
  created_at: string;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPayments() {
      setLoading(true);
      setError(null);
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
        const res = await paymentsApi.listPayments({ page_size: 50 }, token);
        if (res?.data) {
          setPayments(res.data);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load payments history');
      } finally {
        setLoading(false);
      }
    }
    loadPayments();
  }, []);

  if (loading) {
    return <LoadingState message="Loading payments & transaction history..." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payments & Invoices</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review your transaction receipts, Razorpay payment confirmations, and linked invoices for orders and engineering quotes.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {payments.length === 0 ? (
        <EmptyState
          title="No payment records found"
          message="Payments will appear here when you checkout or approve an engineering quotation."
          icon="💳"
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3">Transaction Date</th>
                  <th className="px-6 py-3">Linked Service / Order</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Payment Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-900">
                      {p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-xs font-semibold text-gray-900 capitalize">
                        {p.source_type?.replace('_', ' ')}
                      </div>
                      <div className="text-xs text-gray-400 font-mono truncate max-w-xs">{p.source_id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                      ₹{p.amount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                      {p.source_type === 'order' ? (
                        <Link
                          href={`/account/orders/${p.source_id}`}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View Order & Invoice →
                        </Link>
                      ) : (
                        <Link
                          href={`/account/quotes/${p.source_id}`}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View Quote →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
