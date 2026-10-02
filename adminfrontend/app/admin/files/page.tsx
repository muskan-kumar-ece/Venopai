"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { adminFilesApi } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

interface ProjectFileItem {
  id: string;
  filename: string;
  content_type?: string;
  size_bytes: number;
  scan_status: string;
  source: string;
  association_type?: string;
  association_id?: string;
  created_at: string;
}

export default function AdminFilesPage() {
  const { hasRole, isAuthenticated } = useAdminAuth();
  const isAllowed = hasRole(["SUPER_ADMIN", "MANUFACTURING_MANAGER", "ORDER_MANAGER", "SUPPORT_EXECUTIVE"]);

  const [files, setFiles] = useState<ProjectFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanStatusFilter, setScanStatusFilter] = useState<string>("");
  const [associationFilter, setAssociationFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFilesApi.listFiles({
        scan_status: scanStatusFilter || undefined,
        association_type: associationFilter || undefined,
        search: search || undefined,
        page_size: 50,
      });
      if (res?.data) {
        setFiles(res.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load project files");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && isAllowed) {
      loadFiles();
    }
  }, [isAuthenticated, isAllowed, scanStatusFilter, associationFilter]);

  const handleDownload = async (file: ProjectFileItem) => {
    if (file.scan_status === "flagged") {
      setFeedback({
        type: "error",
        message: `Security Warning: File "${file.filename}" was flagged by malware scan and cannot be downloaded directly.`,
      });
      return;
    }
    setDownloadingId(file.id);
    setFeedback(null);
    try {
      const res = await adminFilesApi.getDownloadUrl(file.id);
      if (res?.data?.download_url) {
        window.open(res.data.download_url, "_blank");
      } else {
        setFeedback({ type: "error", message: "Download URL could not be generated." });
      }
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to generate download URL",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  if (!isAllowed) {
    return (
      <div className="p-8 text-center text-red-400">
        Access Restricted: Cross-request file inspection requires operations administrative credentials.
      </div>
    );
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getScanBadge = (status: string) => {
    const s = status.toLowerCase();
    switch (s) {
      case "clean":
        return <span className="rounded-full bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 flex items-center gap-1 w-fit">✓ Clean</span>;
      case "pending":
        return <span className="rounded-full bg-amber-950/80 border border-amber-800 px-2 py-0.5 text-[10px] font-semibold text-amber-400 flex items-center gap-1 w-fit">⏳ Scanning</span>;
      case "flagged":
        return <span className="rounded-full bg-red-950/80 border border-red-800 px-2 py-0.5 text-[10px] font-semibold text-red-400 flex items-center gap-1 w-fit">⚠ Flagged</span>;
      default:
        return <span className="rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">{status}</span>;
    }
  };

  const getRequestLink = (file: ProjectFileItem) => {
    if (!file.association_id || !file.association_type) return null;
    const type = file.association_type.toLowerCase();
    if (type === "manufacturing") return `/admin/manufacturing/${file.association_id}`;
    if (type === "design") return `/admin/design/${file.association_id}`;
    if (type === "software") return `/admin/software/${file.association_id}`;
    if (type === "consultation") return `/admin/consultations/${file.association_id}`;
    return null;
  };

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase text-cyan-400">
            <span>Asset Management</span>
            <span>&bull;</span>
            <span>Project Files Library</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
            Engineering Files & Deliverables
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Cross-request file audit, Gerber/CAD archives, malware scan verification, and signed delivery URLs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadFiles}
            className="rounded-lg bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-700 transition"
          >
            Refresh Files
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border p-4 text-xs font-medium flex items-center justify-between ${
            feedback.type === "success"
              ? "border-emerald-800 bg-emerald-950/60 text-emerald-300"
              : "border-red-800 bg-red-950/60 text-red-300"
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-zinc-400 hover:text-white ml-4">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={scanStatusFilter}
            onChange={(e) => setScanStatusFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
          >
            <option value="">All Scan Statuses</option>
            <option value="clean">Clean (Safe)</option>
            <option value="pending">Pending Scan</option>
            <option value="flagged">Flagged (Quarantined)</option>
          </select>

          <select
            value={associationFilter}
            onChange={(e) => setAssociationFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
          >
            <option value="">All Service Associations</option>
            <option value="manufacturing">Manufacturing (Gerber/CAD)</option>
            <option value="design">PCB Design</option>
            <option value="software">Software / Firmware</option>
            <option value="consultation">Consultation Docs</option>
          </select>
        </div>

        <div className="text-xs text-zinc-500 font-mono">
          Total Files: <strong className="text-zinc-300">{files.length}</strong>
        </div>
      </div>

      {/* Files Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-xs font-mono text-zinc-400 animate-pulse">
            Scanning cross-request file storage...
          </div>
        ) : files.length === 0 ? (
          <div className="p-16 text-center text-zinc-500 text-xs">
            No files found matching criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] font-mono uppercase text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Filename / Type</th>
                  <th className="px-4 py-3">Association</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Security Scan</th>
                  <th className="px-4 py-3 text-right">Size</th>
                  <th className="px-4 py-3">Uploaded</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {files.map((file) => {
                  const reqLink = getRequestLink(file);
                  const isFlagged = file.scan_status === "flagged";

                  return (
                    <tr key={file.id} className="hover:bg-zinc-850/50 transition">
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-white flex items-center gap-2">
                          <span className="text-sm">📄</span>
                          <span className="truncate max-w-xs">{file.filename}</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                          {file.content_type || "application/octet-stream"}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="capitalize font-semibold text-zinc-300">
                          {file.association_type || "Unlinked"}
                        </span>
                        {reqLink && (
                          <div className="text-[11px] mt-0.5">
                            <Link href={reqLink} className="font-mono text-cyan-400 hover:underline">
                              Req: {file.association_id?.slice(0, 8)} →
                            </Link>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-mono text-zinc-300">
                          {file.source === "customer_upload" ? "Customer Upload" : "Team Deliverable"}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        {getScanBadge(file.scan_status)}
                      </td>

                      <td className="px-4 py-3.5 text-right font-mono text-zinc-300">
                        {formatFileSize(file.size_bytes)}
                      </td>

                      <td className="px-4 py-3.5 text-zinc-500 text-[11px]">
                        {new Date(file.created_at).toLocaleDateString()}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <button
                          disabled={downloadingId === file.id || isFlagged}
                          onClick={() => handleDownload(file)}
                          className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                            isFlagged
                              ? "bg-zinc-800/50 text-zinc-500 cursor-not-allowed"
                              : "bg-cyan-950/80 text-cyan-300 border border-cyan-800 hover:bg-cyan-900/60"
                          }`}
                        >
                          {downloadingId === file.id
                            ? "Fetching..."
                            : isFlagged
                            ? "Quarantined"
                            : "Download ↓"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
