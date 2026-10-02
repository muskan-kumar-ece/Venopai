"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchBar } from "./SearchBar";
import { useAuth } from "@/lib/auth/AuthContext";
import { cartApi } from "@/lib/api/client";

export function Header() {
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuth();
  const [cartCount, setCartCount] = useState<number>(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync cart count
  const syncCartCount = async () => {
    try {
      const res = await cartApi.getCart();
      const items = res?.data?.items || [];
      const count = items.reduce((sum: number, it: { quantity: number }) => sum + it.quantity, 0);
      setCartCount(count);
      try {
        localStorage.setItem("venopai_cart_count", String(count));
      } catch {
        // ignore
      }
    } catch {
      // Guest or empty
      try {
        const stored = localStorage.getItem("venopai_cart_count");
        if (stored) setCartCount(parseInt(stored, 10) || 0);
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    syncCartCount();
    const handleStorageChange = () => syncCartCount();
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [pathname, isAuthenticated]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand & Main Nav */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            {/* Desktop Brand Wordmark */}
            <img
              src="/images/brand/venopai_wordmark.png"
              alt="VenoPai"
              className="h-8 w-auto object-contain hidden sm:block dark:brightness-110 group-hover:opacity-95 transition-opacity"
            />
            {/* Mobile Compact Emblem */}
            <img
              src="/images/brand/venopai_cart_icon.png"
              alt="VenoPai"
              className="h-8 w-8 object-contain sm:hidden group-hover:scale-105 transition-transform"
            />
          </Link>

          <nav className="hidden lg:flex items-center gap-5 text-sm font-medium text-zinc-600 dark:text-zinc-400">
            <Link
              href="/products"
              className={`hover:text-zinc-900 dark:hover:text-white transition-colors ${
                pathname.startsWith("/products") ? "text-zinc-950 font-semibold dark:text-white" : ""
              }`}
            >
              Hardware Catalog
            </Link>
            <Link
              href="/manufacturing"
              className={`hover:text-zinc-900 dark:hover:text-white transition-colors ${
                pathname.startsWith("/manufacturing") ? "text-zinc-950 font-semibold dark:text-white" : ""
              }`}
            >
              Manufacturing
            </Link>
            <Link
              href="/design"
              className={`hover:text-zinc-900 dark:hover:text-white transition-colors ${
                pathname.startsWith("/design") ? "text-zinc-950 font-semibold dark:text-white" : ""
              }`}
            >
              PCB Design
            </Link>
            <Link
              href="/software"
              className={`hover:text-zinc-900 dark:hover:text-white transition-colors ${
                pathname.startsWith("/software") ? "text-zinc-950 font-semibold dark:text-white" : ""
              }`}
            >
              Firmware & Software
            </Link>
            <Link
              href="/consultations"
              className={`hover:text-zinc-900 dark:hover:text-white transition-colors ${
                pathname.startsWith("/consultations") ? "text-zinc-950 font-semibold dark:text-white" : ""
              }`}
            >
              Consultation
            </Link>
            <Link
              href="/projects"
              className={`hover:text-zinc-900 dark:hover:text-white transition-colors ${
                pathname.startsWith("/projects") ? "text-zinc-950 font-semibold dark:text-white" : ""
              }`}
            >
              Projects
            </Link>
          </nav>
        </div>

        {/* Global Search */}
        <div className="flex-1 max-w-sm mx-2 hidden sm:block">
          <SearchBar />
        </div>

        {/* Right Section: Cart + User Auth */}
        <div className="flex items-center gap-3 sm:gap-4">
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
                strokeWidth={1.75}
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white shadow-sm">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>

          {isAuthenticated ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 p-1 pr-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                aria-expanded={userMenuOpen}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  {initials}
                </div>
                <span className="hidden md:inline-block max-w-[120px] truncate text-xs">
                  {user?.full_name || "Account"}
                </span>
                <svg
                  className={`h-4 w-4 text-zinc-400 transition-transform ${userMenuOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-zinc-200 bg-white py-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 z-50">
                  <div className="border-b border-zinc-100 px-4 py-2 dark:border-zinc-800">
                    <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                      {user?.full_name}
                    </p>
                    <p className="text-xs text-zinc-500 truncate dark:text-zinc-400">
                      {user?.email}
                    </p>
                  </div>

                  <div className="py-1">
                    <Link
                      href="/account"
                      className="block px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Dashboard Overview
                    </Link>
                    <Link
                      href="/account/orders"
                      className="block px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Orders & Invoices
                    </Link>
                    <Link
                      href="/account/quotes"
                      className="block px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Quotes & Approvals
                    </Link>
                    <Link
                      href="/account/projects"
                      className="block px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Engineering Projects
                    </Link>
                    <Link
                      href="/account/manufacturing"
                      className="block px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Manufacturing Requests
                    </Link>
                    <Link
                      href="/account/design"
                      className="block px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      PCB Design Requests
                    </Link>
                    <Link
                      href="/account/software"
                      className="block px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Firmware Requests
                    </Link>
                    <Link
                      href="/account/consultations"
                      className="block px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Consultations
                    </Link>
                    <Link
                      href="/account/files"
                      className="block px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Project File Library
                    </Link>
                  </div>

                  <div className="border-t border-zinc-100 py-1 dark:border-zinc-800">
                    <Link
                      href="/account/settings"
                      className="block px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Account Settings
                    </Link>
                    <button
                      type="button"
                      onClick={() => logout()}
                      className="w-full text-left px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors"
              >
                Register
              </Link>
            </div>
          )}

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="flex p-2 text-zinc-600 lg:hidden hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            aria-label="Open mobile menu"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-zinc-200 bg-white px-4 pt-2 pb-6 lg:hidden dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-4">
            <SearchBar />
          </div>
          <nav className="flex flex-col space-y-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <Link href="/" className="hover:text-emerald-600 py-1">Hardware Catalog</Link>
            <Link href="/manufacturing" className="hover:text-emerald-600 py-1">Manufacturing</Link>
            <Link href="/design" className="hover:text-emerald-600 py-1">PCB Design</Link>
            <Link href="/software" className="hover:text-emerald-600 py-1">Firmware & Software</Link>
            <Link href="/consultations" className="hover:text-emerald-600 py-1">Consultation</Link>
            <Link href="/projects" className="hover:text-emerald-600 py-1">Projects</Link>
            {isAuthenticated ? (
              <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <Link href="/account" className="block py-1 text-emerald-600 font-semibold">Account Dashboard</Link>
                <Link href="/account/orders" className="block py-1">My Orders</Link>
                <Link href="/account/quotes" className="block py-1">Quotes</Link>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="mt-2 block text-left text-red-600 font-medium py-1"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="border-t border-zinc-200 pt-3 flex gap-2 dark:border-zinc-800">
                <Link
                  href="/login"
                  className="flex-1 text-center rounded-lg border border-zinc-300 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="flex-1 text-center rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white"
                >
                  Register
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
