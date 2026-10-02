"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { projectsApi, filesApi } from "@/lib/api/client";

interface LinkedRequest {
  type: string;
  id: string;
  status: string;
  title: string;
  created_at: string;
}

interface ProjectDetail {
  id: string;
  name: string;
  description?: string;
  linked_requests: LinkedRequest[];
  created_at: string;
  updated_at: string;
}

interface AggregatedFile {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  scan_status: string;
  source: string;
  association_type?: string;
  association_id?: string;
  created_at: string;
}

export default function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [files, setFiles] = useState<AggregatedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Rename state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  // Unlink state
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // File download state
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  const loadProjectData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [projRes, filesRes] = await Promise.all([
        projectsApi.getProject(projectId),
        projectsApi.getProjectFiles(projectId),
      ]);
      if (projRes?.data) {
        setProject(projRes.data);
        setEditedName(projRes.data.name);
      }
      if (filesRes?.data) {
        setFiles(filesRes.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load project";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProjectData();
  }, [projectId]);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editedName.trim() || editedName === project?.name) {
      setIsEditingName(false);
      return;
    }

    setIsSavingName(true);
    try {
      const res = await projectsApi.renameProject(projectId, editedName.trim());
      if (res?.data) {
        setProject((prev) => (prev ? { ...prev, name: res.data.name } : null));
        setIsEditingName(false);
        setActionMessage("Project name updated.");
        setTimeout(() => setActionMessage(null), 3000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to rename project";
      setErrorMessage(msg);
    } finally {
      setIsSavingName(false);
    }
  };

  const handleUnlink = async (reqType: string, reqId: string) => {
    if (false) {
      return;
    }
    setUnlinkingId(reqId);
    try {
      await projectsApi.unlinkRequest(projectId, reqType, reqId);
      setActionMessage("Request unlinked successfully.");
      setTimeout(() => setActionMessage(null), 3000);
      await loadProjectData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to unlink request";
      setErrorMessage(msg);
    } finally {
      setUnlinkingId(null);
    }
  };

  const handleDownloadFile = async (file: AggregatedFile) => {
    if (file.scan_status !== "clean") {
      setErrorMessage(`File cannot be downloaded while scan status is "${file.scan_status}".`);
      return;
    }

    setDownloadingFileId(file.id);
    try {
      const res = await filesApi.getDownloadUrl(file.id);
      if (res?.data?.download_url) {
        window.open(res.data.download_url, "_blank");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Download failed";
      setErrorMessage(msg);
    } finally {
      setDownloadingFileId(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      submitted: { label: "Submitted", color: "bg-blue-950 text-blue-400 border-blue-800" },
      under_review: { label: "Under Review", color: "bg-amber-950 text-amber-400 border-amber-800" },
      clarification_needed: { label: "Clarification Needed", color: "bg-orange-950 text-orange-400 border-orange-800 animate-pulse" },
      requirements_confirmed: { label: "Requirements Confirmed", color: "bg-cyan-950 text-cyan-400 border-cyan-800" },
      quote_ready: { label: "Quote Ready", color: "bg-emerald-950 text-emerald-400 border-emerald-800" },
      payment_pending: { label: "Payment Pending", color: "bg-purple-950 text-purple-400 border-purple-800 animate-pulse" },
      in_progress: { label: "In Production", color: "bg-cyan-950 text-cyan-400 border-cyan-800" },
      completed_execution: { label: "Execution Complete", color: "bg-indigo-950 text-indigo-400 border-indigo-800" },
      delivered: { label: "Delivered", color: "bg-emerald-950 text-emerald-400 border-emerald-800" },
      completed: { label: "Completed", color: "bg-neutral-800 text-neutral-300 border-neutral-700" },
      cancelled: { label: "Cancelled", color: "bg-red-950 text-red-400 border-red-800" },
    };
    const s = map[status] || { label: status, color: "bg-neutral-800 text-neutral-300 border-neutral-700" };
    return (
      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${s.color}`}>
        {s.label}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 py-12 px-4 max-w-5xl mx-auto space-y-6">
        <div className="h-6 bg-zinc-800 rounded w-1/4 animate-pulse" />
        <div className="h-10 bg-zinc-800 rounded w-1/2 animate-pulse" />
        <div className="h-64 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (errorMessage || !project) {
    const isAuthError = errorMessage?.includes("401") || errorMessage?.includes("Unauthorized") || errorMessage?.includes("credentials");
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 py-12 px-4 max-w-3xl mx-auto flex items-center justify-center">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-4 max-w-md w-full">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-zinc-300 text-xl font-bold">
            {isAuthError ? "🔒" : "!"}
          </div>
          <h2 className="text-lg font-bold text-white">
            {isAuthError ? "Sign In Required" : "Workspace Unavailable"}
          </h2>
          <p className="text-zinc-400 text-xs leading-relaxed">
            {isAuthError
              ? "Please sign in to access your unified engineering project workspace."
              : errorMessage || "Project workspace not found."}
          </p>
          <div className="pt-2 flex justify-center gap-3">
            {isAuthError ? (
              <Link
                href={`/login?redirect=${encodeURIComponent(`/projects/${projectId}`)}`}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                Sign In to Account
              </Link>
            ) : (
              <Link
                href="/projects"
                className="inline-block text-xs text-zinc-300 hover:text-white underline"
              >
                &larr; Back to Projects
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Breadcrumb & Navigation */}
        <div className="flex items-center justify-between text-xs text-zinc-400 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2">
            <Link href="/projects" className="hover:text-zinc-200 transition-colors">
              Projects
            </Link>
            <span>/</span>
            <span className="text-zinc-200 font-mono">{project.id.slice(0, 8)}...</span>
          </div>
          <Link
            href="/manufacturing/request"
            className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
          >
            + Link New Request
          </Link>
        </div>

        {/* Action feedback banner */}
        {actionMessage && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-lg text-emerald-200 text-xs flex items-center justify-between">
            <span>{actionMessage}</span>
          </div>
        )}

        {/* Workspace Title & Metadata */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1">
              {isEditingName ? (
                <form onSubmit={handleSaveName} className="flex items-center gap-2 max-w-md">
                  <input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-base font-semibold text-white focus:outline-none focus:border-emerald-500"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={isSavingName}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold rounded-lg"
                  >
                    {isSavingName ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingName(false);
                      setEditedName(project.name);
                    }}
                    className="px-3 py-1.5 border border-zinc-700 text-zinc-400 text-xs rounded-lg hover:text-white"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-white tracking-tight">{project.name}</h1>
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Rename Project"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                </div>
              )}
              <p className="text-xs text-zinc-400 mt-1">
                Workspace ID: <span className="font-mono text-zinc-300">{project.id}</span>
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs text-zinc-400 font-mono">
              <span>Created {new Date(project.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Section 1: Linked Engineering Requests */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span>Linked Engineering Requests</span>
              <span className="text-xs font-mono text-zinc-400 bg-zinc-850 px-2 py-0.5 rounded">
                {project.linked_requests.length}
              </span>
            </h2>
          </div>

          {project.linked_requests.length === 0 ? (
            <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-8 text-center space-y-2">
              <p className="text-sm text-zinc-400">No requests linked to this project workspace yet.</p>
              <p className="text-xs text-zinc-500">
                You can link an existing manufacturing request during creation or from the request detail page.
              </p>
            </div>
          ) : (
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800/80">
              {project.linked_requests.map((req) => (
                <div
                  key={req.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-900/60 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-mono uppercase bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">
                        {req.type}
                      </span>
                      {getStatusBadge(req.status)}
                    </div>
                    <p className="text-sm font-medium text-white">{req.title}</p>
                    <p className="text-xs text-zinc-500 font-mono">
                      Request ID: {req.id} &bull; Submitted {new Date(req.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <Link
                      href={
                        req.type === "manufacturing"
                          ? `/manufacturing/requests/${req.id}`
                          : `#`
                      }
                      className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg transition-colors font-medium"
                    >
                      Open Request &rarr;
                    </Link>
                    <button
                      onClick={() => handleUnlink(req.type, req.id)}
                      disabled={unlinkingId === req.id}
                      className="text-xs text-red-400 hover:text-red-300 border border-red-900/40 hover:border-red-800 bg-red-950/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {unlinkingId === req.id ? "Unlinking..." : "Unlink"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Aggregated Project Files Rollup */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span>Aggregated Project Files & Deliverables</span>
              <span className="text-xs font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                {files.length}
              </span>
            </h2>
            <p className="text-xs text-zinc-500 hidden sm:block">
              Auto-aggregated from all requests linked to this project
            </p>
          </div>

          {files.length === 0 ? (
            <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-8 text-center space-y-2">
              <p className="text-sm text-zinc-400">No files attached to any linked requests yet.</p>
              <p className="text-xs text-zinc-500">
                Uploaded CAD designs, Gerber zip archives, and engineering deliverables will appear here.
              </p>
            </div>
          ) : (
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase font-mono tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Filename</th>
                    <th className="py-3 px-4">Origin / Source</th>
                    <th className="py-3 px-4">Scan Status</th>
                    <th className="py-3 px-4">Size</th>
                    <th className="py-3 px-4">Uploaded</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {files.map((file) => (
                    <tr key={file.id} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-zinc-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                          <span className="font-medium text-white line-clamp-1">{file.filename}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                          file.source === "admin_deliverable"
                            ? "bg-indigo-950 text-indigo-300 border-indigo-800"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700"
                        }`}>
                          {file.source === "admin_deliverable" ? "Deliverable" : "Customer Upload"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                          file.scan_status === "clean"
                            ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                            : file.scan_status === "pending"
                            ? "bg-amber-950 text-amber-400 border-amber-800"
                            : "bg-red-950 text-red-400 border-red-800"
                        }`}>
                          {file.scan_status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-zinc-400">
                        {formatFileSize(file.size_bytes)}
                      </td>
                      <td className="py-3 px-4 font-mono text-zinc-400">
                        {new Date(file.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleDownloadFile(file)}
                          disabled={file.scan_status !== "clean" || downloadingFileId === file.id}
                          className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 rounded text-xs font-medium transition-colors"
                        >
                          {downloadingFileId === file.id ? "Opening..." : "Download"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
