"use client";

import React, { useEffect, useState } from "react";
import { adminAuditApi } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

interface AuditLogEntry {
  id: string;
  admin_id?: string;
  admin_email?: string;
  action: string;
  target_type: string;
  target_id?: string;
  details?: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

export default function AdminAuditLogsPage() {
  const { hasRole, isAuthenticated } = useAdminAuth();
  const isAllowed = hasRole(["SUPER_ADMIN"]);

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminAuditApi.listAuditLogs({
        page,
        page_size: 50,
      });
      if (res?.data) {
        setLogs(res.data);
      } else if (Array.isArray(res)) {
        setLogs(res);
      } else {
        setLogs([]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && isAllowed) {
      fetchLogs();
    }
  }, [isAuthenticated, isAllowed, page]);

  if (!isAllowed) {
    return (
      <div className="p-8 text-center text-red-400">
        Access Restricted: System audit trail requires SUPER_ADMIN privileges.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Platform Audit Trail
        </h1>
        <p className="mt-1 text-xs text-zinc-400">
          Immutable event log of administrative actions, status transitions, quote issuances, and user moderations.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Logs Table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        {loading ? (
          <div className="p-8 text-center text-xs text-zinc-500">Loading audit trail...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-500">No audit records recorded yet.</div>
        ) : (
          <table className="min-w-full divide-y divide-zinc-800 text-left text-xs">
            <thead className="bg-zinc-950/50">
              <tr>
                <th className="px-6 py-3 font-semibold text-zinc-400">Timestamp</th>
                <th className="px-6 py-3 font-semibold text-zinc-400">Admin Actor</th>
                <th className="px-6 py-3 font-semibold text-zinc-400">Action</th>
                <th className="px-6 py-3 font-semibold text-zinc-400">Target Entity</th>
                <th className="px-6 py-3 font-semibold text-zinc-400">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-zinc-800/40">
                  <td className="px-6 py-4 font-mono text-zinc-400 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 font-mono text-white">
                    {log.admin_email || log.admin_id || "System Worker"}
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono font-bold text-emerald-400">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-semibold text-zinc-300">{log.target_type}</span>
                    {log.target_id && (
                      <span className="ml-1.5 font-mono text-[11px] text-zinc-500">
                        ({log.target_id.slice(0, 8)})
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono text-zinc-500">
                    {log.ip_address || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page <= 1 || loading}
          className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
        >
          &larr; Previous
        </button>
        <span className="text-xs text-zinc-500">Page {page}</span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={logs.length < 50 || loading}
          className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}
