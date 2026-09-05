"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { projectsApi } from "@/lib/api/client";

interface ProjectSummary {
  id: string;
  name: string;
  linked_requests_count: number;
  active_requests_count: number;
  completed_requests_count: number;
  created_at: string;
}

export default function ProjectsListPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New Project Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchProjects = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await projectsApi.listProjects();
      if (res?.data) {
        setProjects(res.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load projects";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      setModalError("Project name is required.");
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      await projectsApi.createProject(newProjectName.trim());
      setIsModalOpen(false);
      setNewProjectName("");
      await fetchProjects();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create project";
      setModalError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono tracking-widest text-emerald-400 uppercase bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded">
                Workspaces
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-2">
              Engineering Projects
            </h1>
            <p className="text-sm text-zinc-400 mt-1 max-w-xl">
              Organize and coordinate your hardware prototypes, engineering service requests, and technical deliverables in unified project workspaces.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/manufacturing/request"
              className="text-xs text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 bg-zinc-900 px-3 py-2 rounded-lg transition-colors"
            >
              + Submit Manufacturing Request
            </Link>
            <button
              onClick={() => {
                setIsModalOpen(true);
                setModalError(null);
                setNewProjectName("");
              }}
              className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Project
            </button>
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-4 bg-red-950/50 border border-red-800 rounded-lg text-red-200 text-sm flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              onClick={fetchProjects}
              className="underline text-xs hover:text-white"
            >
              Retry
            </button>
          </div>
        )}

        {/* Projects Grid / Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-6 animate-pulse space-y-4"
              >
                <div className="h-5 bg-zinc-800 rounded w-2/3" />
                <div className="h-4 bg-zinc-850 rounded w-1/3" />
                <div className="pt-4 border-t border-zinc-800 flex gap-3">
                  <div className="h-6 bg-zinc-800 rounded w-16" />
                  <div className="h-6 bg-zinc-800 rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 bg-zinc-900/30 border border-dashed border-zinc-800 rounded-2xl p-8 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-zinc-850 border border-zinc-750 mx-auto flex items-center justify-center text-zinc-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <div className="max-w-md mx-auto">
              <h2 className="text-lg font-semibold text-white">No engineering projects yet</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Create a project to group together PCB fabrication, CNC machining, firmware development, and CAD deliverables in one place.
              </p>
            </div>
            <button
              onClick={() => {
                setIsModalOpen(true);
                setModalError(null);
                setNewProjectName("");
              }}
              className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((proj) => (
              <Link
                key={proj.id}
                href={`/projects/${proj.id}`}
                className="group block bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-6 transition-all duration-200 shadow-sm hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors line-clamp-1">
                    {proj.name}
                  </h2>
                  <svg
                    className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all shrink-0 mt-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>

                <p className="text-xs text-zinc-500 mt-1 font-mono">
                  Created {new Date(proj.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                </p>

                <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400 font-medium">
                      {proj.linked_requests_count} {proj.linked_requests_count === 1 ? "Request" : "Requests"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {proj.active_requests_count > 0 && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/80">
                        {proj.active_requests_count} active
                      </span>
                    )}
                    {proj.completed_requests_count > 0 && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/80">
                        {proj.completed_requests_count} done
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Quick Info Banner */}
        <div className="bg-zinc-900/30 border border-zinc-850 rounded-xl p-5 text-xs text-zinc-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-zinc-800 text-zinc-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium text-zinc-200">Lightweight Project Workspaces</p>
              <p className="text-zinc-400 mt-0.5">
                Projects simply group together related requests and automatically roll up all CAD files, Gerber archives, and engineering deliverables.
              </p>
            </div>
          </div>
          <Link
            href="/manufacturing/requests"
            className="text-emerald-400 hover:text-emerald-300 whitespace-nowrap font-medium transition-colors"
          >
            View All Manufacturing Requests &rarr;
          </Link>
        </div>
      </div>

      {/* Create Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white">Create New Project</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-red-950/60 border border-red-800 rounded text-red-200 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1.5">
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Telemetry Flight Computer Rev 2"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-zinc-500 mt-1.5">
                  Per VenopAI project rules, projects are created with name only. Requests and files can be linked inside.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white border border-zinc-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newProjectName.trim()}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
