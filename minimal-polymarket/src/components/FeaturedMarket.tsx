import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowUpRight, PlusCircle } from 'lucide-react';
import { Area, ComposedChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { api, type Market } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';

function formatMoney(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

type FeaturedPoint = { t: number; yes: number };

export function FeaturedMarket({ market }: { market?: Market }) {
  const { user } = useAuth();
  const { t, locale, categoryLabel } = useI18n();
  const [history, setHistory] = useState<FeaturedPoint[]>([]);

  // The list endpoint only carries a minimal history; fetch the market detail
  // for the full price series that feeds the featured chart.
  useEffect(() => {
    if (!market) return undefined;

    let ignore = false;
    api.getMarket(market.id)
      .then(({ market: detail }) => {
        if (ignore) return;
        setHistory(detail.history.map((point) => ({
          t: new Date(point.time).getTime(),
          yes: point.yesPercent,
        })));
      })
      .catch(() => { /* keep the card without a chart on failure */ });

    return () => { ignore = true; };
  }, [market?.id]);

  if (!market) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex min-h-[260px] flex-col justify-center rounded-[28px] border border-dashed border-pm-border bg-pm-surface p-5 sm:min-h-[320px] sm:p-6"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-pm-surface-hover text-pm-blue">
          <PlusCircle className="h-6 w-6" />
        </div>
        <h2 className="max-w-xl text-2xl font-bold text-pm-text-strong">{t('featured.emptyTitle')}</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-pm-text-muted">
          {user?.isAdmin
            ? t('featured.emptyAdmin')
            : t('featured.emptyUser')}
        </p>
        {user?.isAdmin && (
          <Link
            to="/create"
            className="mt-6 inline-flex h-11 w-fit items-center gap-2 rounded-full bg-pm-blue px-5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
          >
            {t('common.createMarket')}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        )}
      </motion.div>
    );
  }

  const up = history.length > 1 ? history[history.length - 1].yes >= history[0].yes : true;
  const lineColor = up ? '#22c55e' : '#ef4444';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-[28px] border border-pm-border bg-pm-surface p-3.5 transition-colors hover:border-pm-text-muted sm:p-4 lg:p-5"
    >
      <div className="mb-4 flex items-start justify-between gap-3 sm:mb-5 sm:gap-4">
        <div className="min-w-0">
          <div className="mb-2 text-sm font-semibold text-pm-text-muted">{categoryLabel(market.category)}</div>
          <Link to={`/market/${market.id}`} className="group">
            <h2 className="text-lg font-bold leading-tight text-pm-text-strong group-hover:text-pm-blue sm:text-xl lg:text-2xl">
              {market.title}
            </h2>
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm font-semibold text-pm-text-muted">
            <span>{formatMoney(market.volume, locale)} {t('common.volume')}</span>
            <span>•</span>
            <span>{market.tradeCount} {t('common.trades')}</span>
            <span>•</span>
            <span>{t('common.until')} {formatDate(market.closeDate, locale)}</span>
          </div>
        </div>
        <Link
          to={`/market/${market.id}`}
          aria-label={t('common.openMarket')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-pm-surface-hover text-pm-text transition-colors hover:text-pm-text-strong"
        >
          <ArrowUpRight className="h-5 w-5" />
        </Link>
      </div>

      {/* Featured probability chart — animated line of YES over time. */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: lineColor }} />
          <span className="text-sm font-semibold text-pm-text-muted">{t('common.yes')}</span>
          <span className="text-2xl font-bold text-pm-text-strong">{market.yesPercent}%</span>
        </div>
        <Link to={`/market/${market.id}`} className="text-sm font-bold text-pm-blue transition-colors hover:text-blue-400">
          {t('common.openMarket')}
        </Link>
      </div>

      <div className="mb-4 h-[150px] w-full">
        {history.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={history} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="featuredYesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={[0, 100]} />
              <Area type="stepAfter" dataKey="yes" stroke="none" fill="url(#featuredYesFill)" />
              <Line type="stepAfter" dataKey="yes" stroke={lineColor} strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-pm-border text-sm font-semibold text-pm-text-muted">
            {t('common.noData')}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-[24px] border border-[#22c55e]/25 bg-[#22c55e]/10 p-4">
          <div className="mb-2 text-sm font-bold text-pm-green">{t('common.yes')}</div>
          <div className="text-4xl font-bold text-pm-text-strong">{market.yesPercent}%</div>
          <div className="mt-2 text-sm font-semibold text-pm-text-muted">{t('featured.sharePrice', { price: market.yesPrice })}</div>
        </div>
        <div className="rounded-[24px] border border-[#ef4444]/25 bg-[#ef4444]/10 p-4">
          <div className="mb-2 text-sm font-bold text-pm-red">{t('common.no')}</div>
          <div className="text-4xl font-bold text-pm-text-strong">{market.noPercent}%</div>
          <div className="mt-2 text-sm font-semibold text-pm-text-muted">{t('featured.sharePrice', { price: market.noPrice })}</div>
        </div>
      </div>

      {market.description && (
        <p className="mt-4 line-clamp-3 text-sm leading-6 text-pm-text">
          {market.description}
        </p>
      )}
    </motion.div>
  );
}
