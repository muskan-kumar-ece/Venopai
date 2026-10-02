'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';

const NAV_ITEMS = [
  { href: '/account', label: 'Dashboard', icon: '🏠' },
  { href: '/account/profile', label: 'Profile', icon: '👤' },
  { href: '/account/addresses', label: 'Addresses', icon: '📍' },
  { href: '/account/orders', label: 'Orders', icon: '📦' },
  { href: '/account/payments', label: 'Payments & Invoices', icon: '💳' },
  { href: '/account/manufacturing', label: 'Manufacturing', icon: '🏭' },
  { href: '/account/design', label: 'Design Requests', icon: '🔧' },
  { href: '/account/consultations', label: 'Consultations', icon: '💬' },
  { href: '/account/software', label: 'Software', icon: '💻' },
  { href: '/account/quotes', label: 'Quotes', icon: '📄' },
  { href: '/account/projects', label: 'Projects', icon: '📂' },
  { href: '/account/files', label: 'Project Files', icon: '📁' },
  { href: '/account/reviews', label: 'Reviews', icon: '⭐' },
  { href: '/account/feedback', label: 'Feedback & Reports', icon: '📝' },
  { href: '/account/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/account/settings', label: 'Settings', icon: '⚙️' },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();
  const [showMobileDrawer, setShowMobileDrawer] = React.useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-900 border-t-transparent dark:border-white" />
          <p className="text-xs text-zinc-500 font-mono">Verifying credentials...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 mb-4">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Authentication Required
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
            Please sign in to access your VenopAI account, orders, design files, and engineering projects.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={`/login?redirect=${encodeURIComponent(pathname || '/account')}`}
              className="inline-flex justify-center items-center rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-5 py-2.5 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
            >
              Sign In to Account
            </Link>
            <Link
              href={`/register?redirect=${encodeURIComponent(pathname || '/account')}`}
              className="inline-flex justify-center items-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 px-5 py-2.5 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-16 lg:pb-0 text-zinc-900 dark:text-zinc-100">
      {/* Mobile header */}
      <div className="lg:hidden sticky top-0 z-40 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">My Account</h2>
        <button
          onClick={() => setShowMobileDrawer(true)}
          className="text-xs font-semibold px-2.5 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          All Menus ☰
        </button>
      </div>

      <div className="flex w-full min-h-[calc(100vh-4rem)]">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex lg:flex-col w-56 xl:w-60 shrink-0 bg-white dark:bg-zinc-900 border-r border-zinc-200/90 dark:border-zinc-800/80 sticky top-16 h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)]">
          <div className="px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between shrink-0">
            <h2 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-white uppercase tracking-wider">
              My Account
            </h2>
          </div>
          <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto custom-scrollbar">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || (item.href !== '/account' && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200/90 dark:border-emerald-800/80 font-bold shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/70 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  <span className="text-sm shrink-0">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 xl:p-10">
          <div className="max-w-6xl w-full">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex overflow-x-auto">
          {NAV_ITEMS.slice(0, 5).map((item) => {
            const active = pathname === item.href || (item.href !== '/account' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center min-w-[72px] py-2 px-1 text-xs transition-colors ${
                  active ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                <span className="text-lg mb-0.5">{item.icon}</span>
                <span className="truncate">{item.label.split(' ')[0]}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setShowMobileDrawer(true)}
            className="flex flex-col items-center min-w-[72px] py-2 px-1 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <span className="text-lg mb-0.5">⋯</span>
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Modal */}
      {showMobileDrawer && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 rounded-t-2xl max-h-[85vh] overflow-y-auto p-5 space-y-4 border-t border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Account Navigation</h3>
              <button
                onClick={() => setShowMobileDrawer(false)}
                className="text-xs px-2.5 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold"
              >
                ✕ Close
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href || (item.href !== '/account' && pathname?.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMobileDrawer(false)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium transition ${
                      active
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-200 dark:border-emerald-800'
                        : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
