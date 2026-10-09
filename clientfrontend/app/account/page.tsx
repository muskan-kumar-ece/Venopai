'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { profileApi,
  ordersApi,
  quotesApi,
  paymentsApi,
  notificationsApi,
  manufacturingApi,
  designApi,
  consultationsApi,
  softwareApi,
  getCustomerToken,
} from "@/lib/api/client";
import { StatusBadge } from '@/components/account/StatusBadge';
import { LoadingState } from '@/components/account/LoadingState';

interface DashboardData {
  user: { full_name?: string; email?: string; status?: string } | null;
  ordersCount: number;
  activeOrders: Array<{ id: string; order_number: string; status: string; total_amount: string; created_at: string }>;
  quotesNeedingAttention: Array<{ id: string; quote_number: string; status: string; total_amount: string }>;
  pendingPayments: Array<{ id: string; amount: string; status: string; created_at: string }>;
  recentNotifications: Array<{ id: string; title: string; message: string; created_at: string }>;
  activeRequestsCount: number;
}

export default function AccountDashboard() {
  const [data, setData] = useState<DashboardData>({
    user: null,
    ordersCount: 0,
    activeOrders: [],
    quotesNeedingAttention: [],
    pendingPayments: [],
    recentNotifications: [],
    activeRequestsCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      try {
        const token = getCustomerToken() || undefined;
        
        const [
          profileRes,
          ordersRes,
          quotesRes,
          paymentsRes,
          notifsRes,
          mfgRes,
          designRes,
          consultRes,
          softwareRes,
        ] = await Promise.allSettled([
          profileApi.getProfile(token),
          ordersApi.listOrders({ page_size: 5 }, token),
          quotesApi.listQuotes(token),
          paymentsApi.listPayments({ page_size: 5 }, token),
          notificationsApi.listNotifications({ page_size: 5 }, token),
          manufacturingApi.listRequests({ page_size: 10 }, token),
          designApi.listRequests({ page_size: 10 }, token),
          consultationsApi.listRequests({ page_size: 10 }, token),
          softwareApi.listRequests({ page_size: 10 }, token),
        ]);

        const user = profileRes.status === 'fulfilled' ? profileRes.value?.data : null;
        
        const ordersList = ordersRes.status === 'fulfilled' ? ordersRes.value?.data || [] : [];
        const activeOrders = ordersList.filter((o: { status: string }) =>
          ['created', 'processing', 'confirmed'].includes(o.status)
        );

        const quotesList = quotesRes.status === 'fulfilled' ? quotesRes.value?.data || [] : [];
        const quotesNeedingAttention = quotesList.filter((q: { status: string }) =>
          ['sent', 'pending_approval', 'quoted'].includes(q.status)
        );

        const paymentsList = paymentsRes.status === 'fulfilled' ? paymentsRes.value?.data || [] : [];
        const pendingPayments = paymentsList.filter((p: { status: string }) =>
          ['initiated', 'pending'].includes(p.status)
        );

        const recentNotifications = notifsRes.status === 'fulfilled' ? notifsRes.value?.data || [] : [];

        let activeRequestsCount = 0;
        if (mfgRes.status === 'fulfilled') {
          activeRequestsCount += (mfgRes.value?.data || []).filter((r: { status: string }) => r.status !== 'completed' && r.status !== 'cancelled').length;
        }
        if (designRes.status === 'fulfilled') {
          activeRequestsCount += (designRes.value?.data || []).filter((r: { status: string }) => r.status !== 'completed' && r.status !== 'cancelled').length;
        }
        if (consultRes.status === 'fulfilled') {
          activeRequestsCount += (consultRes.value?.data || []).filter((r: { status: string }) => r.status !== 'closed' && r.status !== 'completed').length;
        }
        if (softwareRes.status === 'fulfilled') {
          activeRequestsCount += (softwareRes.value?.data || []).filter((r: { status: string }) => r.status !== 'completed' && r.status !== 'cancelled').length;
        }

        setData({
          user,
          ordersCount: ordersList.length,
          activeOrders: activeOrders.slice(0, 3),
          quotesNeedingAttention: quotesNeedingAttention.slice(0, 3),
          pendingPayments: pendingPayments.slice(0, 3),
          recentNotifications: recentNotifications.slice(0, 4),
          activeRequestsCount,
        });
      } catch (e) {
        console.error('Error loading dashboard:', e);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  if (loading) {
    return <LoadingState message="Loading your account dashboard..." />;
  }

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-emerald-950 border border-zinc-800 text-white rounded-2xl p-6 lg:p-8 shadow-sm">
        <h1 className="text-2xl lg:text-3xl font-bold mb-2">
          Welcome back, {data.user?.full_name || 'Engineer'}
        </h1>
        <p className="text-zinc-300 text-sm lg:text-base max-w-xl">
          Manage your hardware manufacturing, engineering designs, firmwares, quotes, and active shipments in one unified workspace.
        </p>
      </div>

      {/* Action-oriented metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Active Orders</span>
          <div className="text-2xl font-bold text-zinc-900 dark:text-white mt-2">{data.activeOrders.length}</div>
          <Link href="/account/orders" className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 mt-2 inline-block">
            View orders →
          </Link>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Engineering Requests</span>
          <div className="text-2xl font-bold text-zinc-900 dark:text-white mt-2">{data.activeRequestsCount}</div>
          <Link href="/account/manufacturing" className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 mt-2 inline-block">
            View requests →
          </Link>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Quotes Requiring Action</span>
          <div className="text-2xl font-bold text-amber-500 mt-2">{data.quotesNeedingAttention.length}</div>
          <Link href="/account/quotes" className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 mt-2 inline-block">
            Review quotes →
          </Link>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Pending Payments</span>
          <div className="text-2xl font-bold text-zinc-900 dark:text-white mt-2">{data.pendingPayments.length}</div>
          <Link href="/account/payments" className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 mt-2 inline-block">
            View payments →
          </Link>
        </div>
      </div>

      {/* Main sections grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Active Orders Card */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Active Orders</h2>
            <Link href="/account/orders" className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500">
              View all
            </Link>
          </div>
          {data.activeOrders.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 py-4">No active orders right now.</p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.activeOrders.map((order) => (
                <div key={order.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900 dark:text-white">{order.order_number}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">{order.created_at?.slice(0, 10)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-zinc-900 dark:text-white">₹{order.total_amount}</span>
                    <StatusBadge status={order.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quotes Requiring Attention */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Quotes Requiring Attention</h2>
            <Link href="/account/quotes" className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500">
              View all
            </Link>
          </div>
          {data.quotesNeedingAttention.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 py-4">No pending quotes requiring attention.</p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.quotesNeedingAttention.map((quote) => (
                <div key={quote.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900 dark:text-white">{quote.quote_number}</div>
                    <div className="text-xs text-amber-500">Action required</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-zinc-900 dark:text-white">₹{quote.total_amount}</span>
                    <StatusBadge status={quote.status} />
                    <Link
                      href={`/account/quotes/${quote.id}`}
                      className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-500 transition-colors"
                    >
                      Review
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Notifications (Send-History Log preview) */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Recent Notifications (Audit History)</h2>
          <Link href="/account/notifications" className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500">
            View full log
          </Link>
        </div>
        {data.recentNotifications.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 py-4">No recent notification events logged.</p>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {data.recentNotifications.map((notif) => (
              <div key={notif.id} className="py-3 flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-white">{notif.title}</div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5">{notif.message}</div>
                </div>
                <div className="text-xs text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
                  {notif.created_at ? new Date(notif.created_at).toLocaleDateString() : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Launchpad to all sections */}
      <div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Account Workspace</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            href="/account/manufacturing"
            className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-emerald-500 dark:hover:border-emerald-500/80 hover:shadow-sm transition text-left"
          >
            <div className="text-2xl mb-2">🏭</div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-white">Manufacturing</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">PCB, CNC, 3D printing requests</div>
          </Link>

          <Link
            href="/account/design"
            className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-emerald-500 dark:hover:border-emerald-500/80 hover:shadow-sm transition text-left"
          >
            <div className="text-2xl mb-2">🔧</div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-white">Electronics Design</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Schematics & PCB layouts</div>
          </Link>

          <Link
            href="/account/consultations"
            className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-emerald-500 dark:hover:border-emerald-500/80 hover:shadow-sm transition text-left"
          >
            <div className="text-2xl mb-2">💬</div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-white">Consultations</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Hardware engineering advice</div>
          </Link>

          <Link
            href="/account/software"
            className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-emerald-500 dark:hover:border-emerald-500/80 hover:shadow-sm transition text-left"
          >
            <div className="text-2xl mb-2">💻</div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-white">Firmware & Software</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Embedded C/C++, RTOS, Linux</div>
          </Link>

          <Link
            href="/account/projects"
            className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-emerald-500 dark:hover:border-emerald-500/80 hover:shadow-sm transition text-left"
          >
            <div className="text-2xl mb-2">📂</div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-white">Projects</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Group cross-service assets</div>
          </Link>

          <Link
            href="/account/addresses"
            className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-emerald-500 dark:hover:border-emerald-500/80 hover:shadow-sm transition text-left"
          >
            <div className="text-2xl mb-2">📍</div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-white">Addresses</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Manage delivery locations</div>
          </Link>

          <Link
            href="/account/reviews"
            className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-emerald-500 dark:hover:border-emerald-500/80 hover:shadow-sm transition text-left"
          >
            <div className="text-2xl mb-2">⭐</div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-white">Reviews</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Feedback on delivered items</div>
          </Link>

          <Link
            href="/account/settings"
            className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-emerald-500 dark:hover:border-emerald-500/80 hover:shadow-sm transition text-left"
          >
            <div className="text-2xl mb-2">⚙️</div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-white">Settings</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Password & notifications</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
