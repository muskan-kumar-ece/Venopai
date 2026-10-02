"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/admin";

  const { login } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await login(email.trim(), password);
      // Determine landing page based on role if redirectUrl is default
      if (redirectUrl === "/admin" || redirectUrl === "/") {
        if (user.role === "ORDER_MANAGER") {
          router.push("/admin/catalog/products");
        } else if (user.role === "SUPPORT_EXECUTIVE") {
          router.push("/admin/consultations");
        } else if (user.role === "FINANCE_MANAGER") {
          router.push("/admin/payments");
        } else {
          router.push("/admin/manufacturing");
        }
      } else {
        router.push(redirectUrl);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Invalid admin credentials or insufficient role privileges.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (testEmail: string) => {
    setEmail(testEmail);
    setPassword("AdminPass123!");
    setError(null);
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-2xl">
      <div className="mb-6 text-center">
        <img
          src="/images/brand/venopai_wordmark.png"
          alt="VenoPai"
          className="h-8 w-auto object-contain mx-auto mb-4 brightness-110"
        />
        <div className="mx-auto mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-800/80 bg-emerald-950/60 px-3 py-1 text-xs font-mono text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Restricted Operations Console
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white">
          Admin Portal Authentication
        </h1>
        <p className="mt-1 text-xs text-zinc-400">
          Sign in with authorized staff credentials to access operations, manufacturing queues, and catalog control.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-xs text-red-300">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-medium text-zinc-300 mb-1"
          >
            Staff Email Address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            suppressHydrationWarning
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@venopai.com"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-xs font-medium text-zinc-300 mb-1"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            suppressHydrationWarning
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center rounded-lg bg-emerald-600 py-2.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>Authenticating...</span>
            </div>
          ) : (
            "Authenticate Console Session"
          )}
        </button>
      </form>

      {/* Quick Test Roles for Local Development */}
      <div className="mt-8 border-t border-zinc-800/80 pt-5">
        <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-2.5">
          Local Development Role Presets:
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => handleQuickFill("superadmin@venopai.com")}
            className="rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1.5 text-left text-[11px] text-zinc-300 hover:border-zinc-700 hover:bg-zinc-850 hover:text-white transition cursor-pointer"
          >
            <span className="font-semibold text-emerald-400 block">SUPER_ADMIN</span>
            <span className="text-[10px] text-zinc-500">Full system access</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuickFill("order_mgr@venopai.com")}
            className="rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1.5 text-left text-[11px] text-zinc-300 hover:border-zinc-700 hover:bg-zinc-850 hover:text-white transition cursor-pointer"
          >
            <span className="font-semibold text-blue-400 block">ORDER_MGR</span>
            <span className="text-[10px] text-zinc-500">Catalog & Inventory</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuickFill("mfg_mgr@venopai.com")}
            className="rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1.5 text-left text-[11px] text-zinc-300 hover:border-zinc-700 hover:bg-zinc-850 hover:text-white transition cursor-pointer"
          >
            <span className="font-semibold text-cyan-400 block">MFG_MGR</span>
            <span className="text-[10px] text-zinc-500">Fabrication Queues</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuickFill("finance_mgr@venopai.com")}
            className="rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1.5 text-left text-[11px] text-zinc-300 hover:border-zinc-700 hover:bg-zinc-850 hover:text-white transition cursor-pointer"
          >
            <span className="font-semibold text-purple-400 block">FINANCE_MGR</span>
            <span className="text-[10px] text-zinc-500">Refunds & Payments</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 py-12">
      <Suspense fallback={<div className="h-64 w-full max-w-md animate-pulse rounded-2xl bg-zinc-900" />}>
        <AdminLoginForm />
      </Suspense>
    </div>
  );
}
