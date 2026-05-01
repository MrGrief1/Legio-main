import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { Gift, Bookmark } from 'lucide-react';

interface MarketCardProps {
  id: string;
  title: string;
  icon: string | React.ReactNode;
  volume: string;
  category?: string;
  status?: 'active' | 'new';
  yesPercent: number;
  noPercent: number;
  layout?: 'binary' | 'list';
  listOptions?: { name: string, percent: number }[];
}

export function MarketCard({
  id,
  title,
  icon,
  volume,
  category,
  status,
  yesPercent,
  noPercent,
  layout = 'binary',
  listOptions
}: MarketCardProps) {
  return (
    <Link 
      to={`/market/${id}`} 
      className="bg-pm-surface hover:bg-pm-surface-hover border border-pm-border rounded-xl p-4 flex flex-col transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-pm-bg border border-pm-border text-2xl">
          {typeof icon === 'string' ? icon : icon}
        </div>
        {layout === 'binary' && (
          <div className="flex flex-col items-end">
            <span className="text-xl font-semibold text-white">{yesPercent}%</span>
            <span className="text-xs text-pm-text-muted">Да</span>
          </div>
        )}
      </div>

      <h3 className="text-[15px] font-medium leading-snug text-white mb-4 flex-1 line-clamp-3 group-hover:text-pm-blue transition-colors">
        {title}
      </h3>

      {layout === 'binary' ? (
        <div className="flex items-center gap-2 mb-4">
          <button className="flex-1 bg-[rgba(34,197,94,0.15)] hover:bg-[rgba(34,197,94,0.25)] text-pm-green py-2 px-4 rounded-lg font-medium text-sm transition-colors border border-[rgba(34,197,94,0.1)]">
            Да
          </button>
          <button className="flex-1 bg-[rgba(239,68,68,0.15)] hover:bg-[rgba(239,68,68,0.25)] text-pm-red py-2 px-4 rounded-lg font-medium text-sm transition-colors border border-[rgba(239,68,68,0.1)]">
            Нет
          </button>
        </div>
      ) : (
        <div className="mb-4 space-y-2">
          {listOptions?.map((opt, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-pm-text">{opt.name}</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{opt.percent}%</span>
                <span className="text-pm-green text-xs">Да.</span>
                <span className="text-pm-red text-xs">Нет.</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-pm-border mt-auto">
        <div className="flex items-center gap-2 text-xs text-pm-text-muted">
          {status === 'active' && (
             <div className="flex items-center gap-1.5 font-medium text-[11px] uppercase tracking-wider">
               <div className="w-1.5 h-1.5 rounded-full bg-pm-red animate-pulse" />
               Активные
             </div>
          )}
          {status === 'new' && (
             <div className="flex items-center gap-1.5 font-medium text-[11px] text-yellow-500 uppercase tracking-wider">
               <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
               Новое
             </div>
          )}
          {status && <span className="text-pm-border">•</span>}
          <span>{volume} Объём</span>
          {category && (
            <>
              <span className="text-pm-border">•</span>
              <span>{category}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 text-pm-text-muted">
          <Gift className="w-4 h-4 hover:text-white transition-colors" />
          <Bookmark className="w-4 h-4 hover:text-white transition-colors" />
        </div>
      </div>
    </Link>
  );
}
