"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/account";

  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await login(email, password);
      if (user.status === "registered") {
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
      } else {
        router.push(redirectUrl);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Invalid email or password. Please check your credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto rounded-3xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
      {/* Left Column: Form */}
      <div className="p-8 sm:p-10 lg:col-span-7 flex flex-col justify-between">
        <div>
          <div className="mb-6">
            <Link href="/" className="inline-block mb-3">
              <img
                src="/images/brand/venopai_wordmark.png"
                alt="VenoPai"
                className="h-8 w-auto object-contain dark:brightness-110"
              />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Customer Sign In
            </h1>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Access your hardware engineering projects, quotes, and orders
            </p>
          </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
          >
            Email Address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            suppressHydrationWarning
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@domain.com"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            suppressHydrationWarning
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center rounded-lg bg-zinc-900 py-2.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:focus:ring-offset-zinc-900 transition-colors cursor-pointer"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>Signing in...</span>
            </div>
          ) : (
            "Sign In"
          )}
        </button>
      </form>

      {process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === "true" && (
        <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => {
              setEmail("customer@venopai.com");
              setPassword("CustomerPass123!");
              setError(null);
            }}
            className="w-full text-center text-xs text-zinc-500 hover:text-emerald-500 py-1.5 px-3 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-750 transition cursor-pointer"
          >
            Quick Fill Test Customer (<span className="font-mono text-emerald-600 dark:text-emerald-400">customer@venopai.com</span>)
          </button>
        </div>
      )}

      <div className="mt-4 border-t border-zinc-200 pt-4 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        Don&apos;t have an account?{" "}
        <Link
          href={`/register${redirectUrl !== "/account" ? `?redirect=${encodeURIComponent(redirectUrl)}` : ""}`}
          className="font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
        >
          Create account
        </Link>
      </div>
    </div>
  </div>

      {/* Right Column: Branded Showcase Panel */}
      <div className="hidden lg:flex flex-col justify-between p-8 bg-zinc-900 border-l border-zinc-800 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-950/20 via-zinc-950 to-orange-950/20 pointer-events-none" />
        <div className="relative z-10 flex flex-col h-full justify-between">
          <div className="rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl bg-white p-2">
            <img
              src="/images/brand/venopai_brand_card.jpg"
              alt="VenoPai - Tech Today. Brighter Tomorrow."
              className="w-full h-auto object-contain rounded-xl"
            />
          </div>
          <div className="pt-6 border-t border-zinc-800/80 mt-6">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-mono text-zinc-300 uppercase tracking-wider font-semibold">
                Unified Engineering Platform
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Order hardware, upload custom PCB designs, request firmware, and track real-time manufacturing realization.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12 bg-zinc-50 dark:bg-zinc-900/40">
      <Suspense fallback={<div className="h-64 w-full max-w-md animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
