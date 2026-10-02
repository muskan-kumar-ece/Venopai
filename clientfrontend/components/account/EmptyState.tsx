import React from 'react';
import Link from 'next/link';

interface EmptyStateProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No items found',
  message = 'There is currently no data to display here.',
  actionLabel,
  actionHref,
  icon = '📦',
}) => {
  return (
    <div className="text-center py-12 px-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-base font-semibold text-zinc-900 dark:text-white mb-1">{title}</h3>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto mb-6">{message}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="inline-flex items-center px-4 py-2 text-sm font-semibold rounded-lg text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-sm"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
};
