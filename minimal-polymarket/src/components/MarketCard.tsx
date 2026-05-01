import React from 'react';
import { Link } from 'react-router-dom';
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

function ProbabilityGauge({ percent, label }: { percent: number; label: string }) {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const color = clampedPercent >= 45 ? '#63c784' : clampedPercent >= 25 ? '#f5b84b' : '#ef6b67';

  return (
    <div className="w-[84px] shrink-0">
      <svg className="block h-[66px] w-[84px] overflow-visible" viewBox="0 0 84 66" role="img" aria-label={`${percent}% ${label}`}>
        <path
          d="M 14 34 A 28 28 0 0 1 70 34"
          fill="none"
          pathLength={100}
          stroke="var(--color-pm-gauge-track)"
          strokeLinecap="round"
          strokeWidth="4.5"
        />
        <path
          d="M 14 34 A 28 28 0 0 1 70 34"
          fill="none"
          pathLength={100}
          stroke={color}
          strokeDasharray={100}
          strokeDashoffset={100 - clampedPercent}
          strokeLinecap="round"
          strokeWidth="4.5"
        />
        <text
          x="42"
          y="43"
          fill="var(--color-pm-text-strong)"
          fontSize="20"
          fontWeight="700"
          textAnchor="middle"
        >
          {percent}%
        </text>
        <text
          x="42"
          y="58"
          fill="var(--color-pm-text-muted)"
          fontSize="12"
          fontWeight="600"
          textAnchor="middle"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}

function MarketIcon({ icon }: { icon: string | React.ReactNode }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-pm-surface-hover text-2xl text-pm-text-strong">
      {typeof icon === 'string' ? icon : icon}
    </div>
  );
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
  const gaugeLabel = category === 'Bitcoin' ? 'Up' : 'Да';

  return (
    <Link 
      to={`/market/${id}`} 
      className="group flex h-full min-h-[188px] flex-col rounded-xl border border-pm-border bg-pm-surface p-3.5 text-pm-text shadow-[0_1px_2px_var(--color-pm-card-shadow)] transition-all hover:-translate-y-0.5 hover:border-pm-text-muted hover:bg-pm-surface-hover hover:shadow-[0_14px_34px_var(--color-pm-card-shadow-strong)]"
    >
      <div className="mb-3 flex items-start gap-3">
        <MarketIcon icon={icon} />
        <h3 className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-pm-text-strong line-clamp-3 group-hover:text-pm-blue">
          {title}
        </h3>
        {layout === 'binary' && (
          <ProbabilityGauge percent={yesPercent} label={gaugeLabel} />
        )}
      </div>

      {layout === 'binary' ? (
        <div className="mb-3 mt-auto grid grid-cols-2 gap-2">
          <div className="flex h-10 items-center justify-center rounded-lg bg-[#22c55e]/10 px-3 text-sm font-bold text-pm-green transition-colors group-hover:bg-[#22c55e]/15">
            Да
          </div>
          <div className="flex h-10 items-center justify-center rounded-lg bg-[#ef4444]/10 px-3 text-sm font-bold text-pm-red transition-colors group-hover:bg-[#ef4444]/15">
            Нет
          </div>
        </div>
      ) : (
        <div className="mb-3 mt-auto space-y-2">
          {listOptions?.map((opt, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 text-[15px]">
              <span className="truncate font-medium text-pm-text">{opt.name}</span>
              <span className="min-w-10 text-right font-bold text-pm-text-strong">{opt.percent}%</span>
              <span className="rounded-md bg-[#22c55e]/10 px-2 py-1 text-xs font-bold text-pm-green">Да.</span>
              <span className="rounded-md bg-[#ef4444]/10 px-2 py-1 text-xs font-bold text-pm-red">Нет.</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between pt-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-pm-text-muted">
          {status === 'active' && (
             <div className="flex items-center gap-1 font-bold uppercase text-pm-red">
               <div className="h-1.5 w-1.5 rounded-full bg-pm-red" />
               Активные
             </div>
          )}
          {status === 'new' && (
             <div className="flex items-center gap-1 font-bold uppercase text-[#d7a923]">
               <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
               Новое
             </div>
          )}
          {status && <span className="text-pm-border">•</span>}
          <span className="truncate">{volume} Объём</span>
          {category && (
            <>
              <span className="text-pm-border">•</span>
              <span className="truncate">{category}</span>
            </>
          )}
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-2 text-pm-text-muted">
          <Gift className="h-4 w-4 transition-colors hover:text-pm-text-strong" />
          <Bookmark className="h-4 w-4 transition-colors hover:text-pm-text-strong" />
        </div>
      </div>
    </Link>
  );
}
