"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { catalogApi, cartApi } from "@/lib/api/client";

interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: string;
  description: string;
  primary_image_url?: string;
  images?: string[];
  stock_quantity?: number;
  specifications?: Array<{ key?: string; name?: string; value?: unknown }> | Record<string, unknown>;
  category?: { id: string; name: string; slug?: string };
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [addingToCart, setAddingToCart] = useState<string | null>(null);
  const [cartFeedback, setCartFeedback] = useState<string | null>(null);

  useEffect(() => {
    // Load categories and products concurrently
    const loadData = async () => {
      try {
        const [catRes, prodRes] = await Promise.allSettled([
          catalogApi.listCategories(),
          catalogApi.listProducts({ page_size: 12 }),
        ]);

        if (catRes.status === "fulfilled" && catRes.value?.data) {
          setCategories(catRes.value.data);
        }
        if (prodRes.status === "fulfilled" && prodRes.value?.data) {
          setProducts(prodRes.value.data);
        }
      } catch {
        // ignore errors
      } finally {
        setLoadingProducts(false);
      }
    };
    loadData();
  }, []);

  const handleAddToCart = async (product: Product) => {
    setAddingToCart(product.id);
    setCartFeedback(null);
    try {
      await cartApi.addItem({ product_id: product.id, quantity: 1 });
      setCartFeedback(`Added "${product.name}" to cart`);
      // Update local storage count
      const current = parseInt(localStorage.getItem("venopai_cart_count") || "0", 10);
      localStorage.setItem("venopai_cart_count", String(current + 1));
      window.dispatchEvent(new Event("storage"));
      setTimeout(() => setCartFeedback(null), 3500);
    } catch {
      setCartFeedback("Failed to add to cart");
      setTimeout(() => setCartFeedback(null), 3000);
    } finally {
      setAddingToCart(null);
    }
  };

  const filteredProducts =
    selectedCategory === "all"
      ? products
      : products.filter(
          (p) =>
            p.category?.id === selectedCategory ||
            p.category?.slug === selectedCategory
        );

  return (
    <div className="flex flex-col min-h-screen">
      {/* Toast Feedback */}
      {cartFeedback && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white shadow-xl dark:bg-emerald-600">
          <svg className="h-5 w-5 text-emerald-400 dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>{cartFeedback}</span>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-zinc-200 bg-white py-16 lg:py-24 dark:border-zinc-800 dark:bg-zinc-950">
        {/* Subtle Ambient Background Gradients */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-tr from-emerald-500/10 via-blue-500/10 to-orange-500/10 blur-3xl pointer-events-none rounded-full" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Left Column: Core Value Proposition */}
            <div className="lg:col-span-7 flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 w-fit">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                INTEGRATED HARDWARE PLATFORM
              </div>

              <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl dark:text-white leading-[1.1]">
                Turn Electronics Concepts into Production Silicon
              </h1>

              <p className="mt-5 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400 max-w-2xl">
                From schematic capture and high-speed PCB design to rapid multi-layer fabrication, firmware bring-up, and direct-to-bench component delivery.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/products"
                  className="rounded-xl bg-zinc-900 px-6 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors cursor-pointer"
                >
                  Explore Hardware Catalog
                </Link>
                <Link
                  href="/manufacturing"
                  className="rounded-xl border border-zinc-300 bg-white px-6 py-3.5 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Request Custom Manufacturing
                </Link>
              </div>

              {/* Micro Trust Strip */}
              <div className="mt-10 flex flex-wrap items-center gap-6 border-t border-zinc-100 pt-6 text-xs text-zinc-500 dark:border-zinc-900 dark:text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>IPC-A-610 Class 2 &amp; 3</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>ISO 9001 Certified Lines</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Automated DFM Validation</span>
                </div>
              </div>
            </div>

            {/* Right Column: Hero Showcase Visual Card */}
            <div className="lg:col-span-5 relative">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-emerald-500/20 via-blue-500/20 to-orange-500/20 blur-xl opacity-70" />

                <div className="relative rounded-3xl border border-zinc-200/80 bg-white p-3 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900/90 overflow-hidden backdrop-blur-sm">
                  {/* Official Brand Lockup Graphic */}
                  <div className="relative aspect-4/3 w-full overflow-hidden rounded-2xl bg-zinc-950">
                    <img
                      src="/images/brand/venopai_brand_card.jpg"
                      alt="VenoPai - Tech Today. Brighter Tomorrow."
                      className="h-full w-full object-cover object-center"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent pointer-events-none" />

                    {/* Floating Real-Time Status Chips */}
                    <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-zinc-900/90 backdrop-blur-md px-3 py-1 text-[11px] font-semibold text-emerald-400 border border-zinc-700/60 shadow-lg">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                      <span>Live Production Lines Active</span>
                    </div>

                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-xs">
                      <div className="flex items-center gap-2">
                        <img src="/images/brand/venopai_cart_icon.png" alt="Cart" className="h-5 w-5 object-contain" />
                        <span className="font-semibold tracking-wide text-xs">Verified Hardware Delivery</span>
                      </div>
                      <span className="font-mono text-[11px] text-zinc-300 bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700">
                        Across India
                      </span>
                    </div>
                  </div>

                  {/* Quick Feature Stats Bar */}
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center p-2 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-100 dark:border-zinc-800/60">
                    <div>
                      <div className="text-xs font-bold text-zinc-900 dark:text-white">48h Fab</div>
                      <div className="text-[10px] text-zinc-500">Rapid Turnaround</div>
                    </div>
                    <div className="border-x border-zinc-200 dark:border-zinc-800">
                      <div className="text-xs font-bold text-zinc-900 dark:text-white">100% Genuine</div>
                      <div className="text-[10px] text-zinc-500">Trace Origin</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-zinc-900 dark:text-white">1-to-16</div>
                      <div className="text-[10px] text-zinc-500">PCB Layer Stack</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Engineering Services Grid */}
      <section className="border-b border-zinc-200 bg-zinc-50 py-16 lg:py-24 dark:border-zinc-800 dark:bg-black">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
              End-to-End Engineering Services
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Engage our certified engineering teams for specific stages or full lifecycle hardware development.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Manufacturing Card */}
            <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-bold text-zinc-900 dark:text-white">
                  Rapid PCB Manufacturing
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  1 to 16 layer rigid, flex, and metal-core PCB fabrication with SMT stenciling and automated pick-and-place assembly.
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    From 48h turnaround
                  </span>
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    Gerber/OBD++
                  </span>
                </div>
              </div>
              <div className="mt-6 border-t border-zinc-100 pt-4 dark:border-zinc-900">
                <Link
                  href="/manufacturing"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
                >
                  <span>Request Prototype</span>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* PCB Design Card */}
            <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-bold text-zinc-900 dark:text-white">
                  Hardware & PCB Design
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  Custom schematic creation, controlled impedance stackups, high-speed differential pairs, and EMI/EMC compliance engineering.
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    Altium & KiCad
                  </span>
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    DFM Optimized
                  </span>
                </div>
              </div>
              <div className="mt-6 border-t border-zinc-100 pt-4 dark:border-zinc-900">
                <Link
                  href="/design"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
                >
                  <span>Start Design Project</span>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Software / Firmware Card */}
            <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-bold text-zinc-900 dark:text-white">
                  Firmware & Embedded Code
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  FreeRTOS, Zephyr, and bare-metal firmware with hardware driver integration, BLE/Wi-Fi communication, and secure bootloaders.
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    C / C++ & Rust
                  </span>
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    OTA Updates
                  </span>
                </div>
              </div>
              <div className="mt-6 border-t border-zinc-100 pt-4 dark:border-zinc-900">
                <Link
                  href="/software"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
                >
                  <span>Build Firmware</span>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Consultation Card */}
            <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-bold text-zinc-900 dark:text-white">
                  Technical Architecture
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  Direct consultation with senior hardware architects to select optimal SoCs, evaluate supply chain availability, and derisk mass production.
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    BOM Optimization
                  </span>
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    1-on-1 Review
                  </span>
                </div>
              </div>
              <div className="mt-6 border-t border-zinc-100 pt-4 dark:border-zinc-900">
                <Link
                  href="/consultations"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
                >
                  <span>Book Consultation</span>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Realization Pathway Section */}
      <section className="border-b border-zinc-200 bg-white py-16 lg:py-24 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
              The VenopAI Realization Pathway
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              A transparent, automated pipeline from specification to working hardware
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">STAGE 01</span>
              <h3 className="mt-2 text-sm font-bold text-zinc-900 dark:text-white">Requirements & BOM Sync</h3>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Upload your schematic, netlist, or initial concept. Our engine performs immediate footprint verification against verified component stock.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">STAGE 02</span>
              <h3 className="mt-2 text-sm font-bold text-zinc-900 dark:text-white">Automated DFM & DRC Audit</h3>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Gerber and drill layers undergo automated clearance, thermal relief, and trace impedance checks to catch manufacturing defects before fab.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">STAGE 03</span>
              <h3 className="mt-2 text-sm font-bold text-zinc-900 dark:text-white">PCB Layer Fabrication</h3>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Precision FR4 or Rogers substrate drilling, copper plating, solder mask application, and ENIG/HASL surface finishing under ISO 9001 controls.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">STAGE 04</span>
              <h3 className="mt-2 text-sm font-bold text-zinc-900 dark:text-white">SMT & Through-Hole Assembly</h3>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                High-speed Yamaha/Panasonic pick-and-place lines populate passives, ICs, and BGAs down to 0201 metric sizes with reflow profile logging.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">STAGE 05</span>
              <h3 className="mt-2 text-sm font-bold text-zinc-900 dark:text-white">Testing & Firmware Bring-Up</h3>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Automated Optical Inspection (AOI), X-ray BGA verification, voltage rail testing, and flash programming of verified bootloader firmware.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">STAGE 06</span>
              <h3 className="mt-2 text-sm font-bold text-zinc-900 dark:text-white">Direct Bench Logistics</h3>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                ESD vacuum packaging and real-time tracked courier dispatch via Shiprocket with milestone notification updates straight to your dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Hardware Components Catalog Section */}
      <section id="catalog" className="bg-zinc-50 py-16 lg:py-24 dark:bg-black">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                <span>STOCK & COMMERCE</span>
              </div>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
                Verified Hardware Catalog
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Genuine components in stock with guaranteed trace origin and immediate dispatch
              </p>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  selectedCategory === "all"
                    ? "bg-zinc-900 text-white dark:bg-emerald-600"
                    : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300"
                }`}
              >
                All Components
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    selectedCategory === cat.id
                      ? "bg-zinc-900 text-white dark:bg-emerald-600"
                      : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Product Cards Grid */}
          <div className="mt-8">
            {loadingProducts ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-72 rounded-2xl bg-zinc-200 animate-pulse dark:bg-zinc-900" />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-sm text-zinc-500">No components found for this category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredProducts.map((prod) => {
                  const imageSrc = (prod.images && prod.images.length > 0 ? prod.images[0] : null) || prod.primary_image_url || null;

                  return (
                    <div
                      key={prod.id}
                      className="group flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-zinc-300 transition-all dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                    >
                      <div>
                        {/* Product Image */}
                        <Link
                          href={`/products/${prod.slug || prod.id}`}
                          className="relative block aspect-4/3 w-full overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900 mb-4"
                        >
                          {imageSrc ? (
                            <img
                              src={imageSrc}
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
                          )}
                          <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-bold text-emerald-700 shadow-sm backdrop-blur dark:bg-zinc-900/90 dark:text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            In Stock
                          </span>
                        </Link>

                        {/* Top Meta */}
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono text-zinc-400 text-[11px] truncate">
                            {prod.sku}
                          </span>
                          {prod.category?.name && (
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                              {prod.category.name}
                            </span>
                          )}
                        </div>

                        {/* Title & Description */}
                        <Link href={`/products/${prod.slug || prod.id}`}>
                          <h3 className="mt-2 text-sm font-bold text-zinc-900 dark:text-white line-clamp-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                            {prod.name}
                          </h3>
                        </Link>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                          {prod.description}
                        </p>

                        {/* Technical Specs Tags */}
                        {prod.specifications && (
                          <div className="mt-3 flex flex-wrap gap-1">
                            {Array.isArray(prod.specifications)
                              ? prod.specifications.slice(0, 2).map((s: { key?: string; name?: string; value?: unknown }, idx: number) => (
                                  <span
                                    key={idx}
                                    className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
                                  >
                                    {s.key || s.name}: {String(s.value)}
                                  </span>
                                ))
                              : Object.entries(prod.specifications)
                                  .slice(0, 2)
                                  .map(([k, v]) => (
                                    <span
                                      key={k}
                                      className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
                                    >
                                      {k}: {String(v)}
                                    </span>
                                  ))}
                          </div>
                        )}
                      </div>

                      {/* Bottom: Price + Action */}
                      <div className="mt-5 border-t border-zinc-100 pt-4 flex items-center justify-between dark:border-zinc-900">
                        <div>
                          <span className="text-xs text-zinc-400">Price</span>
                          <div className="text-base font-bold text-zinc-900 dark:text-white">
                            ₹{parseFloat(prod.price || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddToCart(prod)}
                          disabled={addingToCart === prod.id}
                          className="rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          {addingToCart === prod.id ? (
                            <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                          ) : (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          )}
                          <span>Add</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
