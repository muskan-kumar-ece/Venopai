"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminHeader() {
  const pathname = usePathname();

  const navLinks = [
    { href: "/admin/manufacturing", label: "Manufacturing Queue" },
    { href: "/admin/manufacturing/cancellation-review", label: "Cancellation Reviews" },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/admin/manufacturing" className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight text-white">
              Venop<span className="text-emerald-400">AI</span>
            </span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wider text-zinc-300">
              Operations
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-zinc-800 text-white shadow-sm"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 text-[11px] font-mono text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Engineering Ops
          </span>
          <span className="text-xs font-mono text-zinc-500">
            Admin Console
          </span>
        </div>
      </div>
    </header>
  );
}
