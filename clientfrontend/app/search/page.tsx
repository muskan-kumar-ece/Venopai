"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient, PaginationMeta } from "@/lib/api/client";

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: string;
  stock_status: string;
  primary_image_url: string | null;
}

interface SuggestedCategory {
  id: string;
  name: string;
  slug: string;
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

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";
  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [suggestedCategories, setSuggestedCategories] = useState<SuggestedCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);

  // Filters and sorting
  const [sort, setSort] = useState<string>("relevance");
  const [availability, setAvailability] = useState<string>("");

  useEffect(() => {
    if (!q.trim() && !category.trim()) {
      setProducts([]);
      setSuggestedCategories([]);
      setPagination(null);
      setTotal(0);
      setLoading(false);
      return;
    }

    async function fetchSearch() {
      setLoading(true);
      setError(null);
      try {
        let endpoint = "";
        if (q.trim()) {
          endpoint = `/search/products?q=${encodeURIComponent(q.trim())}&sort=${sort}&page=${currentPage}&page_size=36`;
          if (availability) {
            endpoint += `&availability=${availability}`;
          }
          if (category.trim()) {
            endpoint += `&category=${encodeURIComponent(category.trim())}`;
          }
        } else {
          // Category-only browse via search route
          endpoint = `/products?category=${encodeURIComponent(category.trim())}&sort=${sort === "relevance" ? "newest" : sort}&page=${currentPage}&page_size=36`;
          if (availability) {
            endpoint += `&availability=${availability}`;
          }
        }
        const res = await apiClient.get(endpoint);
        setProducts(res?.data || []);
        setPagination(res?.pagination || null);
        setTotal(res?.pagination?.total_items || res?.data?.length || 0);
        setSuggestedCategories(res?.suggested_categories || []);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to fetch search results");
        }
      } finally {
        setLoading(false);
      }
    }

    fetchSearch();
  }, [q, category, sort, availability, currentPage]);

  const handlePageChange = (newPage: number) => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`/search?${params.toString()}`);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            {q ? (
              <>Search results for &ldquo;{q}&rdquo;</>
            ) : category ? (
              <>Products in Category &ldquo;{category}&rdquo;</>
            ) : (
              <>Catalog Search</>
            )}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {total} product{total === 1 ? "" : "s"} found
          </p>
        </div>

        {/* Filters and sorting */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={availability}
            onChange={(e) => {
              setAvailability(e.target.value);
              const params = new URLSearchParams(searchParams.toString());
              if (e.target.value) params.set("availability", e.target.value);
              else params.delete("availability");
              params.delete("page");
              router.push(`/search?${params.toString()}`);
            }}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            <option value="">All Availability</option>
            <option value="in_stock">In Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>

          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              const params = new URLSearchParams(searchParams.toString());
              if (e.target.value) params.set("sort", e.target.value);
              else params.delete("sort");
              params.delete("page");
              router.push(`/search?${params.toString()}`);
            }}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            <option value="relevance">Relevance</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && products.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <div
              key={p.id}
              className="group flex flex-col justify-between overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div>
                <div className="aspect-square w-full overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  {p.primary_image_url ? (
                    <img
                      src={p.primary_image_url}
                      alt={p.name}
                      className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <span className="text-xs text-zinc-400">No Image</span>
                  )}
                </div>
                <h3 className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {p.name}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {p.description}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div>
                  <span className="text-lg font-bold text-zinc-900 dark:text-white">
                    ₹{p.price}
                  </span>
                  <div className="mt-0.5">
                    {p.stock_status === "in_stock" ? (
                      <span className="inline-flex items-center text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        ● In Stock
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[10px] font-medium text-zinc-500">
                        ○ Out of Stock
                      </span>
                    )}
                  </div>
                </div>

                <Link
                  href={`/cart`}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
                >
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && !error && products.length > 0 && (() => {
        const totalPages = pagination?.total_pages || 1;
        const totalItems = pagination?.total_items || total;
        const fromItem = pagination ? (pagination.page - 1) * pagination.page_size + 1 : (currentPage - 1) * 36 + 1;
        const toItem = pagination ? Math.min(pagination.page * pagination.page_size, totalItems) : (currentPage - 1) * 36 + products.length;
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
                  onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                  disabled={!hasPrev || loading}
                  className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-40 disabled:pointer-events-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
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
                        onClick={() => handlePageChange(p)}
                        disabled={isActive || loading}
                        className={`h-8 min-w-[2rem] px-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
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
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!hasNext || loading}
                  className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-40 disabled:pointer-events-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  aria-label="Next page"
                >
                  Next &rarr;
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* SRCH-002: Empty state with suggested categories */}
      {!loading && !error && products.length === 0 && (
        <div className="my-12 rounded-2xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            No products match your search
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            We couldn&apos;t find anything for &ldquo;{q}&rdquo;. Try browsing one of our top categories below:
          </p>

          {suggestedCategories.length > 0 && (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {suggestedCategories.map((cat) => (
                <Link
                  key={cat.id}
                  href={cat.slug ? `/products/category/${cat.slug}` : `/products?category=${cat.id}`}
                  className="rounded-full border border-zinc-200 bg-white px-4 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  {cat.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-zinc-500">Loading search...</div>}>
      <SearchContent />
    </Suspense>
  );
}
