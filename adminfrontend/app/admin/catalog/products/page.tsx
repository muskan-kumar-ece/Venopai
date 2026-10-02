"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { adminCatalogApi } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: string;
  status: string;
  is_active: boolean;
  stock_quantity?: number;
  available_quantity?: number;
  category?: { id: string; name: string };
  created_at: string;
}

interface PaginationMeta {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next?: boolean;
  has_prev?: boolean;
}

function getPaginationRange(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }
  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
}

export default function AdminCatalogProductsPage() {
  const { hasRole, isAuthenticated } = useAdminAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination State
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);

  const isAllowed = hasRole(["SUPER_ADMIN", "ORDER_MANAGER"]);

  // Fetch categories once on mount
  useEffect(() => {
    if (isAuthenticated) {
      adminCatalogApi.listCategories()
        .then((res: any) => {
          if (res?.data) setCategories(res.data);
        })
        .catch(() => {});
    }
  }, [isAuthenticated]);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset page on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when category or status changes
  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId);
    setPage(1);
  };

  const handleStatusChange = (status: string) => {
    setSelectedStatus(status);
    setPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  // Load products from backend with server-side filtering & pagination
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminCatalogApi.listProducts({
        category: selectedCategory || undefined,
        search: debouncedSearch.trim() || undefined,
        status: selectedStatus !== "all" ? selectedStatus : undefined,
        page,
        page_size: pageSize,
      });

      if (res?.data) {
        setProducts(res.data);
        if (res.pagination) {
          setPagination(res.pagination);
        } else {
          setPagination(null);
        }
      } else if (Array.isArray(res)) {
        setProducts(res);
        setPagination(null);
      } else {
        setProducts([]);
        setPagination(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, selectedCategory, selectedStatus, debouncedSearch, page, pageSize]);

  if (!isAllowed) {
    return (
      <div className="p-8 text-center">
        <div className="max-w-md mx-auto rounded-xl border border-red-900/60 bg-red-950/30 p-6 text-red-300 text-sm">
          <p className="font-semibold text-base">Access Restricted</p>
          <p className="mt-1 text-xs text-red-400">
            Catalog administration requires an authorized <span className="font-mono font-bold">ORDER_MANAGER</span> or <span className="font-mono font-bold">SUPER_ADMIN</span> staff role.
          </p>
        </div>
      </div>
    );
  }

  const totalPages = pagination?.total_pages || 1;
  const totalItems = pagination?.total_items || products.length;
  const fromItem = pagination ? (pagination.page - 1) * pagination.page_size + 1 : (page - 1) * pageSize + 1;
  const toItem = pagination ? Math.min(pagination.page * pagination.page_size, totalItems) : (page - 1) * pageSize + products.length;
  const hasPrev = pagination?.has_prev ?? page > 1;
  const hasNext = pagination?.has_next ?? page < totalPages;
  const pageRange = getPaginationRange(page, totalPages);

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase text-blue-400">
            <span>Hardware Catalog</span>
            <span>&bull;</span>
            <span>SKU Directory</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
            Component & Hardware Products
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Manage electronic components, set prices in INR, configure specifications, and maintain live availability.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/catalog/categories"
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 transition"
          >
            Manage Categories
          </Link>
          <Link
            href="/admin/catalog/products/new"
            className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition shadow-sm"
          >
            + Add New Product
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-xs text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadData} className="underline hover:text-white cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU, name, slug..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 pl-8 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
            <svg
              className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div className="w-full sm:w-48">
            <select
              value={selectedCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="w-full sm:w-40">
            <select
              value={selectedStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="inactive">Inactive</option>
              <option value="discontinued">Discontinued</option>
            </select>
          </div>
        </div>

        {/* Page Size Selector */}
        <div className="flex items-center gap-2 text-xs text-zinc-400 self-end lg:self-auto">
          <span>Show:</span>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
          >
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-16 text-center text-xs font-mono text-zinc-400 animate-pulse">
            Loading catalog database...
          </div>
        ) : products.length === 0 ? (
          <div className="p-16 text-center text-zinc-500 text-xs">
            No products found matching criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] font-mono uppercase text-zinc-400">
                <tr>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Product Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Price (INR)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {products.map((prod) => (
                  <tr key={prod.id} className="hover:bg-zinc-850/50 transition">
                    <td className="px-4 py-3.5 font-mono text-zinc-300 font-semibold">
                      {prod.sku}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-white max-w-xs truncate">
                      {prod.name}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-400">
                      {prod.category?.name || "General"}
                    </td>
                    <td className="px-4 py-3.5 font-mono font-semibold text-emerald-400">
                      ₹{parseFloat(prod.price || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          prod.status === "active" || prod.is_active
                            ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                            : prod.status === "draft"
                            ? "bg-amber-950/80 text-amber-400 border border-amber-800"
                            : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                        }`}
                      >
                        <span
                          className={`h-1 w-1 rounded-full ${
                            prod.status === "active" || prod.is_active
                              ? "bg-emerald-400"
                              : prod.status === "draft"
                              ? "bg-amber-400"
                              : "bg-zinc-500"
                          }`}
                        />
                        {prod.status === "active" || prod.is_active
                          ? "Active"
                          : prod.status === "draft"
                          ? "Draft"
                          : prod.status === "discontinued"
                          ? "Discontinued"
                          : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right space-x-2">
                      <Link
                        href={`/admin/catalog/products/${prod.id}`}
                        className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700 hover:text-white transition"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/admin/inventory`}
                        className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-blue-400 hover:bg-zinc-700 transition"
                      >
                        Stock
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Enterprise Table Pagination Footer */}
        {!loading && products.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-zinc-800 bg-zinc-900/60 px-4 py-3 text-xs text-zinc-400">
            <div>
              Showing <span className="font-semibold text-white">{fromItem}–{toItem}</span> of{" "}
              <span className="font-semibold text-white">{totalItems}</span> products
              {totalPages > 1 && (
                <span className="ml-2 text-zinc-500 font-mono">
                  (Page {page} of {totalPages})
                </span>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={!hasPrev || loading}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
                >
                  &larr; Prev
                </button>

                <div className="flex items-center gap-1">
                  {pageRange.map((p, idx) => {
                    if (typeof p === "string") {
                      return (
                        <span key={`ellipsis-${idx}`} className="px-2 py-1 text-xs text-zinc-500 font-mono">
                          ...
                        </span>
                      );
                    }
                    const isActive = p === page;
                    return (
                      <button
                        key={`page-${p}`}
                        onClick={() => setPage(p)}
                        disabled={isActive || loading}
                        className={`h-7 min-w-[1.75rem] px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          isActive
                            ? "bg-emerald-600 text-white font-bold pointer-events-none"
                            : "border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setPage(page + 1)}
                  disabled={!hasNext || loading}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
                >
                  Next &rarr;
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
