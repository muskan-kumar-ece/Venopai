"use client";

import React, { useEffect, useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { catalogApi, cartApi, PaginationMeta } from "@/lib/api/client";

interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: string;
  description: string;
  images?: string[];
  primary_image_url?: string;
  stock_quantity?: number;
  specifications?: Record<string, string> | Array<{ key?: string; name?: string; value?: unknown }>;
  category?: { id: string; name: string; slug?: string };
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
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

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters from query or state
  const currentCategory = searchParams.get("category") || "all";
  const currentSearch = searchParams.get("search") || "";
  const currentSort = searchParams.get("sort") || "featured";
  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  const [searchInput, setSearchInput] = useState(currentSearch);
  const [addingToCart, setAddingToCart] = useState<string | null>(null);
  const [cartSuccess, setCartSuccess] = useState<string | null>(null);

  // Sync search input if query changes
  useEffect(() => {
    setSearchInput(currentSearch);
  }, [currentSearch]);

  // Fetch categories
  useEffect(() => {
    catalogApi.listCategories()
      .then((res: { data?: Category[] } | Category[]) => {
        const catData = res && "data" in res && Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [];
        if (catData.length > 0) setCategories(catData);
      })
      .catch(() => {});
  }, []);

  // Fetch products (36 per page for optimal grid alignment)
  useEffect(() => {
    setLoading(true);
    setError(null);

    const params: Record<string, string | number> = {
      page: currentPage,
      page_size: 36,
    };
    if (currentCategory !== "all") {
      params.category_id = currentCategory;
    }
    if (currentSearch) {
      params.search = currentSearch;
    }

    catalogApi.listProducts(params)
      .then((res: { data?: Product[]; pagination?: PaginationMeta } | Product[]) => {
        if (res && "data" in res && Array.isArray(res.data)) {
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
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load products");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [currentCategory, currentSearch, currentPage]);

  const updateFilters = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, val]) => {
      if (val === null || val === "" || val === "all") {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    });
    // Reset to page 1 on filter changes unless changing page directly
    if (!updates.page) {
      params.delete("page");
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    startTransition(() => {
      router.push(`/products?${params.toString()}`);
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ search: searchInput });
  };

  const handleAddToCart = async (product: Product) => {
    setAddingToCart(product.id);
    setCartSuccess(null);
    try {
      await cartApi.addItem({ product_id: product.id, quantity: 1 });
      setCartSuccess(product.id);
      try {
        const stored = parseInt(localStorage.getItem("venopai_cart_count") || "0", 10);
        localStorage.setItem("venopai_cart_count", String(stored + 1));
        window.dispatchEvent(new Event("storage"));
      } catch {}
      setTimeout(() => setCartSuccess(null), 2500);
    } catch {
      // ignore
    } finally {
      setAddingToCart(null);
    }
  };

  // Sort products locally if backend sort is static
  const sortedProducts = useMemo(() => {
    const list = [...products];
    if (currentSort === "price-low") {
      return list.sort((a, b) => parseFloat(a.price || "0") - parseFloat(b.price || "0"));
    }
    if (currentSort === "price-high") {
      return list.sort((a, b) => parseFloat(b.price || "0") - parseFloat(a.price || "0"));
    }
    if (currentSort === "name") {
      return list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [products, currentSort]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20">
      {/* Header Banner */}
      <div className="border-b border-zinc-200 bg-white py-8 lg:py-10 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center justify-between">
            <div className="lg:col-span-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                VERIFIED HARDWARE STOREFRONT
              </div>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
                Electronic Components &amp; Modules
              </h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl">
                Procure traceable, factory-authenticated microcontrollers, power ICs, passives, and sensors with verified inventory and rapid dispatch across India.
              </p>

              {/* Verified Trust Strip */}
              <div className="mt-4 flex flex-wrap items-center gap-5 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Factory-Sealed Anti-Static Packaging
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  OEM Traceable MPNs
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Same-Day Dispatch Across India
                </span>
              </div>
            </div>

            {/* Quick Links & SMT Callout */}
            <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col items-start lg:items-end gap-3">
              <div className="flex items-center gap-3">
                <Link
                  href="/cart"
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  View Cart
                </Link>
                <Link
                  href="/manufacturing"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors"
                >
                  Custom Assembly &rarr;
                </Link>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">
                Need turnkey BOM kitting? Check out custom PCBA.
              </span>
            </div>
          </div>

          {/* Search & Sort Controls */}
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search by part number, name, or keyword..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-zinc-50 pl-10 pr-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-white dark:placeholder-zinc-500 dark:focus:bg-zinc-800"
              />
              <svg className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </form>

            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Sort by:</label>
              <select
                value={currentSort}
                onChange={(e) => updateFilters({ sort: e.target.value })}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              >
                <option value="featured">Featured</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="name">Name (A-Z)</option>
              </select>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="mt-6 flex flex-wrap items-center gap-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              onClick={() => updateFilters({ category: "all" })}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                currentCategory === "all"
                  ? "bg-zinc-900 text-white dark:bg-emerald-600 dark:text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              All Categories
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => updateFilters({ category: cat.id })}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  currentCategory === cat.id
                    ? "bg-zinc-900 text-white dark:bg-emerald-600 dark:text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-10">
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="h-80 rounded-2xl bg-zinc-200 animate-pulse dark:bg-zinc-900" />
            ))}
          </div>
        ) : sortedProducts.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-16 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <svg className="mx-auto h-12 w-12 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-white">No components found</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {currentSearch ? `No matches for "${currentSearch}".` : "Try selecting another category or clear your search filters."}
            </p>
            <button
              onClick={() => updateFilters({ search: null, category: "all" })}
              className="mt-6 inline-flex items-center rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedProducts.map((prod) => (
              <div
                key={prod.id}
                className="group flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-emerald-500/50 hover:shadow-md transition-all dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-500/50"
              >
                <div>
                  {/* Image Placeholder or Image */}
                  <Link href={`/products/${prod.slug || prod.id}`} className="block relative aspect-4/3 w-full overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
                    {(() => {
                      const imgSrc = (prod.images && prod.images.length > 0 ? prod.images[0] : null) || prod.primary_image_url;
                      return imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={prod.name}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "/images/brand/venopai_cart_icon.png";
                            (e.target as HTMLImageElement).className = "h-16 w-16 object-contain m-auto opacity-40 p-4";
                          }}
                          className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-zinc-400">
                          <img
                            src="/images/brand/venopai_cart_icon.png"
                            alt="VenoPai"
                            className="h-12 w-12 object-contain opacity-30"
                          />
                        </div>
                      );
                    })()}
                    <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-bold text-emerald-700 shadow-sm backdrop-blur dark:bg-zinc-900/90 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      In Stock
                    </span>
                  </Link>

                  {/* SKU & Category */}
                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
                    <span className="font-mono text-[11px] truncate max-w-[140px]">{prod.sku}</span>
                    {prod.category?.name && (
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {prod.category.name}
                      </span>
                    )}
                  </div>

                  {/* Title & Description */}
                  <Link href={`/products/${prod.slug || prod.id}`}>
                    <h3 className="mt-2 text-sm font-bold text-zinc-900 group-hover:text-emerald-600 transition-colors line-clamp-2 dark:text-white dark:group-hover:text-emerald-400">
                      {prod.name}
                    </h3>
                  </Link>
                  <p className="mt-1 text-xs text-zinc-500 line-clamp-2 dark:text-zinc-400">
                    {prod.description}
                  </p>

                  {/* Specs Pill List */}
                  {prod.specifications && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {Array.isArray(prod.specifications)
                        ? prod.specifications.slice(0, 2).map((s: { key?: string; name?: string; value?: unknown }, idx: number) => {
                            const k = s.key || s.name || `Spec ${idx + 1}`;
                            const v = s.value ?? "";
                            return (
                              <span
                                key={idx}
                                className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                              >
                                {k}: {String(v)}
                              </span>
                            );
                          })
                        : Object.entries(prod.specifications).slice(0, 2).map(([k, v]) => (
                            <span
                              key={k}
                              className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                            >
                              {k}: {String(v)}
                            </span>
                          ))}
                    </div>
                  )}
                </div>

                {/* Bottom Bar: Price & Add To Cart */}
                <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Unit Price</span>
                    <div className="text-base font-extrabold text-zinc-900 dark:text-white">
                      ₹{parseFloat(prod.price || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <button
                    onClick={() => handleAddToCart(prod)}
                    disabled={addingToCart === prod.id}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-all cursor-pointer"
                  >
                    {addingToCart === prod.id ? (
                      <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                    ) : cartSuccess === prod.id ? (
                      <span className="text-emerald-300">Added!</span>
                    ) : (
                      <>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Add</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {!loading && !error && products.length > 0 && (() => {
          const totalPages = pagination?.total_pages || 1;
          const totalItems = pagination?.total_items || products.length;
          const fromItem = pagination ? (pagination.page - 1) * pagination.page_size + 1 : (currentPage - 1) * 36 + 1;
          const toItem = pagination ? Math.min(pagination.page * pagination.page_size, pagination.total_items) : (currentPage - 1) * 36 + products.length;
          const hasPrev = pagination?.has_prev ?? currentPage > 1;
          const hasNext = pagination?.has_next ?? currentPage < totalPages;
          const pageRange = getPaginationRange(currentPage, totalPages);

          return (
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Showing <span className="font-semibold text-zinc-900 dark:text-white">{fromItem}–{toItem}</span> of{" "}
                <span className="font-semibold text-zinc-900 dark:text-white">{totalItems}</span> components
                {totalPages > 1 && (
                  <span className="ml-2 text-zinc-400">
                    (Page {currentPage} of {totalPages})
                  </span>
                )}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap justify-center">
                  <button
                    onClick={() => updateFilters({ page: String(Math.max(1, currentPage - 1)) })}
                    disabled={!hasPrev || loading}
                    className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-40 disabled:pointer-events-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                    aria-label="Previous page"
                  >
                    &larr; Prev
                  </button>

                  <div className="flex items-center gap-1">
                    {pageRange.map((p, idx) => {
                      if (typeof p === "string") {
                        return (
                          <span key={`ellipsis-${idx}`} className="px-2 py-1 text-xs text-zinc-400 font-mono">
                            ...
                          </span>
                        );
                      }
                      const isActive = p === currentPage;
                      return (
                        <button
                          key={`page-${p}`}
                          onClick={() => updateFilters({ page: String(p) })}
                          disabled={isActive || loading}
                          className={`h-8 min-w-[2rem] px-2 rounded-xl text-xs font-semibold transition-all ${
                            isActive
                              ? "bg-zinc-900 text-white shadow-sm dark:bg-emerald-600 dark:text-white pointer-events-none"
                              : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          }`}
                          aria-current={isActive ? "page" : undefined}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => updateFilters({ page: String(currentPage + 1) })}
                    disabled={!hasNext || loading}
                    className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-40 disabled:pointer-events-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                    aria-label="Next page"
                  >
                    Next &rarr;
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-12 text-center text-xs text-zinc-500">Loading catalog...</div>}>
      <ProductsContent />
    </React.Suspense>
  );
}

