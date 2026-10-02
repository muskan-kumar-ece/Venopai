"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

export function AdminSidebar() {
  const pathname = usePathname();
  const { adminUser, logout, hasRole } = useAdminAuth();

  // If on the login page, don't show the sidebar
  if (pathname === "/admin/login") {
    return null;
  }

  const sections = [
    {
      title: "Catalog & Inventory",
      roles: ["SUPER_ADMIN", "ORDER_MANAGER"],
      links: [
        { href: "/admin/catalog", label: "Catalog Hub" },
        { href: "/admin/catalog/products", label: "Products Catalog" },
        { href: "/admin/catalog/products/new", label: "+ Add New Product" },
        { href: "/admin/catalog/categories", label: "Category Hierarchy" },
        { href: "/admin/inventory", label: "Inventory Levels" },
      ],
    },
    {
      title: "Manufacturing & Engineering",
      roles: ["SUPER_ADMIN", "MANUFACTURING_MANAGER"],
      links: [
        { href: "/admin/manufacturing", label: "Manufacturing Queue" },
        { href: "/admin/design", label: "PCB Design Queue" },
        { href: "/admin/software", label: "Firmware Queue" },
        { href: "/admin/quotes", label: "Quotations & Estimates" },
        { href: "/admin/files", label: "Project Files Library" },
        { href: "/admin/manufacturing/cancellation-review", label: "Cancellation Reviews" },
      ],
    },
    {
      title: "Fulfillment & Logistics",
      roles: ["SUPER_ADMIN", "ORDER_MANAGER"],
      links: [
        { href: "/admin/orders", label: "Orders Queue" },
        { href: "/admin/shipping", label: "Shipments & Tracking" },
      ],
    },
    {
      title: "Customer Accounts & Support",
      roles: ["SUPER_ADMIN", "ORDER_MANAGER", "SUPPORT_EXECUTIVE"],
      links: [
        { href: "/admin/customers", label: "Customer Accounts" },
        { href: "/admin/consultations", label: "Consultation Inquiries" },
        { href: "/admin/reviews", label: "Customer Reviews" },
        { href: "/admin/feedback", label: "Feedback & Bug Reports" },
      ],
    },
    {
      title: "Finance & Accounts",
      roles: ["SUPER_ADMIN", "FINANCE_MANAGER"],
      links: [
        { href: "/admin/payments", label: "Payments & Refunds" },
        { href: "/admin/quotes", label: "Quotations & Revenue" },
      ],
    },
    {
      title: "Operations & Governance",
      roles: ["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER", "ORDER_MANAGER", "MANUFACTURING_MANAGER", "SUPPORT_EXECUTIVE"],
      links: [
        { href: "/admin/analytics", label: "Operational Analytics" },
        { href: "/admin/notifications", label: "Notification Dispatch" },
        { href: "/admin/audit-logs", label: "Platform Audit Trail" },
        { href: "/admin/settings", label: "System Settings" },
        { href: "/admin/settings/security", label: "Security & Profile" },
      ],
    },
    {
      title: "Team & Access Control",
      roles: ["SUPER_ADMIN"],
      links: [
        { href: "/admin/team", label: "Staff & Role Management" },
      ],
    },
  ];

  const roleColorMap: Record<string, string> = {
    SUPER_ADMIN: "bg-emerald-950/80 text-emerald-400 border-emerald-800",
    MANUFACTURING_MANAGER: "bg-cyan-950/80 text-cyan-400 border-cyan-800",
    ORDER_MANAGER: "bg-blue-950/80 text-blue-400 border-blue-800",
    SUPPORT_EXECUTIVE: "bg-amber-950/80 text-amber-400 border-amber-800",
    FINANCE_MANAGER: "bg-purple-950/80 text-purple-400 border-purple-800",
  };

  const roleBadgeStyle = roleColorMap[adminUser?.role || ""] || "bg-zinc-800 text-zinc-300 border-zinc-700";

  return (
    <aside className="w-64 shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col justify-between hidden md:flex">
      {/* Brand & Section Navigation */}
      <div className="p-4 space-y-6 overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2 group">
            <img
              src="/images/brand/venopai_wordmark.png"
              alt="VenoPai"
              className="h-7 w-auto object-contain brightness-110 group-hover:opacity-90 transition-opacity"
            />
            <span className="text-[10px] font-mono uppercase bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">
              Admin
            </span>
          </Link>
        </div>

        <nav className="space-y-6">
          {sections.map((section, idx) => {
            const isVisible = hasRole(section.roles);
            if (!isVisible) return null;

            return (
              <div key={idx} className="space-y-1.5">
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 px-2">
                  {section.title}
                </h4>
                <div className="space-y-0.5">
                  {section.links.map((link) => {
                    const isActive =
                      pathname === link.href ||
                      (link.href !== "/admin" && pathname.startsWith(link.href));

                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`block rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          isActive
                            ? "bg-zinc-850 text-white font-semibold shadow-sm border border-zinc-750"
                            : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                        }`}
                      >
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      {/* User Session Profile & Role */}
      <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/40">
        {adminUser ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border font-semibold ${roleBadgeStyle}`}>
                {adminUser.role}
              </span>
              <button
                type="button"
                onClick={() => logout()}
                className="text-[11px] text-zinc-400 hover:text-red-400 transition cursor-pointer"
              >
                Sign Out
              </button>
            </div>
            <Link
              href="/admin/settings/security"
              className="block truncate group hover:opacity-90 transition"
              title="Manage Profile & Security"
            >
              <p className="text-xs font-medium text-white truncate group-hover:text-emerald-400 transition-colors">
                {adminUser.full_name || "Admin Staff"}
              </p>
              <p className="text-[11px] text-zinc-500 truncate group-hover:text-zinc-400">
                {adminUser.email}
              </p>
            </Link>
          </div>
        ) : (
          <Link
            href="/admin/login"
            className="w-full block text-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition"
          >
            Staff Sign In
          </Link>
        )}
      </div>
    </aside>
  );
}
