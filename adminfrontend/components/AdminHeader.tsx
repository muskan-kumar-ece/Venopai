"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

export function AdminHeader() {
  const pathname = usePathname();
  const { adminUser, isAuthenticated, logout } = useAdminAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (pathname === "/admin/login") {
    return null;
  }

  const roleColorMap: Record<string, string> = {
    SUPER_ADMIN: "bg-emerald-950/80 text-emerald-400 border-emerald-800",
    MANUFACTURING_MANAGER: "bg-cyan-950/80 text-cyan-400 border-cyan-800",
    ORDER_MANAGER: "bg-blue-950/80 text-blue-400 border-blue-800",
    SUPPORT_EXECUTIVE: "bg-amber-950/80 text-amber-400 border-amber-800",
    FINANCE_MANAGER: "bg-purple-950/80 text-purple-400 border-purple-800",
  };

  const roleBadgeStyle = roleColorMap[adminUser?.role || ""] || "bg-zinc-800 text-zinc-300 border-zinc-700";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden p-1 text-zinc-400 hover:text-white"
            aria-label="Toggle Navigation"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link href="/admin" className="flex items-center gap-2.5 group">
            <img
              src="/images/brand/venopai_wordmark.png"
              alt="VenoPai"
              className="h-6 w-auto object-contain brightness-110 group-hover:opacity-90 transition-opacity"
            />
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wider text-zinc-300">
              Operations Console
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated && adminUser ? (
            <div className="flex items-center gap-3">
              <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border font-semibold ${roleBadgeStyle}`}>
                {adminUser.role}
              </span>
              <Link
                href="/admin/settings/security"
                className="hidden sm:inline-block text-xs text-zinc-300 hover:text-emerald-400 transition"
                title="Manage Profile & Security"
              >
                {adminUser.full_name || adminUser.email}
              </Link>
              <Link
                href="/admin/settings/security"
                className="rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-700 hover:text-white transition"
              >
                Security
              </Link>
              <button
                type="button"
                onClick={() => logout()}
                className="rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 hover:border-red-900 hover:bg-red-950/40 hover:text-red-300 transition cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <Link
              href="/admin/login"
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="border-t border-zinc-800 bg-zinc-950 p-4 md:hidden space-y-3">
          <Link href="/admin/catalog/products" className="block text-xs text-zinc-300 hover:text-white py-1">Catalog Products</Link>
          <Link href="/admin/catalog/categories" className="block text-xs text-zinc-300 hover:text-white py-1">Categories</Link>
          <Link href="/admin/inventory" className="block text-xs text-zinc-300 hover:text-white py-1">Inventory Management</Link>
          <Link href="/admin/manufacturing" className="block text-xs text-zinc-300 hover:text-white py-1">Manufacturing Queue</Link>
          <Link href="/admin/design" className="block text-xs text-zinc-300 hover:text-white py-1">PCB Design Queue</Link>
          <Link href="/admin/software" className="block text-xs text-zinc-300 hover:text-white py-1">Software Queue</Link>
          <Link href="/admin/orders" className="block text-xs text-zinc-300 hover:text-white py-1">Orders</Link>
          <Link href="/admin/consultations" className="block text-xs text-zinc-300 hover:text-white py-1">Consultations</Link>
          <Link href="/admin/payments" className="block text-xs text-zinc-300 hover:text-white py-1">Payments</Link>
          <Link href="/admin/reviews" className="block text-xs text-zinc-300 hover:text-white py-1">Reviews</Link>
          {adminUser?.role === "SUPER_ADMIN" && (
            <Link href="/admin/team" className="block text-xs text-emerald-400 hover:text-emerald-300 py-1 font-semibold">
              Team & Staff Management
            </Link>
          )}
          <Link href="/admin/settings/security" className="block text-xs text-zinc-300 hover:text-white py-1">
            Profile & Security
          </Link>
        </div>
      )}
    </header>
  );
}
