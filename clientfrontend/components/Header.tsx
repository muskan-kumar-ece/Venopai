"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { SearchBar } from "./SearchBar";

export function Header() {
  const [cartCount, setCartCount] = useState<number>(0);

  useEffect(() => {
    // In guest mode, cart count can be read from localStorage or initialized to 0
    try {
      const stored = localStorage.getItem("venopai_cart_count");
      if (stored) {
        setCartCount(parseInt(stored, 10) || 0);
      }
    } catch {
      // ignore
    }
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-black/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Venop<span className="text-emerald-600 dark:text-emerald-400">AI</span>
          </Link>
          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-zinc-600 dark:text-zinc-400">
            <Link href="/" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
              Products
            </Link>
            <Link href="/manufacturing" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
              Manufacturing
            </Link>
            <Link href="/projects" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
              Projects
            </Link>
          </nav>
        </div>

        <div className="flex-1 max-w-md mx-4">
          <SearchBar />
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/cart"
            className="relative flex items-center justify-center p-2 text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition-colors"
            aria-label="View Cart"
          >
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
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
