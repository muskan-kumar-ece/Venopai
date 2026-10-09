"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiClient, catalogApi } from "@/lib/api/client";

interface AutocompleteProduct {
  id: string;
  name: string;
  slug?: string;
  price: string;
  primary_image_url?: string | null;
  category_name?: string | null;
  stock_status: string;
}

interface AutocompleteCategory {
  id: string;
  name: string;
  slug: string;
}

interface AutocompleteResponseData {
  suggestions: string[];
  products?: AutocompleteProduct[];
  categories?: AutocompleteCategory[];
}

const TRENDING_SEARCHES = [
  "ESP32-S3-WROOM-1 DevBoard",
  "STM32F401 BlackPill Core Board",
  "BME680 Environmental Sensor Module",
  "Raspberry Pi 4 Model B",
  "LM2596S DC-DC Step-Down Buck Converter",
  "LoRa SX1278 433MHz Transceiver Module",
];

const DEFAULT_POPULAR_CATEGORIES: AutocompleteCategory[] = [
  { id: "1", name: "Microcontrollers & Dev", slug: "microcontrollers-development" },
  { id: "2", name: "Sensors & Actuators", slug: "sensors-actuators" },
  { id: "3", name: "Power & Battery ICs", slug: "power-battery-management" },
  { id: "4", name: "Wireless & IoT Modules", slug: "wireless-iot-modules" },
];

const RECENT_SEARCHES_KEY = "venopai_recent_searches";
const MAX_RECENT_SEARCHES = 6;

// Substring highlight component
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>;

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <span key={i} className="font-semibold text-emerald-600 dark:text-emerald-400">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

