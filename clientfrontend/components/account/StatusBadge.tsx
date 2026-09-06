import React from 'react';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getColors = (s: string) => {
    const normalized = s.toLowerCase();
    switch (normalized) {
      case 'active':
      case 'completed':
      case 'delivered':
      case 'paid':
      case 'approved':
      case 'verified':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'pending':
      case 'submitted':
      case 'draft':
      case 'initiated':
      case 'in_review':
      case 'reviewing':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'in_progress':
      case 'processing':
      case 'shipped':
      case 'manufacturing':
      case 'fabrication':
      case 'assembly':
      case 'testing':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'cancelled':
      case 'failed':
      case 'rejected':
      case 'expired':
      case 'superseded':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${getColors(
        status
      )}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
};
