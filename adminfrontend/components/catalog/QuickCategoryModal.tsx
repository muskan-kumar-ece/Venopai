"use client";

import React, { useState, useEffect } from "react";
import { adminCatalogApi } from "@/lib/api/client";

interface Category {
  id: string;
  name: string;
  slug?: string;
  parent_id?: string | null;
}

interface QuickCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoryCreated: (newCategory: { id: string; name: string; slug: string }) => void;
  existingCategories?: Category[];
}

export default function QuickCategoryModal({
  isOpen,
  onClose,
  onCategoryCreated,
  existingCategories = [],
}: QuickCategoryModalProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName("");
      setSlug("");
      setSlugEdited(false);
      setDescription("");
      setParentId("");
      setError(null);
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!slugEdited) {
      setSlug(slugify(val));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlug(slugify(e.target.value));
    setSlugEdited(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Category name is required.");
      return;
    }
    const finalSlug = slug.trim() || slugify(name);
    if (!finalSlug) {
      setError("Valid category slug is required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload: {
        name: string;
        slug: string;
        description?: string;
        parent_id?: string | null;
        is_active: boolean;
        position: number;
      } = {
        name: name.trim(),
        slug: finalSlug,
        description: description.trim() || undefined,
        is_active: true,
        position: existingCategories.length + 1,
      };

      if (parentId) {
        payload.parent_id = parentId;
      }

      const res = await adminCatalogApi.createCategory(payload);
      if (res?.data) {
        onCategoryCreated({
          id: res.data.id,
          name: res.data.name,
          slug: res.data.slug || finalSlug,
        });
        onClose();
      } else {
        throw new Error("Category creation returned empty response");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create category.";
      if (msg.includes("SLUG_ALREADY_EXISTS") || msg.includes("already exists")) {
        setError(`A category with slug "${finalSlug}" already exists. Please choose a different slug.`);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl z-10 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-mono">
                +
              </span>
              Create New Category
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Instantly create a hardware category and assign it to your product.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              Category Name *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={handleNameChange}
              placeholder="e.g. Wireless & IoT Modules, FPGA Kits"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              URL Slug *
            </label>
            <div className="flex items-center rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition">
              <span className="font-mono text-zinc-500 select-none">/products/category/</span>
              <input
                type="text"
                required
                value={slug}
                onChange={handleSlugChange}
                placeholder="wireless-iot-modules"
                className="flex-1 bg-transparent text-xs text-white font-mono focus:outline-none ml-1 placeholder-zinc-600"
              />
            </div>
          </div>

          {existingCategories.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Parent Category (Optional)
              </label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition"
              >
                <option value="">None (Top-Level Category)</option>
                {existingCategories
                  .filter((c) => !c.parent_id) // Only top-level can be parents
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the electronics category for SEO and customers..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 focus:outline-none transition disabled:opacity-50 cursor-pointer shadow-sm shadow-emerald-950"
            >
              {loading ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Creating Category...</span>
                </>
              ) : (
                <>
                  <span>Create &amp; Select Category</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
