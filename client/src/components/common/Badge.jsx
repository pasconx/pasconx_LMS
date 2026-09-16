import React from 'react';

export function Badge({ children, variant = 'default', size = 'md' }) {
  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5'
  };

  const variantClasses = {
    default: 'bg-slate-100 text-slate-700 border-slate-200',
    primary: 'bg-brand-50 text-brand-700 border-brand-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    expired: 'bg-red-100 text-red-800 border-red-300 font-semibold'
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border shadow-2xs transition-colors ${
        sizeClasses[size] || sizeClasses.md
      } ${variantClasses[variant] || variantClasses.default}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status, isExpired, isFuture }) {
  if (isExpired) {
    return <Badge variant="expired">Expired</Badge>;
  }
  if (isFuture) {
    return <Badge variant="warning">Scheduled</Badge>;
  }
  if (status === 'ACTIVE') {
    return <Badge variant="success">Active</Badge>;
  }
  if (status === 'DISABLED' || status === 'INACTIVE') {
    return <Badge variant="danger">Disabled</Badge>;
  }
  if (status === 'ARCHIVED') {
    return <Badge variant="default">Archived</Badge>;
  }
  return <Badge variant="default">{status}</Badge>;
}
