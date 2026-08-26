import React from 'react';
import { Check, Phone, Mail, MapPin } from 'lucide-react';
import { BadgePill } from './BadgePill';

interface HeaderCardProps {
  shop: {
    name: string;
    rating?: number;
    description?: string;
    location?: string;
    phone?: string;
    email?: string;
    isVerified?: boolean;
    status: { label: string; text: string };
  };
}

export const HeaderCard: React.FC<HeaderCardProps> = ({ shop }) => {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 relative">
      {/* Verified badge */}
      {shop.isVerified && (
        <BadgePill
          icon={Check}
          text="Verified Shop"
          variant="success"
          className="absolute top-4 right-4"
        />
      )}
      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
        <h1 className="text-3xl font-bold text-white flex-1">{shop.name}</h1>
        {shop.rating !== undefined && (
          <span className="inline-flex items-center gap-1 bg-cyan-500/20 text-cyan-400 text-sm font-medium px-2 py-1 rounded-full">
            <svg className="w-4 h-4" fill="currentColor"><path d="M12 .587l3.668 7.431 8.2 1.193-5.934 5.787 1.402 8.169L12 18.896l-7.336 3.86 1.402-8.169-5.934-5.787 8.2-1.193z"/></svg>
            {shop.rating.toFixed(1)}
          </span>
        )}
      </div>
      <p className="text-slate-300 mt-2 max-w-2xl">{shop.description}</p>
      <div className="flex flex-wrap gap-2 mt-4">
        {shop.location && (
          <BadgePill icon={MapPin} text={shop.location} variant="default" />
        )}
        {shop.phone && (
          <BadgePill icon={Phone} text={shop.phone} variant="default" />
        )}
        {shop.email && (
          <BadgePill icon={Mail} text={shop.email} variant="default" />
        )}
      </div>
      <div className="mt-4">
        <BadgePill
          text={shop.status.label}
          variant="success"
          className="text-emerald-400 shadow-emerald-500/30 animate-pulse"
        />
      </div>
    </div>
  );
};
