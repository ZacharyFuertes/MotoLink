import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface BadgePillProps {
  /** Optional Lucide icon component */
  icon?: LucideIcon;
  /** Text displayed inside the pill */
  text: string;
  /** Visual variant – default, success (green), or accent (cyan) */
  variant?: 'default' | 'success' | 'accent';
  /** Optional container class names */
  className?: string;
}

export const BadgePill: React.FC<BadgePillProps> = ({ icon: Icon, text, variant = 'default', className = '' }) => {
  const base = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium';
  const variants = {
    default: 'bg-slate-700 text-slate-300',
    success: 'bg-emerald-500/20 text-emerald-400',
    accent: 'bg-cyan-500/20 text-cyan-400',
  } as const;

  return (
    <span className={`${base} ${variants[variant]} ${className}`}>
      {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
      {text}
    </span>
  );
};
