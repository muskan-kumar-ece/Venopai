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
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="w-full max-w-4xl mx-auto rounded-3xl border border-zinc-200/80 bg-white shadow-2xl dark:border-zinc-800/80 dark:bg-zinc-950 overflow-hidden grid grid-cols-1 lg:grid-cols-12 backdrop-blur-sm">
      {/* Left Column: Form */}
      <div className="p-8 sm:p-10 lg:p-12 lg:col-span-7 flex flex-col justify-between">
        <div>
          <div className="mb-8">
            <Link href="/" className="inline-block mb-4 transition-transform hover:scale-[1.02]">
              <img
                src="/images/brand/venopai_wordmark.png"
                alt="VenoPai"
                className="h-8 w-auto object-contain dark:brightness-110"
              />
            </Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
              Customer Sign In
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              Access your hardware engineering projects, quotes, and orders
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50/90 p-4 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400 shadow-xs">
              <div className="flex items-center gap-2.5">
                <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5"
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
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-white dark:placeholder-zinc-500 dark:focus:bg-zinc-900 transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                >
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  suppressHydrationWarning
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 pl-3.5 pr-11 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-white dark:placeholder-zinc-500 dark:focus:bg-zinc-900 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    /* Eye Off Icon */
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                      />
                    </svg>
                  ) : (
                    /* Eye On Icon */
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center rounded-xl bg-zinc-900 py-3 px-4 text-sm font-semibold text-white shadow-md hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:focus:ring-offset-zinc-950 transition-all cursor-pointer font-medium active:scale-[0.99]"
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
            <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800/80">
              <button
                type="button"
                onClick={() => {
                  setEmail("customer@venopai.com");
                  setPassword("CustomerPass123!");
                  setError(null);
                }}
                className="w-full text-center text-xs text-zinc-500 hover:text-emerald-500 py-2 px-3 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 hover:border-emerald-500/50 transition cursor-pointer"
              >
                Quick Fill Test Customer (<span className="font-mono text-emerald-600 dark:text-emerald-400">customer@venopai.com</span>)
              </button>
            </div>
          )}

          <div className="mt-6 border-t border-zinc-100 pt-5 text-center text-xs sm:text-sm text-zinc-600 dark:border-zinc-800/80 dark:text-zinc-400">
            Don&apos;t have an account?{" "}
            <Link
              href={`/register${redirectUrl !== "/account" ? `?redirect=${encodeURIComponent(redirectUrl)}` : ""}`}
              className="font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 hover:underline"
            >
              Create account
            </Link>
          </div>
        </div>
      </div>

      {/* Right Column: Branded Showcase Panel */}
      <div className="hidden lg:flex flex-col justify-between p-10 bg-gradient-to-b from-zinc-900 to-zinc-950 border-l border-zinc-800/80 lg:col-span-5 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/10 via-transparent to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex flex-col h-full justify-between space-y-6">
          <div className="rounded-2xl overflow-hidden border border-zinc-700/60 shadow-2xl bg-zinc-900">
            <img
              src="/images/brand/venopai_brand_card.jpg"
              alt="VenoPai - Tech Today. Brighter Tomorrow."
              className="w-full h-auto object-cover rounded-xl"
            />
          </div>

          <div className="pt-6 border-t border-zinc-800/80">
            <div className="flex items-center gap-2 mb-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-mono text-zinc-300 uppercase tracking-wider font-semibold">
                Unified Engineering Platform
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Order hardware catalog components, upload custom PCB designs, request firmware, and track real-time manufacturing realization.
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
