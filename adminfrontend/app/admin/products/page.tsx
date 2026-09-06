"use client";

import { useEffect, useState } from "react";
import { adminCatalogApi } from "@/lib/api/client";

interface Product {
  id: string;
  name: string;
  slug: string;
  sku?: string | null;
  status: string;
  price: string;
  cost_price?: string | null;
  stock_quantity?: number;
  available_quantity?: number;
  is_featured?: boolean;
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUnauthorized, setIsUnauthorized] = useState(false);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    setIsUnauthorized(false);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("admin_access_token") || undefined : undefined;
      const res = await adminCatalogApi.listProducts({}, token);
      if (res?.data) {
        setProducts(res.data);
      }
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 403) {
        setIsUnauthorized(true);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load products");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newSlug.trim() || !newPrice.trim()) {
      setCreateError("Name, slug, and price are required.");
      return;
    }
    setSubmitting(true);
    setCreateError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("admin_access_token") || undefined : undefined;
      await adminCatalogApi.createProduct(
        {
          name: newName.trim(),
          slug: newSlug.trim(),
          price: newPrice.trim(),
        },
        token
      );
      setShowCreateModal(false);
      setNewName("");
      setNewSlug("");
      setNewPrice("");
      fetchProducts();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (product: Product) => {
    const nextStatus = product.status === "active" ? "inactive" : "active";
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("admin_access_token") || undefined : undefined;
      await adminCatalogApi.updateProduct(product.id, { status: nextStatus }, token);
      fetchProducts();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update product status");
    }
  };

  if (isUnauthorized) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-8 text-center max-w-xl mx-auto">
          <span className="text-4xl">🔒</span>
          <h2 className="text-xl font-bold text-red-200 mt-3">Access Restricted</h2>
          <p className="text-sm text-red-400 mt-2">
            Catalog administration is scoped strictly to <strong className="text-white">ORDER_MANAGER</strong> and{" "}
            <strong className="text-white">SUPER_ADMIN</strong> roles (Document 04 §40).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">Catalog & Products</h1>
            <span className="rounded bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 text-[11px] font-mono text-emerald-300">
              ORDER_MANAGER / SUPER_ADMIN
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Manage electronic components, modules, mechanical hardware, and stock inventory.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors shadow-sm"
        >
          + Add New Product
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-zinc-400 text-sm">
          Loading catalog items...
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
          <p className="text-sm text-zinc-400">No products found in catalog.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 shadow-md">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="border-b border-zinc-800 bg-zinc-900 text-xs uppercase font-mono text-zinc-400">
              <tr>
                <th className="px-6 py-3">Product</th>
                <th className="px-6 py-3">Slug / SKU</th>
                <th className="px-6 py-3">Price</th>
                <th className="px-6 py-3">Stock</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-sans">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-white">{p.name}</td>
                  <td className="px-6 py-4 font-mono text-xs text-zinc-400">
                    <div>{p.slug}</div>
                    {p.sku && <div className="text-zinc-500 text-[11px]">SKU: {p.sku}</div>}
                  </td>
                  <td className="px-6 py-4 font-mono text-white">₹{p.price}</td>
                  <td className="px-6 py-4 font-mono text-xs">
                    <span className="text-emerald-400">{p.available_quantity ?? p.stock_quantity ?? 0}</span>
                    <span className="text-zinc-500"> avail</span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        p.status === "active"
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          : p.status === "draft"
                          ? "bg-amber-950 text-amber-400 border border-amber-800"
                          : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleToggleStatus(p)}
                      className="text-xs text-zinc-400 hover:text-white underline transition-colors"
                    >
                      {p.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Product Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Create Catalog Product</h3>
            <p className="text-xs text-zinc-400 mb-4">
              Products are created in &quot;draft&quot; status and become publicly visible once activated.
            </p>

            {createError && (
              <div className="mb-4 rounded-lg bg-red-950/50 border border-red-800 p-3 text-xs text-red-300">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Product Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    if (!newSlug) {
                      setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                    }
                  }}
                  placeholder="e.g., STM32F401 Dev Board"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Slug</label>
                <input
                  type="text"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  placeholder="e.g., stm32f401-dev-board"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Price (₹)</label>
                <input
                  type="text"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="e.g., 799.00"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Creating..." : "Create Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
