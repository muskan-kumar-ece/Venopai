"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api/client";

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

function SearchContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";
  const [products, setProducts] = useState<Product[]>([]);
  const [suggestedCategories, setSuggestedCategories] = useState<SuggestedCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);

  // Filters and sorting
  const [sort, setSort] = useState<string>("relevance");
  const [availability, setAvailability] = useState<string>("");

  useEffect(() => {
    if (!q.trim()) {
      setProducts([]);
      setSuggestedCategories([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    async function fetchSearch() {
      setLoading(true);
      setError(null);
      try {
        let endpoint = `/search/products?q=${encodeURIComponent(q.trim())}&sort=${sort}`;
        if (availability) {
          endpoint += `&availability=${availability}`;
        }
        const res = await apiClient.get(endpoint);
        setProducts(res?.data || []);
        setTotal(res?.pagination?.total_items || 0);
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
  }, [q, sort, availability]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Search results for &ldquo;{q}&rdquo;
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {total} product{total === 1 ? "" : "s"} found
          </p>
        </div>

        {/* Filters and sorting */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            <option value="">All Availability</option>
            <option value="in_stock">In Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
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
                  href={`/?category=${cat.id}`}
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