export function SearchBar() {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);

  // Autocomplete data
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [products, setProducts] = useState<AutocompleteProduct[]>([]);
  const [categories, setCategories] = useState<AutocompleteCategory[]>([]);
  const [popularCategories, setPopularCategories] = useState<AutocompleteCategory[]>(DEFAULT_POPULAR_CATEGORIES);

  // Local storage recent searches
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Keyboard navigation index
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  // Fetch active categories for quick navigation pills
  useEffect(() => {
    catalogApi.listCategories()
      .then((res: { data?: Array<{ id: string; name: string; slug: string }> }) => {
        if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
          setPopularCategories(
            res.data.slice(0, 4).map((c) => ({
              id: c.id,
              name: c.name,
              slug: c.slug,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed.slice(0, MAX_RECENT_SEARCHES));
        }
      }
    } catch {
      // ignore JSON errors
    }
  }, []);

  const saveRecentSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      const existing: string[] = stored ? JSON.parse(stored) : [];
      const updated = [trimmed, ...existing.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(
        0,
        MAX_RECENT_SEARCHES
      );
      setRecentSearches(updated);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }, []);

  const removeRecentSearch = (e: React.MouseEvent, termToRemove: string) => {
    e.stopPropagation();
    try {
      const updated = recentSearches.filter((item) => item !== termToRemove);
      setRecentSearches(updated);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const clearAllRecentSearches = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setRecentSearches([]);
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // ignore
    }
  };

  // Next-prediction calculation (ghost text)
  const nextPrediction = useMemo(() => {
    const cleanQ = query.trim();
    if (cleanQ.length < 2 || suggestions.length === 0) return null;

    // Find first suggestion starting with typed prefix (case-insensitive)
    const match = suggestions.find((s) => s.toLowerCase().startsWith(cleanQ.toLowerCase()));
    if (!match) return null;

    // Return the remaining suffix preserving case of prediction
    const suffix = match.slice(cleanQ.length);
    return suffix ? { fullText: match, suffix } : null;
  }, [query, suggestions]);

  // Debounced auto-search & autocomplete fetch
  useEffect(() => {
    const cleanQ = query.trim();

    if (cleanQ.length < 2) {
      setSuggestions([]);
      setProducts([]);
      setCategories([]);
      setIsLoading(false);
      setRateLimited(false);
      setSelectedIndex(-1);
      return;
    }

    setIsLoading(true);
    setRateLimited(false);

    // Cancel prior request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const res = (await apiClient.get(
          `/search/autocomplete?q=${encodeURIComponent(cleanQ)}`,
          { signal: controller.signal }
        )) as { data?: AutocompleteResponseData };

        if (controller.signal.aborted) return;

        const data = res?.data;
        if (data) {
          setSuggestions(data.suggestions || []);
          setProducts(data.products || []);
          setCategories(data.categories || []);
          setSelectedIndex(-1);
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        const status = (err as { status?: number })?.status;
        if (status === 429) {
          setRateLimited(true);
        }
        setSuggestions([]);
        setProducts([]);
        setCategories([]);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleExecuteSearch = (searchTerm: string) => {
    const trimmed = searchTerm.trim();
    if (!trimmed) return;
    saveRecentSearch(trimmed);
    setIsOpen(false);
    inputRef.current?.blur();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const handleSelectProduct = (product: AutocompleteProduct) => {
    saveRecentSearch(product.name);
    setIsOpen(false);
    inputRef.current?.blur();
    router.push(`/products/${product.slug || product.id}`);
  };

  const handleSelectCategory = (cat: { name: string; slug: string }) => {
    saveRecentSearch(cat.name);
    setIsOpen(false);
    inputRef.current?.blur();
    router.push(`/search?q=${encodeURIComponent(cat.name)}`);
  };

  // Navigable items aggregation for keyboard arrow navigation
  const navigableItems = useMemo(() => {
    const cleanQ = query.trim();
    if (cleanQ.length < 2) {
      // Empty state: recent items followed by trending items
      const items: Array<{ type: "recent" | "trending"; value: string }> = [];
      recentSearches.forEach((s) => items.push({ type: "recent", value: s }));
      TRENDING_SEARCHES.forEach((s) => items.push({ type: "trending", value: s }));
      return items;
    }

    // Active results
    const items: Array<
      | { type: "suggestion"; value: string }
      | { type: "product"; product: AutocompleteProduct }
      | { type: "category"; category: AutocompleteCategory }
    > = [];

    suggestions.forEach((s) => items.push({ type: "suggestion", value: s }));
    products.forEach((p) => items.push({ type: "product", product: p }));
    categories.forEach((c) => items.push({ type: "category", category: c }));
    return items;
  }, [query, recentSearches, suggestions, products, categories]);

  // Handle keyboard events (Tab, ArrowUp, ArrowDown, Enter, Escape)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Tab key or RightArrow to accept next prediction
    if (
      (e.key === "Tab" || (e.key === "ArrowRight" && inputRef.current?.selectionStart === query.length)) &&
      nextPrediction
    ) {
      e.preventDefault();
      setQuery(nextPrediction.fullText);
      return;
    }

    // Escape closes dropdown
    if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
      return;
    }

    // Arrow navigation
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      if (navigableItems.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % navigableItems.length);
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      if (navigableItems.length > 0) {
        setSelectedIndex((prev) => (prev <= 0 ? navigableItems.length - 1 : prev - 1));
      }
      return;
    }

    // Enter key
    if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < navigableItems.length) {
        const item = navigableItems[selectedIndex];
        if (item.type === "recent" || item.type === "trending" || item.type === "suggestion") {
          setQuery(item.value);
          handleExecuteSearch(item.value);
        } else if (item.type === "product") {
          handleSelectProduct(item.product);
        } else if (item.type === "category") {
          handleSelectCategory(item.category);
        }
      } else {
        handleExecuteSearch(query);
      }
    }
  };

  const handleClear = () => {
    setQuery("");
    setSuggestions([]);
    setProducts([]);
    setCategories([]);
    setSelectedIndex(-1);
    setRateLimited(false);
    inputRef.current?.focus();
  };

  const isSearchActive = query.trim().length >= 2;
  const hasResults = suggestions.length > 0 || products.length > 0 || categories.length > 0;

  return (
    <div ref={wrapperRef} className="relative w-full">
      {/* Search Input Box */}
      <div className="relative flex items-center">
        {/* Search Icon */}
        <div className="pointer-events-none absolute left-3 flex items-center justify-center text-zinc-400 dark:text-zinc-500">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Ghost Prediction Overlay */}
        {nextPrediction && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center pl-9 pr-20 text-sm overflow-hidden select-none whitespace-pre"
          >
            <span className="invisible">{query}</span>
            <span className="text-zinc-400 dark:text-zinc-500 opacity-60 font-normal">
              {nextPrediction.suffix}
            </span>
          </div>
        )}

        {/* Main Input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search components, boards, sensors..."
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-xl border border-zinc-200/90 bg-zinc-50/80 px-4 py-2 pl-9 pr-24 text-sm text-zinc-900 transition-all placeholder:text-zinc-400 hover:border-zinc-300 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:hover:border-zinc-700 dark:focus:border-emerald-500 dark:focus:bg-zinc-900 dark:focus:ring-emerald-500/20"
        />

        {/* Right side controls (Next prediction hint, Loading spinner, Clear button) */}
        <div className="absolute right-2.5 flex items-center gap-1.5">
          {nextPrediction && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                setQuery(nextPrediction.fullText);
                inputRef.current?.focus();
              }}
              className="hidden sm:inline-flex items-center gap-1 rounded bg-zinc-200/60 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              title="Press Tab to complete"
            >
              <span>Tab</span>
              <span>⇥</span>
            </button>
          )}

          {isLoading && (
            <div className="flex items-center justify-center p-0.5 text-emerald-600 dark:text-emerald-400 animate-spin">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
            </div>
          )}

          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
              title="Clear search"
              aria-label="Clear search"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Auto-Suggest Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[80vh] w-full min-w-[320px] sm:min-w-[440px] md:min-w-[500px] overflow-y-auto rounded-2xl border border-zinc-200/90 bg-white/95 p-2 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95">
          {/* Rate Limit Exceeded Notice */}
          {rateLimited && (
            <div className="mb-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60 flex items-center gap-2">
              <svg className="h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Search rate limit reached. Please slow down your typing.</span>
            </div>
          )}

          {/* VIEW A: Empty Query (Tap / Focus Trigger) */}
          {!isSearchActive && (
            <div className="space-y-3 p-1">
              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-2 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    <span className="flex items-center gap-1.5">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Recent Searches
                    </span>
                    <button
                      type="button"
                      onClick={clearAllRecentSearches}
                      className="text-[11px] font-normal text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="mt-1 divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {recentSearches.map((item, idx) => {
                      const isNavActive = selectedIndex === idx;
                      return (
                        <div
                          key={item}
                          onClick={() => {
                            setQuery(item);
                            handleExecuteSearch(item);
                          }}
                          className={`group flex items-center justify-between rounded-lg px-2.5 py-2 text-sm cursor-pointer transition-colors ${
                            isNavActive
                              ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                              : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <svg className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 group-hover:text-emerald-500 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="truncate">{item}</span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => removeRecentSearch(e, item)}
                            className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 opacity-60 hover:opacity-100 transition-opacity"
                            title="Remove"
                            aria-label={`Remove recent search ${item}`}
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Trending Searches */}
              <div>
                <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  <svg className="h-3.5 w-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.316.492-.474.966-.567 1.385a4.996 4.996 0 01-1.39 2.457A5.992 5.992 0 006 11c0 3.314 2.686 6 6 6s6-2.686 6-6c0-1.56-.605-2.98-1.597-4.043a5.98 5.98 0 01-1.89-3.237c-.08-.344-.194-.74-.325-1.167a5.002 5.002 0 00-.793-1.6zM9.5 11a2.5 2.5 0 105 0 2.5 2.5 0 00-5 0z" clipRule="evenodd" />
                  </svg>
                  Trending Hardware
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 px-1">
                  {TRENDING_SEARCHES.map((item, idx) => {
                    const navIndex = recentSearches.length + idx;
                    const isNavActive = selectedIndex === navIndex;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setQuery(item);
                          handleExecuteSearch(item);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                          isNavActive
                            ? "bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/30"
                            : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        }`}
                      >
                        <span className="text-zinc-400 dark:text-zinc-500">#</span>
                        <span>{item}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick Categories */}
              <div className="border-t border-zinc-100 pt-2.5 dark:border-zinc-800/80">
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Popular Categories
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5 px-1">
                  {popularCategories.map((cat) => (
                    <button
                      key={cat.slug || cat.id}
                      type="button"
                      onClick={() => handleSelectCategory(cat)}
                      className="flex items-center gap-2 rounded-lg border border-zinc-200/60 bg-white p-2 text-left text-xs font-medium text-zinc-700 transition-colors hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:border-emerald-500 dark:hover:text-emerald-400 cursor-pointer"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                        ⚡
                      </span>
                      <span className="truncate">{cat.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* VIEW B: Active Query Results (Predictions & Live Products) */}
          {isSearchActive && (
            <div className="space-y-3 p-1">
              {/* Loading State Skeleton */}
              {isLoading && !hasResults && (
                <div className="space-y-2 py-4 px-2">
                  <div className="h-4 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                  <div className="h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 animate-pulse" />
                  <div className="h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 animate-pulse" />
                </div>
              )}

              {/* No Results Found */}
              {!isLoading && !hasResults && (
                <div className="py-6 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    No matching items for &quot;{query}&quot;
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Try searching for general terms like &quot;board&quot;, &quot;sensor&quot;, or &quot;controller&quot;.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleExecuteSearch(query)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                  >
                    View Catalog Results
                    <span>→</span>
                  </button>
                </div>
              )}

              {/* Section 1: Query Suggestions / Auto-Predictions */}
              {suggestions.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Suggestions
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {suggestions.map((item, idx) => {
                      const isNavActive = selectedIndex === idx;
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            setQuery(item);
                            handleExecuteSearch(item);
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                            isNavActive
                              ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                              : "text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <svg className="h-3.5 w-3.5 text-zinc-400 group-hover:text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <HighlightMatch text={item} query={query} />
                          </div>
                          <span className="text-xs text-zinc-400 dark:text-zinc-600">↖</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Section 2: Live Matching Hardware Products (Rich Cards) */}
              {products.length > 0 && (
                <div className="border-t border-zinc-100 pt-2.5 dark:border-zinc-800/80">
                  <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center justify-between">
                    <span>Products ({products.length})</span>
                    <button
                      type="button"
                      onClick={() => handleExecuteSearch(query)}
                      className="text-[11px] font-normal text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      See all
                    </button>
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {products.map((p, idx) => {
                      const navIndex = suggestions.length + idx;
                      const isNavActive = selectedIndex === navIndex;
                      return (
                        <div
                          key={p.id}
                          onClick={() => handleSelectProduct(p)}
                          className={`group flex items-center gap-3 rounded-xl border p-2 cursor-pointer transition-all ${
                            isNavActive
                              ? "border-emerald-500 bg-emerald-50/50 shadow-sm dark:bg-emerald-950/20"
                              : "border-zinc-200/60 bg-white hover:border-zinc-300 hover:bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-800/40 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/80"
                          }`}
                        >
                          {/* Thumbnail */}
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200/50 dark:border-zinc-700/50">
                            {p.primary_image_url ? (
                              <img
                                src={p.primary_image_url}
                                alt={p.name}
                                className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform"
                              />
                            ) : (
                              <span className="text-base" role="img" aria-label="Microchip">
                                🔌
                              </span>
                            )}
                          </div>

                          {/* Info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {p.category_name && (
                                <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
                                  {p.category_name}
                                </span>
                              )}
                              {p.stock_status === "in_stock" ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  In Stock
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                  Out of Stock
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                              <HighlightMatch text={p.name} query={query} />
                            </div>
                          </div>

                          {/* Price */}
                          <div className="shrink-0 text-right pr-1">
                            <div className="text-sm font-bold text-zinc-900 dark:text-white">
                              ₹{p.price}
                            </div>
                            <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
                              excl. GST
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Section 3: Matching Categories */}
              {categories.length > 0 && (
                <div className="border-t border-zinc-100 pt-2.5 dark:border-zinc-800/80">
                  <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Categories
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 px-1">
                    {categories.map((cat, idx) => {
                      const navIndex = suggestions.length + products.length + idx;
                      const isNavActive = selectedIndex === navIndex;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => handleSelectCategory(cat)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                            isNavActive
                              ? "bg-emerald-600 text-white"
                              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                          }`}
                        >
                          <svg className="h-3 w-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          <HighlightMatch text={cat.name} query={query} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Footer Prompt */}
              <div className="mt-2 border-t border-zinc-100 pt-2 px-2 flex items-center justify-between text-[11px] text-zinc-400 dark:border-zinc-800/80 dark:text-zinc-500">
                <button
                  type="button"
                  onClick={() => handleExecuteSearch(query)}
                  className="flex items-center gap-1 font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
                >
                  <span>Search all results for &quot;{query}&quot;</span>
                  <span>→</span>
                </button>
                <div className="hidden sm:flex items-center gap-2 font-mono text-[10px]">
                  <span>↑↓ Navigate</span>
                  <span>↵ Select</span>
                  <span>esc Dismiss</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
