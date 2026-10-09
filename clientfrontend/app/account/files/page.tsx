"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { filesApi, getCustomerToken } from "@/lib/api/client";

interface UploadedFile {
  id: string;
  file_name: string;
  filename?: string;
  file_size?: number;
  size_bytes?: number;
  content_type?: string;
  scan_status?: string;
  association_type?: string;
  association_id?: string;
  source?: string;
  created_at?: string;
  url?: string;
}

export default function CustomerFilesPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchFiles = async (tab: string = activeTab) => {
    setLoading(true);
    setError(null);
    try {
      const token = getCustomerToken() || undefined;
      const res = await filesApi.listFiles(
        {
          association_type: tab === "all" ? undefined : tab,
        },
        token
      );
      if (res?.data) {
        setFiles(res.data);
      } else {
        setFiles([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load files from engineering vault.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles(activeTab);
  }, [activeTab]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", fileList[0]);
      formData.append("association_type", activeTab === "all" ? "manufacturing" : activeTab);
      const res = await filesApi.uploadFile(formData);
      if (res?.data) {
        setFiles((prev) => [res.data, ...prev]);
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm("Are you sure you want to delete this file from your vault?")) return;
    try {
      await filesApi.deleteFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete file");
    }
  };

  const handleDownload = async (fileId: string) => {
    setDownloadingId(fileId);
    setError(null);
    try {
      const res = await filesApi.getDownloadUrl(fileId);
      const url = res?.data?.download_url || res?.download_url;
      if (url) {
        window.open(url, "_blank");
      } else {
        setError("Download URL unavailable or file still scanning.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not generate secure download link.");
    } finally {
      setDownloadingId(null);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const getFileBadge = (filename?: string) => {
    const name = (filename || "").toLowerCase();
    if (name.endsWith(".step") || name.endsWith(".stp") || name.endsWith(".stl")) {
      return { label: "3D CAD", color: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-400 dark:border-cyan-800" };
    }
    if (name.endsWith(".zip") || name.endsWith(".gerber") || name.endsWith(".gbr") || name.endsWith(".drl")) {
      return { label: "PCB FAB", color: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-400 dark:border-purple-800" };
    }
    if (name.endsWith(".hex") || name.endsWith(".bin") || name.endsWith(".elf") || name.endsWith(".c") || name.endsWith(".py")) {
      return { label: "FIRMWARE", color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800" };
    }
    if (name.endsWith(".pdf") || name.endsWith(".doc") || name.endsWith(".docx")) {
      return { label: "DOC / SPEC", color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800" };
    }
    if (name.endsWith(".csv") || name.endsWith(".xlsx")) {
      return { label: "BOM SHEET", color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800" };
    }
    return { label: "FILE", color: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700" };
  };

  const filteredFiles = files.filter((f) => {
    const name = f.file_name || f.filename || "";
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 dark:bg-red-950/40 dark:border-red-900/50 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 mb-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Encrypted Asset Vault
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Engineering File Library
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Secure private storage of your CAD models, Gerber fabrication archives, BOM spreadsheets, and firmware binaries.
          </p>
        </div>

        {/* Upload Button */}
        <div>
          <label className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer transition-colors">
            {uploading ? (
              <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            )}
            <span>{uploading ? "Uploading..." : "Upload CAD / Gerber / Spec"}</span>
            <input
              type="file"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {uploadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-400">
          {uploadError}
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "all", label: "All Files" },
            { id: "manufacturing", label: "Manufacturing CAD" },
            { id: "design", label: "PCB Design" },
            { id: "software", label: "Firmware / Code" },
            { id: "consultation", label: "Consultation" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? "bg-zinc-900 text-white dark:bg-emerald-600 dark:text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search by filename..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-64 rounded-xl border border-zinc-300 bg-white pl-9 pr-3 py-1.5 text-xs text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-850 dark:text-white"
          />
          <svg className="absolute left-3 top-2 h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* File Table / Loading / Empty */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {loading ? (
          <div className="p-12 text-center">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="mt-3 text-xs text-zinc-400 font-mono">Syncing file vault...</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
              <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-zinc-900 dark:text-white">
              {searchTerm ? "No matching files" : "No files in this section"}
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
              {searchTerm
                ? `No engineering assets matched "${searchTerm}".`
                : "Files uploaded during your custom manufacturing, PCB design, or firmware projects will be securely archived here."}
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-zinc-200 text-left text-xs dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-850">
              <tr>
                <th className="px-6 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">File & Format</th>
                <th className="px-6 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">Association</th>
                <th className="px-6 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">Size</th>
                <th className="px-6 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">Scan Status</th>
                <th className="px-6 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">Date Added</th>
                <th className="px-6 py-3.5 text-right font-semibold text-zinc-700 dark:text-zinc-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filteredFiles.map((file) => {
                const fileName = file.file_name || file.filename || "file";
                const badge = getFileBadge(fileName);
                const isClean = file.scan_status === "clean" || !file.scan_status;
                const isPending = file.scan_status === "pending_scan";

                return (
                  <tr key={file.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${badge.color}`}>
                          {badge.label}
                        </span>
                        <span className="font-mono font-medium text-zinc-900 dark:text-white truncate max-w-xs">
                          {fileName}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 capitalize text-zinc-500 dark:text-zinc-400">
                      {file.association_type || "General"}
                    </td>
                    <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400 font-mono">
                      {formatFileSize(file.file_size || file.size_bytes)}
                    </td>
                    <td className="px-6 py-4">
                      {isClean ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          Verified Clean
                        </span>
                      ) : isPending ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Scanning
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                          Flagged
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400">
                      {file.created_at
                        ? new Date(file.created_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "Recent"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => handleDownload(file.id)}
                          disabled={downloadingId === file.id || !isClean}
                          className="text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 disabled:opacity-40 cursor-pointer transition"
                        >
                          {downloadingId === file.id ? "Securing Link..." : "Download"}
                        </button>
                        <button
                          onClick={() => handleDelete(file.id)}
                          className="text-xs font-semibold text-red-500 hover:text-red-400 cursor-pointer transition"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
