"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { adminCatalogApi } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parent_id?: string | null;
  is_active: boolean;
  position: number;
}

export default function AdminCategoriesPage() {
  const { hasRole, isAuthenticated } = useAdminAuth();
  const isAllowed = hasRole(["SUPER_ADMIN", "ORDER_MANAGER"]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Category Form state
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [position, setPosition] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  const loadCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminCatalogApi.listCategories();
      if (res?.data) {
        setCategories(res.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadCategories();
    }
  }, [isAuthenticated]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, "-")) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        name: name.trim(),
        slug: slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        description: description.trim() || undefined,
        parent_id: parentId ? parentId : undefined,
        position: parseInt(position, 10) || 0,
        is_active: true,
      };

      await adminCatalogApi.createCategory(payload);
      setName("");
      setSlug("");
      setDescription("");
      setParentId("");
      setPosition("0");
      setShowCreate(false);
      await loadCategories();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (cat: Category) => {
    try {
      await adminCatalogApi.updateCategory(cat.id, {
        is_active: !cat.is_active,
      });
      await loadCategories();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update category status");
    }
  };

  if (!isAllowed) {
    return (
      <div className="p-8 text-center text-red-400">
        Access Restricted: Category management requires ORDER_MANAGER or SUPER_ADMIN role.
      </div>
    );
  }

  // Find root categories for parent selection
  const rootCategories = categories.filter((c) => !c.parent_id);

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase text-blue-400">
            <span>Hardware Catalog</span>
            <span>&bull;</span>
            <span>Taxonomy</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
            Category Hierarchy
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Organize hardware components into root categories and subcategories (max 2-level nesting per CAT-001).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/catalog/products"
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition"
          >
            &larr; Products Catalog
          </Link>
          <button
            type="button"
            onClick={() => setShowCreate(!showCreate)}
            className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition cursor-pointer"
          >
            {showCreate ? "Close Form" : "+ Create Category"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Create Category Modal / Drawer */}
      {showCreate && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-white">New Category Details</h3>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Microcontrollers & SoC"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Slug
                </label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="microcontrollers-soc"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Parent Category (optional)
                </label>
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">None (Top-Level Root)</option>
                  {rootCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief category scope..."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition cursor-pointer"
              >
                {submitting ? "Saving..." : "Create Category"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Categories Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-xs font-mono text-zinc-400 animate-pulse">
            Loading categories...
          </div>
        ) : categories.length === 0 ? (
          <div className="p-16 text-center text-zinc-500 text-xs">
            No categories defined yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] font-mono uppercase text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Category Name</th>
                  <th className="px-4 py-3">Slug</th>
                  <th className="px-4 py-3">Hierarchy Level</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {categories.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-850/50 transition">
                    <td className="px-4 py-3.5 font-medium text-white">
                      {c.parent_id && <span className="text-zinc-500 mr-2">&bull; Sub:</span>}
                      {c.name}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-zinc-400">
                      {c.slug}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-[11px] text-zinc-400">
                        {c.parent_id ? "Level 2 (Sub)" : "Level 1 (Root)"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          c.is_active
                            ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                            : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                        }`}
                      >
                        {c.is_active ? "Active" : "Hidden"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(c)}
                        className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition cursor-pointer"
                      >
                        {c.is_active ? "Hide" : "Show"}
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
  );
}
