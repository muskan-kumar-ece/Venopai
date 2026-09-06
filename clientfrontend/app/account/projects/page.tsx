'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { projectsApi } from '@/lib/api/client';
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
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
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
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Engineering Projects</h1>
          <p className="text-sm text-gray-500 mt-1">
            Group your manufacturing, electronics design, software firmware, and consultations into unified product portfolios.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
        >
          + Create Project
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
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
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:border-gray-300 transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-base text-gray-900">{p.name}</h3>
                  <span className="text-xs text-gray-400 font-mono">{p.id.slice(0, 8)}</span>
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <div>
                    Linked Services: <span className="font-semibold text-gray-800">{p.linked_requests_count ?? 0}</span>
                  </div>
                  {p.created_at && (
                    <div>
                      Created: {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-blue-600 font-medium">Aggregate CAD / Files</span>
                <Link
                  href={`/projects/${p.id}`}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
                >
                  Manage Project →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">New Engineering Project</h3>
            <p className="text-sm text-gray-500 mb-4">
              Enter a name for your hardware project. You can link existing PCB designs, firmware, and quotes afterwards.
            </p>

            {modalError && (
              <div className="p-3 mb-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Project Name *</label>
                <input
                  type="text"
                  required
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="e.g. Home Energy Monitor v2"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !projectName.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
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
