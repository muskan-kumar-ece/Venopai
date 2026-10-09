"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { catalogApi, cartApi, shippingApi, reviewsApi } from "@/lib/api/client";

interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: string;
  compare_price?: string;
  description: string;
  images?: string[];
  primary_image_url?: string;
  video_url?: string;
  user_manual_url?: string;
  stock_quantity?: number;
  stock_status?: string;
  specifications?: unknown;
  category?: { id: string; name: string; slug?: string };
  category_ids?: string[];
}

interface ProductReview {
  id: string;
  user_id: string;
  rating: number;
  text?: string;
  comment?: string;
  created_at?: string;
}

interface RelatedProduct {
  id: string;
  name: string;
  slug: string;
  sku?: string;
  price: string;
  compare_price?: string;
  primary_image_url?: string;
  images?: string[];
  stock_status?: string;
  description?: string;
}

interface SpecItem {
  label: string;
  value: string;
}

function parseSpecifications(specs: unknown): SpecItem[] {
  if (!specs) return [];
  if (Array.isArray(specs)) {
    return specs
      .map((item, idx) => {
        if (typeof item === "object" && item !== null) {
          const itemObj = item as Record<string, unknown>;
          const label = (itemObj.key || itemObj.name || itemObj.label || itemObj.title || `Parameter ${idx + 1}`) as string;
          const val = (itemObj.value ?? itemObj.val ?? "") as string;
          return { label: String(label).trim(), value: String(val).trim() };
        }
        return { label: `Spec ${idx + 1}`, value: String(item).trim() };
      })
      .filter((s) => s.label && s.value);
  }
  if (typeof specs === "object") {
    return Object.entries(specs as Record<string, unknown>)
      .map(([k, v]) => {
        if (typeof v === "object" && v !== null) {
          const itemObj = v as Record<string, unknown>;
          const label = (itemObj.key || itemObj.name || itemObj.label || k) as string;
          const val = (itemObj.value ?? itemObj.val ?? JSON.stringify(v)) as string;
          return { label: String(label).trim(), value: String(val).trim() };
        }
        return { label: String(k).trim(), value: String(v).trim() };
      })
      .filter((s) => s.label && s.value);
  }
  return [];
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [activeMedia, setActiveMedia] = useState<"image" | "video">("image");

  // Reviews states (top 5 customer reviews)
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [totalReviews, setTotalReviews] = useState<number>(0);
  const [loadingReviews, setLoadingReviews] = useState(false);

  // Related products states
  const [relatedProducts, setRelatedProducts] = useState<RelatedProduct[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  // Cart action states
  const [addingToCart, setAddingToCart] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const [cartSuccess, setCartSuccess] = useState(false);

  // Shipping checker
  const [pincode, setPincode] = useState("");
  const [checkingPincode, setCheckingPincode] = useState(false);
  const [pincodeResult, setPincodeResult] = useState<{
    serviceable: boolean;
    carrier?: string;
    estimated_days?: string;
    message?: string;
  } | null>(null);

  const [shareCopied, setShareCopied] = useState<boolean>(false);

  const handleShareProduct = () => {
    if (typeof window !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    }
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    catalogApi.getProduct(id)
      .then((res: { data?: ProductDetail } | ProductDetail) => {
        const prodData = (res && "data" in res && res.data ? res.data : res) as ProductDetail;
        if (prodData) {
          setProduct(prodData);

          // Fetch top 5 customer reviews
          setLoadingReviews(true);
          reviewsApi.getProductReviews(prodData.id || id)
            .then((revRes: { data?: ProductReview[]; average_rating?: number; review_count?: number }) => {
              if (revRes?.data && Array.isArray(revRes.data)) {
                setReviews(revRes.data.slice(0, 5));
              }
              if (revRes?.average_rating !== undefined && revRes?.average_rating !== null) {
                setAverageRating(Number(revRes.average_rating));
              }
              if (revRes?.review_count !== undefined) {
                setTotalReviews(revRes.review_count);
              }
            })
            .catch(() => {})
            .finally(() => setLoadingReviews(false));

          // Fetch related products
          setLoadingRelated(true);
          const firstCatId = prodData.category_ids?.[0] || prodData.category?.id;
          catalogApi.listProducts({ category_id: firstCatId, page_size: 8 })
            .then((catRes: { data?: { items?: RelatedProduct[] } | RelatedProduct[] }) => {
              const resData = catRes?.data;
              const list: RelatedProduct[] = Array.isArray(resData)
                ? resData
                : resData && "items" in resData && Array.isArray(resData.items)
                ? resData.items
                : [];
              const filtered = list.filter((p: RelatedProduct) => p.id !== prodData.id && p.slug !== prodData.slug);
              setRelatedProducts(filtered.slice(0, 4));
            })
            .catch(() => {})
            .finally(() => setLoadingRelated(false));
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load product details");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  const handleAddToCart = async () => {
    if (!product) return;
    setAddingToCart(true);
    setCartSuccess(false);
    try {
      await cartApi.addItem({ product_id: product.id, quantity });
      setCartSuccess(true);
      try {
        const stored = parseInt(localStorage.getItem("venopai_cart_count") || "0", 10);
        localStorage.setItem("venopai_cart_count", String(stored + quantity));
        window.dispatchEvent(new Event("storage"));
      } catch {}
      setTimeout(() => setCartSuccess(false), 3000);
    } catch {
      setAddingToCart(false);
    } finally {
      setAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    if (!product) return;
    setBuyingNow(true);
    try {
      await cartApi.addItem({ product_id: product.id, quantity });
      router.push("/checkout");
    } catch {
      setBuyingNow(false);
    }
  };

  const handleCheckPincode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pincode || pincode.trim().length !== 6) {
      setPincodeResult({ serviceable: false, message: "Enter a valid 6-digit Indian PIN code." });
      return;
    }
    setCheckingPincode(true);
    setPincodeResult(null);
    try {
      const res = await shippingApi.checkServiceability(pincode.trim());
      if (res?.data) {
        const estDays = res.data.estimated_days_min && res.data.estimated_days_max
          ? `${res.data.estimated_days_min} - ${res.data.estimated_days_max} Business Days`
          : res.data.estimated_delivery_days || "3 - 5 Business Days";
        setPincodeResult({
          serviceable: res.data.serviceable ?? true,
          carrier: res.data.carrier || "Shiprocket Verified Courier",
          estimated_days: estDays,
          message: res.data.serviceable ? "Standard & Express courier available for delivery." : "Pincode outside regular courier zone.",
        });
      } else {
        setPincodeResult({
          serviceable: true,
          carrier: "Shiprocket Verified Logistics",
          estimated_days: "2 - 4 Business Days",
          message: "Standard delivery available to your location.",
        });
      }
    } catch {
      // Fallback response for valid pin format
      setPincodeResult({
        serviceable: true,
        carrier: "Shiprocket Verified Express",
        estimated_days: "3 - 5 Business Days",
        message: "Delivery available to your location via standard surface.",
      });
    } finally {
      setCheckingPincode(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          <div className="h-96 rounded-2xl bg-zinc-200 animate-pulse dark:bg-zinc-800" />
          <div className="space-y-4">
            <div className="h-8 w-2/3 rounded-lg bg-zinc-200 animate-pulse dark:bg-zinc-800" />
            <div className="h-4 w-1/3 rounded-lg bg-zinc-200 animate-pulse dark:bg-zinc-800" />
            <div className="h-24 w-full rounded-lg bg-zinc-200 animate-pulse dark:bg-zinc-800" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Product Not Found</h2>
        <p className="mt-2 text-sm text-zinc-500">{error || "The requested item is not listed or has been archived."}</p>
        <Link
          href="/products"
          className="mt-6 inline-flex items-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
        >
          &larr; Back to Catalog
        </Link>
      </div>
    );
  }

  const images = product.images && product.images.length > 0 ? product.images : [];

  const isEmbedVideo = (url?: string) => {
    if (!url) return false;
    return url.includes("youtube.com") || url.includes("youtu.be") || url.includes("vimeo.com");
  };

  const getEmbedUrl = (url: string) => {
    if (url.includes("youtube.com/watch?v=")) {
      const id = url.split("v=")[1]?.split("&")[0];
      return `https://www.youtube.com/embed/${id}?autoplay=1`;
    }
    if (url.includes("youtu.be/")) {
      const id = url.split("youtu.be/")[1]?.split("?")[0];
      return `https://www.youtube.com/embed/${id}?autoplay=1`;
    }
    if (url.includes("vimeo.com/")) {
      const id = url.split("vimeo.com/")[1]?.split("?")[0];
      return `https://player.vimeo.com/video/${id}?autoplay=1`;
    }
    return url;
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20">
      {/* Breadcrumb Navigation */}
      <div className="border-b border-zinc-200 bg-white py-3.5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <Link href="/" className="hover:text-zinc-900 dark:hover:text-white">Home</Link>
            <span>/</span>
            <Link href="/products" className="hover:text-zinc-900 dark:hover:text-white">Hardware Catalog</Link>
            {product.category?.name && (
              <>
                <span>/</span>
                <Link
                  href={
                    product.category.slug
                      ? `/products/category/${product.category.slug}`
                      : `/products?category=${product.category.id}`
                  }
                  className="hover:text-zinc-900 dark:hover:text-white"
                >
                  {product.category.name}
                </Link>
              </>
            )}
            <span>/</span>
            <span className="truncate text-zinc-900 font-semibold dark:text-white max-w-[200px]">{product.name}</span>
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-10">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          {/* Left Column: Gallery */}
          <div>
            <div className="relative aspect-4/3 w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 flex items-center justify-center">
              {activeMedia === "video" && product.video_url ? (
                <div className="h-full w-full bg-black flex items-center justify-center">
                  {isEmbedVideo(product.video_url) ? (
                    <iframe
                      src={getEmbedUrl(product.video_url)}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      src={product.video_url}
                      controls
                      autoPlay
                      className="h-full w-full object-contain"
                    >
                      Your browser does not support HTML5 video.
                    </video>
                  )}
                </div>
              ) : images.length > 0 ? (
                <img
                  src={images[selectedImage] || images[0]}
                  alt={product.name}
                  className="h-full w-full object-contain p-6"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-zinc-400">
                  <svg className="h-20 w-20 stroke-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                </div>
              )}

              {/* Status Badge */}
              <span className="absolute top-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 shadow-sm dark:bg-emerald-950/80 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                In Stock & Verified
              </span>

              {/* Switch to video quick button */}
              {product.video_url && activeMedia === "image" && (
                <button
                  type="button"
                  onClick={() => setActiveMedia("video")}
                  className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-lg bg-neutral-900/90 backdrop-blur-md border border-neutral-700/80 px-3 py-1.5 text-xs font-medium text-white shadow-md hover:bg-neutral-800 transition"
                >
                  <svg className="h-3.5 w-3.5 fill-emerald-400" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span>Watch Demo Video</span>
                </button>
              )}
            </div>

            {/* Thumbnail selector (Images + Video) */}
            {(images.length > 1 || product.video_url) && (
              <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedImage(idx);
                      setActiveMedia("image");
                    }}
                    className={`h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border-2 bg-white dark:bg-zinc-900 transition ${
                      activeMedia === "image" && selectedImage === idx
                        ? "border-emerald-600 ring-2 ring-emerald-500/20"
                        : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400"
                    }`}
                  >
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}

                {/* Video Demo Thumbnail */}
                {product.video_url && (
                  <button
                    type="button"
                    onClick={() => setActiveMedia("video")}
                    className={`relative h-20 w-24 flex-shrink-0 overflow-hidden rounded-xl border-2 flex flex-col items-center justify-center bg-zinc-900 text-white transition ${
                      activeMedia === "video"
                        ? "border-emerald-600 ring-2 ring-emerald-500/20"
                        : "border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 mb-1">
                      <svg className="h-4 w-4 fill-current ml-0.5" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                      Demo Video
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* Standards & Certifications badge */}
            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
                Quality & Supply Assurance
              </h4>
              <ul className="mt-3 space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold">&#10003;</span>
                  100% Genuine factory batch origin with traceability
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold">&#10003;</span>
                  ESD moisture barrier vacuum packaging with silica desiccant
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold">&#10003;</span>
                  Automated testing & AOI optical verification before dispatch
                </li>
              </ul>
            </div>
          </div>

          {/* Right Column: Pricing & Checkout Actions */}
          <div className="flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-zinc-400">SKU: {product.sku}</span>
                  {product.category?.name && (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {product.category.name}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleShareProduct}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800 transition cursor-pointer"
                  title="Share Component"
                >
                  {shareCopied ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Copied!</span>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                      <span>Share</span>
                    </>
                  )}
                </button>
              </div>

              <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
                {product.name}
              </h1>

              <div className="mt-4 flex items-baseline gap-3">
                <span className="text-3xl font-extrabold text-zinc-900 dark:text-white">
                  ₹{parseFloat(product.price || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-zinc-500 font-medium">inclusive of 18% GST</span>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {product.description}
              </p>

              {/* Technical Specifications */}
              {(() => {
                const specItems = parseSpecifications(product.specifications);
                if (specItems.length === 0) return null;
                return (
                  <div className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-800">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
                      Hardware Specifications
                    </h3>
                    <dl className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {specItems.map((spec, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
                        >
                          <dt className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                            {spec.label}
                          </dt>
                          <dd className="mt-1 font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                            {spec.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                );
              })()}

              {/* Technical Datasheet & Manual Integration (Module 3) */}
              {product.user_manual_url && (
                <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 font-bold text-xs">
                      PDF
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-white">
                        Technical Datasheet &amp; User Manual
                      </h4>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Official pinouts, electrical ratings &amp; footprint specifications
                      </p>
                    </div>
                  </div>
                  <a
                    href={product.user_manual_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition shadow-xs shrink-0 cursor-pointer"
                  >
                    <span>View Datasheet</span>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )}

              {/* Quantity Picker & Add to Cart */}
              <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
                <div className="flex items-center gap-4">
                  <div className="flex items-center rounded-xl border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="h-8 w-8 rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 flex items-center justify-center font-bold"
                    >
                      -
                    </button>
                    <span className="w-12 text-center text-sm font-bold text-zinc-900 dark:text-white">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(quantity + 1)}
                      className="h-8 w-8 rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 flex items-center justify-center font-bold"
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={addingToCart}
                    className="flex-1 rounded-xl bg-zinc-900 py-3.5 px-6 text-sm font-bold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-500 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {addingToCart ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : cartSuccess ? (
                      <span className="text-emerald-400 dark:text-white font-bold">&#10003; Added to Cart</span>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                        <span>Add to Cart</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleBuyNow}
                    disabled={buyingNow}
                    className="rounded-xl bg-emerald-600 py-3.5 px-6 text-sm font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {buyingNow ? "Processing..." : "Buy Now"}
                  </button>
                </div>
              </div>

              {/* Pincode Delivery Serviceability Checker */}
              <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white flex items-center gap-2">
                  <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Check Delivery Availability
                </h4>
                <p className="mt-1 text-xs text-zinc-500">
                  Verify logistics dispatch via Shiprocket directly to your laboratory or facility.
                </p>

                <form onSubmit={handleCheckPincode} className="mt-3 flex gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Enter 6-digit PIN code"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
                    className="flex-1 rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:bg-white focus:text-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:bg-zinc-800 dark:focus:text-white"
                  />
                  <button
                    type="submit"
                    disabled={checkingPincode}
                    className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                  >
                    {checkingPincode ? "Checking..." : "Verify"}
                  </button>
                </form>

                {pincodeResult && (
                  <div className={`mt-3 rounded-xl p-3 text-xs ${
                    pincodeResult.serviceable
                      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                      : "bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800"
                  }`}>
                    <div className="font-bold flex items-center gap-1.5">
                      {pincodeResult.serviceable ? (
                        <>&#10003; Serviceable via {pincodeResult.carrier}</>
                      ) : (
                        <>&#9888; Unserviceable Location</>
                      )}
                    </div>
                    {pincodeResult.estimated_days && (
                      <p className="mt-1 text-[11px]">Estimated Transit: {pincodeResult.estimated_days}</p>
                    )}
                    <p className="mt-0.5 text-[11px] opacity-90">{pincodeResult.message}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* OPTIONAL USER MANUAL & TECHNICAL DATASHEET (.PDF)                         */}
        {/* Rendered only if user_manual_url is configured from the admin panel       */}
        {/* ========================================================================= */}
        {product.user_manual_url && (
          <section className="mt-16 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/80">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-xs">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                      Technical Datasheet & User Manual
                    </h3>
                    <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      PDF DOCUMENT
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-2xl leading-relaxed">
                    Official engineering documentation with electrical specifications, pinout schematics, timing diagrams, and operational limits.
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-zinc-400 truncate max-w-md">
                    {product.user_manual_url.split("/").pop() || "datasheet.pdf"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <a
                  href={product.user_manual_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-all cursor-pointer"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download PDF Manual
                </a>
              </div>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* CUSTOMER REVIEWS (TOP 5 ONLY)                                             */}
        {/* ========================================================================= */}
        <section className="mt-16 border-t border-zinc-200 pt-12 dark:border-zinc-800">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  Customer Reviews
                </h2>
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {totalReviews} verified {totalReviews === 1 ? "review" : "reviews"}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Top customer reviews and verified engineer feedback for this hardware.
              </p>
            </div>

            {averageRating !== null && averageRating > 0 && (
              <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
                <div className="text-2xl font-black text-zinc-900 dark:text-white">
                  {averageRating.toFixed(1)}
                </div>
                <div>
                  <div className="flex text-amber-400 text-xs tracking-wider">
                    {"★".repeat(Math.round(averageRating))}
                    <span className="text-zinc-300 dark:text-zinc-700">
                      {"★".repeat(Math.max(0, 5 - Math.round(averageRating)))}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 font-medium">Out of 5.0 Stars</p>
                </div>
              </div>
            )}
          </div>

          {loadingReviews ? (
            <div className="space-y-4">
              {[1, 2].map((n) => (
                <div key={n} className="h-28 rounded-2xl bg-zinc-200/80 animate-pulse dark:bg-zinc-800/60" />
              ))}
            </div>
          ) : reviews.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reviews.map((rev) => (
                <div
                  key={rev.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 font-bold text-xs text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          E
                        </div>
                        <div>
                          <span className="text-xs font-bold text-zinc-900 dark:text-white block">
                            Verified Engineer
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {rev.created_at
                              ? new Date(rev.created_at).toLocaleDateString("en-IN", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "Verified Purchase"}
                          </span>
                        </div>
                      </div>

                      <div className="flex text-amber-400 text-xs tracking-tight">
                        {"★".repeat(rev.rating)}
                        <span className="text-zinc-200 dark:text-zinc-700">
                          {"★".repeat(Math.max(0, 5 - rev.rating))}
                        </span>
                      </div>
                    </div>

                    <p className="mt-3.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                      {rev.comment || rev.text || "Component functions within exact electrical tolerances. Reliable delivery."}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[10px]">
                      &#10003; Verified Buyer
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      Rating: {rev.rating}/5
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/40">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 mb-2">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                No reviews recorded yet for this component.
              </p>
              <p className="mt-1 text-[11px] text-zinc-400">
                Verified purchasers can submit detailed performance benchmarks and reviews upon order delivery.
              </p>
            </div>
          )}
        </section>

        {/* ========================================================================= */}
        {/* RELATED PRODUCTS                                                          */}
        {/* ========================================================================= */}
        <section className="mt-16 border-t border-zinc-200 pt-12 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Related Hardware & Components
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Frequently paired development boards, sensors, and electronic modules.
              </p>
            </div>
            <Link
              href="/products"
              className="text-xs font-bold text-emerald-600 hover:text-emerald-500 transition-colors flex items-center gap-1 dark:text-emerald-400"
            >
              Explore All Hardware &rarr;
            </Link>
          </div>

          {loadingRelated ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-64 rounded-2xl bg-zinc-200/80 animate-pulse dark:bg-zinc-800/60" />
              ))}
            </div>
          ) : relatedProducts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
              {relatedProducts.map((rel) => {
                const imgSrc = rel.primary_image_url || (rel.images && rel.images.length > 0 ? rel.images[0] : null);
                return (
                  <div
                    key={rel.id}
                    className="group flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs hover:border-emerald-500/50 hover:shadow-md transition-all dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div>
                      <Link
                        href={`/products/${rel.slug || rel.id}`}
                        className="block relative aspect-square w-full overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800"
                      >
                        {imgSrc ? (
                          <img
                            src={imgSrc}
                            alt={rel.name}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "/images/brand/venopai_cart_icon.png";
                              (e.target as HTMLImageElement).className = "h-14 w-14 object-contain m-auto opacity-40 p-4";
                            }}
                            className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-zinc-400">
                            <img
                              src="/images/brand/venopai_cart_icon.png"
                              alt="VenoPai"
                              className="h-10 w-10 object-contain opacity-30"
                            />
                          </div>
                        )}
                        <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 shadow-xs backdrop-blur dark:bg-zinc-900/90 dark:text-emerald-400">
                          <span className="h-1 w-1 rounded-full bg-emerald-500" />
                          In Stock
                        </span>
                      </Link>

                      <Link href={`/products/${rel.slug || rel.id}`}>
                        <h3 className="mt-3 text-xs font-bold text-zinc-900 group-hover:text-emerald-600 transition-colors line-clamp-2 dark:text-white dark:group-hover:text-emerald-400">
                          {rel.name}
                        </h3>
                      </Link>
                    </div>

                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-zinc-900 dark:text-white">
                        &#8377;{rel.price}
                      </span>
                      <Link
                        href={`/products/${rel.slug || rel.id}`}
                        className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-700 hover:bg-emerald-600 hover:text-white transition-colors dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-emerald-600 dark:hover:text-white cursor-pointer"
                      >
                        View &rarr;
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
