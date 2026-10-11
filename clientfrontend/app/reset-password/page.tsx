"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authApi } from "@/lib/api/client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryToken = searchParams.get("token") || "";

  const [token, setToken] = useState(queryToken);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token.trim()) {
      setError("Reset token is required.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await authApi.resetPassword({
        token: token.trim(),
        new_password: newPassword,
      });
      setSuccess(true);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Invalid or expired reset token.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Set New Password
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Enter your reset token and choose a secure new password
        </p>
      </div>

      {success ? (
        <div className="space-y-6">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            <p className="font-semibold">Password Reset Complete</p>
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
              Your password has been changed successfully. All previous active sessions have been securely revoked.
            </p>
          </div>

          <Link
            href="/login"
            className="w-full flex items-center justify-center rounded-lg bg-emerald-600 py-2.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors"
          >
            Sign In with New Password
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="token"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Reset Token
            </label>
            <input
              id="token"
              type="text"
              required
              suppressHydrationWarning
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste the reset token from your email"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500"
            />
          </div>

          <div>
            <label
              htmlFor="newPassword"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              New Password
            </label>
            <div className="relative">
              <input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                suppressHydrationWarning
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 pl-3.5 pr-11 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-white dark:placeholder-zinc-500 dark:focus:bg-zinc-900 transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                aria-label={showNewPassword ? "Hide password" : "Show password"}
                title={showNewPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors cursor-pointer"
              >
                {showNewPassword ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Confirm New Password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                suppressHydrationWarning
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-type new password"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 pl-3.5 pr-11 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-white dark:placeholder-zinc-500 dark:focus:bg-zinc-900 transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                title={showConfirmPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors cursor-pointer"
              >
                {showConfirmPassword ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center rounded-lg bg-zinc-900 py-2.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors cursor-pointer"
          >
            {loading ? "Updating password..." : "Update Password"}
          </button>

          <div className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
            <Link href="/login" className="hover:text-emerald-600 dark:hover:text-emerald-400">
              &larr; Back to Sign In
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12 bg-zinc-50 dark:bg-zinc-900/40">
      <Suspense fallback={<div className="h-64 w-full max-w-md animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
