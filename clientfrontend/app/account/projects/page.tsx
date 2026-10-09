'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { projectsApi, getCustomerToken } from "@/lib/api/client";
import { LoadingState } from '@/components/account/LoadingState';
import { EmptyState } from '@/components/account/EmptyState';

interface Project {
  id: string;
  name: string;
  linked_requests_count?: number;
  active_requests_count?: number;
  created_at?: string;
}

export default function AccountProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New project modal
  const [showModal, setShowModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getCustomerToken() || undefined;
      const res = await projectsApi.listProjects(token);
      if (res?.data) {
        setProjects(res.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;
    setSubmitting(true);
    setModalError(null);
    try {
      const token = getCustomerToken() || undefined;
      await projectsApi.createProject(projectName.trim(), token);
      setShowModal(false);
      setProjectName('');
      loadProjects();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading your engineering projects..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Engineering Projects</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Group your manufacturing, electronics design, software firmware, and consultations into unified product portfolios.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer self-start sm:self-auto"
        >
          + Create Project
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded-2xl text-xs font-medium">
          {error}
        </div>
      )}

      {projects.length === 0 ? (
        <EmptyState
          title="No projects created yet"
          message="Create a lightweight project to aggregate multiple hardware service requests, CAD designs, and firmware deliverables."
          actionLabel="Create First Project"
          actionHref="#create"
          icon="📂"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-base text-zinc-900 dark:text-white">{p.name}</h3>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">{p.id.slice(0, 8)}</span>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
                  <div>
                    Linked Services:{' '}
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {p.linked_requests_count ?? 0}
                    </span>
                  </div>
                  {p.created_at && (
                    <div>Created: {new Date(p.created_at).toLocaleDateString()}</div>
                  )}
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Aggregate CAD / Files</span>
                <Link
                  href={`/projects/${p.id}`}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow-xs cursor-pointer"
                >
                  Manage Project &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">New Engineering Project</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              Enter a name for your hardware project. You can link existing PCB designs, firmware, and quotes afterwards.
            </p>

            {modalError && (
              <div className="p-3 mb-4 text-xs text-red-800 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Project Name *</label>
                <input
                  type="text"
                  required
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="e.g. Home Energy Monitor v2"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !projectName.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
