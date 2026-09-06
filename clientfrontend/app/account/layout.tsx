'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
  { href: '/account/reviews', label: 'Reviews', icon: '⭐' },
  { href: '/account/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/account/settings', label: 'Settings', icon: '⚙️' },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile header */}
      <div className="lg:hidden sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-gray-900">My Account</h2>
      </div>

      <div className="max-w-7xl mx-auto flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex lg:flex-col w-64 min-h-screen bg-white border-r border-gray-200 sticky top-0 h-screen overflow-y-auto">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-semibold text-gray-900">My Account</h2>
          </div>
          <nav className="flex-1 p-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || (item.href !== '/account' && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-700 border border-blue-100'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-4 lg:p-8 min-w-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200">
        <div className="flex overflow-x-auto">
          {NAV_ITEMS.slice(0, 6).map((item) => {
            const active = pathname === item.href || (item.href !== '/account' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center min-w-[72px] py-2 px-1 text-xs transition-colors ${
                  active ? 'text-blue-600' : 'text-gray-500'
                }`}
              >
                <span className="text-lg mb-0.5">{item.icon}</span>
                <span className="truncate">{item.label.split(' ')[0]}</span>
              </Link>
            );
          })}
          <Link
            href="#more"
            className="flex flex-col items-center min-w-[72px] py-2 px-1 text-xs text-gray-500"
          >
            <span className="text-lg mb-0.5">⋯</span>
            <span>More</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
