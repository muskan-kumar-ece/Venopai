import React from 'react';

type Status = 'pending' | 'processing' | 'completed' | 'cancelled' | 'active' | 'inactive';

interface StatusBadgeProps {
  status: Status | string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">
      {status}
    </span>
  );
};
