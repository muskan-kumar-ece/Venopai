"use client";

import React from "react";
import Link from "next/link";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

export default function AdminCatalogHubPage() {
  const { hasRole } = useAdminAuth();
  const isAllowed = hasRole(["SUPER_ADMIN", "ORDER_MANAGER"]);

  if (!isAllowed) {
    return (
      <div className="p-8 text-center text-red-400">
        Access Restricted: Catalog management requires ORDER_MANAGER or SUPER_ADMIN role.
      </div>
    );
  }

  const sections = [
    {
      title: "Products Catalog",
      description: "Manage component listings, SKUs, pricing, technical datasheets, and active visibility.",
      href: "/admin/catalog/products",
      actionText: "View Products →",
      badge: "Master Catalog",
      icon: "📦",
    },
    {
      title: "Add New Product",
      description: "Create and publish a new hardware component, microcontroller, or sensor listing with specifications.",
      href: "/admin/catalog/products/new",
      actionText: "+ Create Product",
      badge: "Creation",
      icon: "⚡",
    },
    {
      title: "Category Hierarchy",
      description: "Organize electronics hierarchy, parent-child taxonomy, and navigation filters.",
      href: "/admin/catalog/categories",
      actionText: "Manage Categories →",
      badge: "Taxonomy",
      icon: "🗂️",
    },
    {
      title: "Inventory Levels & Alerts",
      description: "Audit current physical stock, reorder thresholds, and low-inventory safety buffers.",
      href: "/admin/inventory",
      actionText: "Inspect Inventory →",
      badge: "Stock Control",
      icon: "📊",
    },
  ];

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-zinc-800 pb-5">
        <div className="flex items-center gap-2 text-xs font-mono uppercase text-emerald-400">
          <span>Catalog & Inventory</span>
          <span>&bull;</span>
          <span>Overview Hub</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
          Hardware Catalog & Taxonomy
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Central operations hub for component cataloging, categories, stock levels, and technical metadata.
        </p>
      </div>

      {/* Hub Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {sections.map((sec, idx) => (
          <div
            key={idx}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 flex flex-col justify-between hover:border-zinc-700 transition space-y-4"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">{sec.icon}</span>
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-mono text-zinc-300">
                  {sec.badge}
                </span>
              </div>
              <h3 className="text-lg font-bold text-white">{sec.title}</h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                {sec.description}
              </p>
            </div>

            <div className="pt-2">
              <Link
                href={sec.href}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 transition"
              >
                {sec.actionText}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
