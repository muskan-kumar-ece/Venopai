'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { softwareApi, getCustomerToken } from "@/lib/api/client";
import { StatusBadge } from '@/components/account/StatusBadge';
import { LoadingState } from '@/components/account/LoadingState';
import { EmptyState } from '@/components/account/EmptyState';

interface SoftwareRequest {
  id: string;
  scope_type?: string;
  title?: string;
  target_mcu?: string;
  status: string;
  created_at: string;
}

export default function AccountSoftwarePage() {
  const [requests, setRequests] = useState<SoftwareRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRequests() {
      setLoading(true);
      setError(null);
      try {
        const token = getCustomerToken() || undefined;
        const res = await softwareApi.listRequests({ page_size: 50 }, token);
        if (res?.data) {
          setRequests(res.data);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load firmware requests');
      } finally {
        setLoading(false);
      }
    }
    loadRequests();
  }, []);

  if (loading) {
    return <LoadingState message="Loading software & firmware requests..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Software & Firmware Requests</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Track embedded C/C++ development, board bring-up, RTOS driver integrations, and edge AI deployments.
          </p>
        </div>
        <Link
          href="/software/request"
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer self-start sm:self-auto"
        >
          + Request Software
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded-2xl text-xs font-medium">
          {error}
        </div>
      )}

      {requests.length === 0 ? (
        <EmptyState
          title="No firmware requests"
          message="Need custom bootloader development, BLE/WiFi IoT firmware, or STM32/ESP32 peripheral drivers? Submit an engineering request."
          actionLabel="Submit Software Request"
          actionHref="/software/request"
          icon="💻"
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
                  <span className="font-bold text-zinc-900 dark:text-white text-base">{r.title || `Software #${r.id.slice(0, 8)}`}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 space-x-3">
                  <span>Scope: <strong className="text-zinc-800 dark:text-zinc-200 capitalize">{r.scope_type || 'Embedded Firmware'}</strong></span>
                  {r.target_mcu && <span>Target: <strong className="text-zinc-800 dark:text-zinc-200">{r.target_mcu}</strong></span>}
                  <span>Submitted: {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href={`/software/requests/${r.id}`}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow-xs cursor-pointer"
                >
                  View Firmware Details &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
