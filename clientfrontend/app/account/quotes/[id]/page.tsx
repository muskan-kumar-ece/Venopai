'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { quotesApi, apiClient } from '@/lib/api/client';
import { StatusBadge } from '@/components/account/StatusBadge';
import { LoadingState } from '@/components/account/LoadingState';

interface LineItem {
  name: string;
  amount: string;
  quantity?: number;
  description?: string;
}

interface QuoteVersion {
  id: string;
  version_number: number;
  status: string;
  scope_summary: string;
  line_items: LineItem[];
  subtotal: string;
  tax: {
    type: string;
    amount: string;
  };
  shipping_amount: string;
  total: string;
  estimated_timeline: string;
  valid_until: string | null;
  terms: string;
  created_at: string;
}

interface QuoteDetail {
  id: string;
  request_type: string;
  request_id: string;
  project_id?: string | null;
  status: string;
  current_version: QuoteVersion;
}

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params?.id as string;

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [versions, setVersions] = useState<QuoteVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<QuoteVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Approval / rejection state
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  const loadQuoteAndVersions = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      const [quoteRes, versionsRes] = await Promise.all([
        quotesApi.getQuote(quoteId, token),
        apiClient.get(`/quotes/${quoteId}/versions`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
      ]);

      if (quoteRes?.data) {
        setQuote(quoteRes.data);
        setSelectedVersion(quoteRes.data.current_version);
      }
      if (versionsRes?.data) {
        setVersions(versionsRes.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load quote details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quoteId) {
      loadQuoteAndVersions();
    }
  }, [quoteId]);

  const handleApprove = async () => {
    if (!confirm('Are you sure you want to approve this quote? This will confirm scope and prepare payment.')) return;
    setApproving(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      await quotesApi.approveQuote(quoteId, token);
      alert('Quote approved successfully! You can now proceed to payment.');
      loadQuoteAndVersions();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to approve quote');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      await quotesApi.rejectQuote(quoteId, rejectReason, token);
      setShowRejectModal(false);
      alert('Quote rejected. The engineering manager will be notified.');
      loadQuoteAndVersions();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to reject quote');
    } finally {
      setRejecting(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading quote and version history..." />;
  }

  if (error || !quote || !selectedVersion) {
    return (
      <div className="space-y-4">
        <Link href="/account/quotes" className="text-sm font-medium text-blue-600 hover:text-blue-800">
          ← Back to Quotes
        </Link>
        <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-xl">
          {error || 'Quote not found.'}
        </div>
      </div>
    );
  }

  const isCurrent = selectedVersion.version_number === quote.current_version.version_number;
  const isExpired = selectedVersion.valid_until && new Date(selectedVersion.valid_until) < new Date();
  const canAct = isCurrent && !isExpired && (quote.status === 'sent' || quote.status === 'pending_approval');

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/account/quotes" className="hover:text-gray-900">
          Quotes
        </Link>
        <span>/</span>
        <span className="font-semibold text-gray-900">Quote #{quote.id.slice(0, 8)}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Quotation Specification</h1>
            <StatusBadge status={quote.status} />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Request Type: <span className="font-semibold capitalize text-gray-800">{quote.request_type?.replace('_', ' ')}</span>
          </p>
        </div>

        {/* Action buttons (Only available on current, non-expired version) */}
        {canAct && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowRejectModal(true)}
              className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold transition"
            >
              Request Revision / Reject
            </button>
            <button
              onClick={handleApprove}
              disabled={approving}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
            >
              {approving ? 'Approving...' : '✓ Approve Quote'}
            </button>
          </div>
        )}
      </div>

      {/* Version History Selector Tabs */}
      {versions.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-2 pr-1">Versions:</span>
          {versions.map((v) => {
            const isSelected = v.version_number === selectedVersion.version_number;
            const isLatest = v.version_number === quote.current_version.version_number;
            return (
              <button
                key={v.id}
                onClick={() => setSelectedVersion(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span>v{v.version_number}</span>
                {isLatest && <span className="text-[10px] uppercase font-bold opacity-80">(Latest)</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Inactive version banner */}
      {!isCurrent && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm flex items-center justify-between">
          <div>
            <strong>Historical Version (v{selectedVersion.version_number}):</strong> This version has been superseded by a newer quotation. You cannot approve or reject historical versions.
          </div>
          <button
            onClick={() => setSelectedVersion(quote.current_version)}
            className="text-xs font-bold underline ml-4 whitespace-nowrap"
          >
            Switch to Latest (v{quote.current_version.version_number})
          </button>
        </div>
      )}

      {isCurrent && isExpired && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">
          <strong>Quotation Expired:</strong> The validity period for this quote has elapsed. Please request a revised quote to proceed.
        </div>
      )}

      {/* Scope Summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-gray-900">Scope of Work</h2>
        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {selectedVersion.scope_summary || 'Standard engineering deliverable scope.'}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-100 text-xs">
          <div>
            <span className="text-gray-400 block uppercase font-medium">Estimated Timeline</span>
            <span className="text-gray-900 font-semibold">{selectedVersion.estimated_timeline || 'TBD'}</span>
          </div>
          <div>
            <span className="text-gray-400 block uppercase font-medium">Valid Until</span>
            <span className="text-gray-900 font-semibold">
              {selectedVersion.valid_until ? new Date(selectedVersion.valid_until).toLocaleDateString() : 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-gray-400 block uppercase font-medium">Taxation Model</span>
            <span className="text-gray-900 font-semibold">{selectedVersion.tax?.type || 'GST 18%'}</span>
          </div>
          <div>
            <span className="text-gray-400 block uppercase font-medium">Version Created</span>
            <span className="text-gray-900 font-semibold">
              {selectedVersion.created_at ? new Date(selectedVersion.created_at).toLocaleDateString() : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Itemized Pricing Table */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-base font-bold text-gray-900 mb-4">Itemized Deliverables & Pricing</h2>
        <table className="w-full text-left text-sm text-gray-700">
          <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-500 border-b border-gray-200">
            <tr>
              <th className="py-2.5 px-4">Deliverable / Component</th>
              <th className="py-2.5 px-4 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm">
            {selectedVersion.line_items?.map((item, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="py-3 px-4">
                  <div className="font-semibold text-gray-900">{item.name}</div>
                  {item.description && <div className="text-xs text-gray-500">{item.description}</div>}
                </td>
                <td className="py-3 px-4 text-right font-medium text-gray-900">
                  ₹{item.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pricing Summary Breakdown */}
        <div className="mt-6 pt-4 border-t border-gray-100 max-w-xs ml-auto space-y-2 text-xs text-gray-600">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span className="font-medium text-gray-900">₹{selectedVersion.subtotal}</span>
          </div>
          <div className="flex justify-between">
            <span>Estimated Shipping:</span>
            <span className="font-medium text-gray-900">₹{selectedVersion.shipping_amount}</span>
          </div>
          <div className="flex justify-between">
            <span>GST / Tax ({selectedVersion.tax?.type}):</span>
            <span className="font-medium text-gray-900">₹{selectedVersion.tax?.amount}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-gray-200 text-base font-bold text-gray-900">
            <span>Total Quotation:</span>
            <span>₹{selectedVersion.total}</span>
          </div>
        </div>
      </div>

      {/* Terms & Conditions */}
      {selectedVersion.terms && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-2">Terms & Deliverable Milestones</h3>
          <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{selectedVersion.terms}</p>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Request Quote Revision</h3>
            <p className="text-sm text-gray-500 mb-4">
              Please state why this quote needs revision so the engineering manager can provide an updated estimate.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-1">Feedback / Requested Changes *</label>
              <textarea
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="e.g. Budget target is ₹40,000, please optimize component selection..."
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={rejecting || !rejectReason.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                {rejecting ? 'Submitting...' : 'Submit Revision Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
