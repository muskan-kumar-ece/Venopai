import React from 'react';

export const LoadingState: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 font-mono">{message}</p>
    </div>
  );
};
