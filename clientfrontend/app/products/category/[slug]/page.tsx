"use client";

import React, { useEffect, useState, use, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient, cartApi, PaginationMeta } from "@/lib/api/client";

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
  stock_status?: string;
  specifications?: Record<string, string>;
  category?: { id: string; name: string; slug?: string };
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  children?: { id: string; name: string; slug: string }[];
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

function CategoryProductsContent({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  const [category, setCategory] = useState<Category | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Sort
  const [searchFilter, setSearchFilter] = useState("");
  const [sortBy, setSortBy] = useState<string>("featured");
  const [addingToCart, setAddingToCart] = useState<string | null>(null);
  const [cartSuccess, setCartSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadCategoryData() {
      setLoading(true);
      setError(null);
      try {
        // Fetch category details and products for this category slug (36 items per page)
        const res = await apiClient.get(`/categories/${encodeURIComponent(slug)}?page=${currentPage}&page_size=36`);
        if (res?.data) {
          setCategory(res.data.category || null);
          setProducts(res.data.products || []);
          if (res.data.pagination) {
            setPagination(res.data.pagination);
          } else if (res.pagination) {
            setPagination(res.pagination);
          } else {
            setPagination(null);
          }
        } else {
          setError("Category not found or inactive.");
          setCategory(null);
          setProducts([]);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Category could not be loaded.");
        setCategory(null);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }

    if (slug) {
      loadCategoryData();
    }
  }, [slug, currentPage]);

  const handlePageChange = (newPage: number) => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    router.push(`/products/category/${slug}?page=${newPage}`);
  };

  const handleAddToCart = async (product: Product) => {
    setAddingToCart(product.id);
    setCartSuccess(null);
    try {
      await cartApi.addItem({ product_id: product.id, quantity: 1 });
      setCartSuccess(product.id);
      window.dispatchEvent(new Event("cart_updated"));
      setTimeout(() => setCartSuccess(null), 3000);
    } catch {
      alert("Failed to add component to cart. Please sign in or try again.");
    } finally {
      setAddingToCart(null);
    }
  };

  // Filter and sort products
  const filteredProducts = products.filter((p) => {
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      (p.sku && p.sku.toLowerCase().includes(term)) ||
      (p.description && p.description.toLowerCase().includes(term))
    );
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === "price-low") return parseFloat(a.price) - parseFloat(b.price);
    if (sortBy === "price-high") return parseFloat(b.price) - parseFloat(a.price);
    if (sortBy === "name") return a.name.localeCompare(b.name);
    return 0; // featured/default
  });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Breadcrumbs Header */}
      <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <Link href="/" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
              Home
            </Link>
            <span>/</span>
            <Link href="/products" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
              Hardware Catalog
            </Link>
            <span>/</span>
            <span className="font-semibold text-zinc-900 dark:text-white">
              {category?.name || slug}
            </span>
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Category Header Hero */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Verified Component Family
              </div>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
                {category?.name || slug.replace(/-/g, " ")}
              </h1>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {category?.description ||
                  `Explore genuine hardware, microcontrollers, and engineering modules verified for rapid PCB prototyping and production.`}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/cart"
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                View Cart
              </Link>
              <Link
                href="/products"
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition"
              >
                All Categories &rarr;
              </Link>
            </div>
          </div>

          {/* Child subcategories if available */}
          {category?.children && category.children.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mr-1">Subcategories:</span>
              {category.children.map((sub) => (
                <Link
                  key={sub.id}
                  href={`/products/category/${sub.slug}`}
                  className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-400 transition"
                >
                  {sub.name}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Filter & Search Bar */}
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder={`Filter within ${category?.name || "category"}...`}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 bg-white pl-10 pr-4 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500"
            />
            <svg className="absolute left-3.5 top-2.5 h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Showing <strong className="text-zinc-900 dark:text-white">{sortedProducts.length}</strong> components
            </span>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Sort:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              >
                <option value="featured">Featured</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="name">Name (A-Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Products Grid / States */}
        {loading ? (
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="aspect-4/3 w-full rounded-xl bg-zinc-200 dark:bg-zinc-800" />
                <div className="mt-4 h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="mt-2 h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="mt-4 flex items-center justify-between">
                  <div className="h-5 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-8 w-24 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="mt-12 rounded-3xl border border-dashed border-red-300 bg-red-50/50 p-12 text-center dark:border-red-900/50 dark:bg-red-950/20">
            <h3 className="text-base font-bold text-red-900 dark:text-red-400">Category Unavailable</h3>
            <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                href="/products"
                className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                Browse All Hardware
              </Link>
            </div>
          </div>
        ) : sortedProducts.length === 0 ? (
          <div className="mt-12 rounded-3xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
              <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-bold text-zinc-900 dark:text-white">No products found</h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {searchFilter
                ? `No components matched "${searchFilter}" in this category.`
                : "No active products are currently assigned to this category."}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter("")}
                  className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                >
                  Clear Search
                </button>
              )}
              <Link
                href="/products"
                className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                View Full Catalog
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedProducts.map((prod) => (
              <div
                key={prod.id}
                className="group flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-emerald-500/50 hover:shadow-md transition-all dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-500/50"
              >
                <div>
                  <Link
                    href={`/products/${prod.slug || prod.id}`}
                    className="block relative aspect-4/3 w-full overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800"
                  >
                    {(() => {
                      const imgSrc =
                        (prod.images && prod.images.length > 0 ? prod.images[0] : null) ||
                        prod.primary_image_url;
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

                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
                    <span className="font-mono text-[11px] truncate max-w-[140px]">{prod.sku || "VNP-HW"}</span>
                    {prod.category?.name && (
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {prod.category.name}
                      </span>
                    )}
                  </div>

                  <Link href={`/products/${prod.slug || prod.id}`}>
                    <h3 className="mt-2 text-sm font-bold text-zinc-900 group-hover:text-emerald-600 transition-colors line-clamp-2 dark:text-white dark:group-hover:text-emerald-400">
                      {prod.name}
                    </h3>
                  </Link>

                  <p className="mt-1 text-xs text-zinc-500 line-clamp-2 dark:text-zinc-400">
                    {prod.description}
                  </p>
                </div>

                <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-zinc-400 font-mono">Price (incl. tax)</span>
                      <div className="text-base font-black text-zinc-900 dark:text-white">
                        ₹{prod.price}
                      </div>
                    </div>

                    <button
                      onClick={() => handleAddToCart(prod)}
                      disabled={addingToCart === prod.id}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all shadow-sm cursor-pointer ${
                        cartSuccess === prod.id
                          ? "bg-emerald-600 text-white"
                          : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                      }`}
                    >
                      {addingToCart === prod.id ? (
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border border-white border-t-transparent" />
                      ) : cartSuccess === prod.id ? (
                        <>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Added
                        </>
                      ) : (
                        <>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                          Add to Cart
                        </>
                      )}
                    </button>
                  </div>
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
      </div>
    </div>
  );
}

export default function CategoryProductsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;

  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-12 text-center text-xs text-zinc-500">Loading category components...</div>}>
      <CategoryProductsContent slug={slug} />
    </Suspense>
  );
}
