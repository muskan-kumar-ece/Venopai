"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminCatalogApi } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";
import ProductMediaUploader from "@/components/catalog/ProductMediaUploader";
import QuickCategoryModal from "@/components/catalog/QuickCategoryModal";

interface Category {
  id: string;
  name: string;
  slug?: string;
  parent_id?: string | null;
}

export default function AdminEditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const productId = resolvedParams.id;
  const router = useRouter();
  const { hasRole } = useAdminAuth();
  const isAllowed = hasRole(["SUPER_ADMIN", "ORDER_MANAGER"]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [createdCategoryBadge, setCreatedCategoryBadge] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [weightGrams, setWeightGrams] = useState("50");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("active");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [userManualUrl, setUserManualUrl] = useState("");
  const [specs, setSpecs] = useState<Array<{ name: string; value: string }>>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [catRes, prodRes] = await Promise.allSettled([
          adminCatalogApi.listCategories(),
          adminCatalogApi.getProduct(productId),
        ]);

        if (catRes.status === "fulfilled" && catRes.value?.data) {
          setCategories(catRes.value.data);
        }

        if (prodRes.status === "fulfilled" && prodRes.value?.data) {
          const p = prodRes.value.data;
          setName(p.name || "");
          setSlug(p.slug || "");
          setSku(p.sku || "");
          setPrice(p.price || "");
          setCostPrice(p.cost_price || "");
          setWeightGrams(p.weight_grams ? String(p.weight_grams) : "50");
          setStatus(p.status || "active");
          setDescription(p.description || "");
          setImages(Array.isArray(p.images) ? p.images : []);
          setVideoUrl(p.video_url || "");
          setUserManualUrl(p.user_manual_url || "");

          if (p.categories && p.categories.length > 0) {
            setCategoryId(p.categories[0].id);
          }

          if (Array.isArray(p.specifications)) {
            setSpecs(
              p.specifications.map((s: { name?: string; key?: string; value?: unknown }) => ({
                name: s.name || s.key || "",
                value: s.value !== undefined ? String(s.value) : "",
              }))
            );
          } else if (p.specifications && typeof p.specifications === "object") {
            setSpecs(
              Object.entries(p.specifications).map(([k, v]) => ({
                name: k,
                value: String(v),
              }))
            );
          }
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load product data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [productId]);

  const handleAddSpec = () => {
    setSpecs([...specs, { name: "", value: "" }]);
  };

  const handleRemoveSpec = (index: number) => {
    setSpecs(specs.filter((_, i) => i !== index));
  };

  const handleSpecChange = (index: number, field: "name" | "value", val: string) => {
    const updated = [...specs];
    updated[index][field] = val;
    setSpecs(updated);
  };

  const handleCategoryCreated = (newCat: { id: string; name: string; slug: string }) => {
    setCategories((prev) => [...prev, newCat]);
    setCategoryId(newCat.id);
    setCreatedCategoryBadge(newCat.name);
    setTimeout(() => setCreatedCategoryBadge(null), 4000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const formattedSpecs = specs
        .filter((s) => s.name.trim() && s.value.trim())
        .map((s) => ({ name: s.name.trim(), value: s.value.trim() }));

      const payload = {
        name: name.trim(),
        slug: slug.trim(),
        sku: sku.trim().toUpperCase(),
        price: parseFloat(price).toFixed(2),
        cost_price: costPrice.trim() ? parseFloat(costPrice).toFixed(2) : undefined,
        weight_grams: weightGrams ? parseInt(weightGrams, 10) : undefined,
        category_ids: categoryId ? [categoryId] : [],
        status,
        description: description.trim(),
        specifications: formattedSpecs,
        images,
        video_url: videoUrl.trim() || undefined,
        user_manual_url: userManualUrl.trim() || undefined,
      };

      await adminCatalogApi.updateProduct(productId, payload);
      setSuccess("Product updated successfully.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update product");
    } finally {
      setSaving(false);
    }
  };

  if (!isAllowed) {
    return (
      <div className="p-8 text-center text-red-400">
        Access Restricted: Catalog management requires ORDER_MANAGER or SUPER_ADMIN role.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-16 text-center text-xs font-mono text-zinc-400 animate-pulse">
        Loading product details...
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-5">
        <div>
          <Link
            href="/admin/catalog/products"
            className="text-xs text-zinc-400 hover:text-white transition flex items-center gap-1 mb-1"
          >
            &larr; Back to Catalog
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Edit Hardware Product
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            SKU: <span className="font-mono text-white font-semibold">{sku}</span> &bull; ID: {productId}
          </p>
        </div>

        <Link
          href="/admin/inventory"
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-blue-400 hover:bg-zinc-800 transition"
        >
          Check Inventory Stock &rarr;
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-xs text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-4 text-xs text-emerald-300">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core Product Info */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-white">General Information</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Product Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                SKU
              </label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white font-mono uppercase focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                URL Slug
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-zinc-300">
                  Category *
                </label>
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(true)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium transition cursor-pointer"
                >
                  <span className="font-bold">+</span> New Category
                </button>
              </div>
              <select
                value={categoryId}
                onChange={(e) => {
                  if (e.target.value === "__NEW__") {
                    setShowCategoryModal(true);
                  } else {
                    setCategoryId(e.target.value);
                  }
                }}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="" disabled>Select a category...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__NEW__" className="text-emerald-400 font-semibold bg-zinc-800">
                  ➕ + Create New Category...
                </option>
              </select>
              {createdCategoryBadge && (
                <p className="mt-1.5 text-[11px] text-emerald-400 flex items-center gap-1 font-medium animate-in fade-in">
                  <span>✓</span> Category &ldquo;{createdCategoryBadge}&rdquo; created and selected!
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Pricing & Publication */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-white">Pricing & Logistics</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Selling Price (INR)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs text-zinc-500">₹</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-7 pr-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Internal Cost Price (INR)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs text-zinc-500">₹</span>
                <input
                  type="number"
                  step="0.01"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-7 pr-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Weight (grams)
              </label>
              <input
                type="number"
                value={weightGrams}
                onChange={(e) => setWeightGrams(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Publication Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full sm:w-64 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="active">Active (Visible in Storefront)</option>
              <option value="draft">Draft (Hidden)</option>
              <option value="inactive">Inactive</option>
              <option value="discontinued">Discontinued</option>
            </select>
          </div>
        </div>

        {/* Product Media (Images, Video, User Manual PDF) */}
        <ProductMediaUploader
          images={images}
          onChangeImages={setImages}
          videoUrl={videoUrl}
          onChangeVideoUrl={setVideoUrl}
          userManualUrl={userManualUrl}
          onChangeUserManualUrl={setUserManualUrl}
        />

        {/* Specifications */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Technical Specifications</h3>
            <button
              type="button"
              onClick={handleAddSpec}
              className="text-xs text-emerald-400 hover:text-emerald-300 transition"
            >
              + Add Specification Row
            </button>
          </div>

          <div className="space-y-2">
            {specs.map((s, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Parameter"
                  value={s.name}
                  onChange={(e) => handleSpecChange(idx, "name", e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Value"
                  value={s.value}
                  onChange={(e) => handleSpecChange(idx, "value", e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveSpec(idx)}
                  className="text-zinc-500 hover:text-red-400 p-1.5 text-xs"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Link
            href="/admin/catalog/products"
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition shadow-sm cursor-pointer"
          >
            {saving ? "Saving Changes..." : "Save Product Changes"}
          </button>
        </div>
      </form>

      {/* Quick Category Creation Modal */}
      <QuickCategoryModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        onCategoryCreated={handleCategoryCreated}
        existingCategories={categories}
      />
    </div>
  );
}
