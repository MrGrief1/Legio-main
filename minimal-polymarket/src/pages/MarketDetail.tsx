import { type FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Bookmark,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  Info,
  Link as LinkIcon,
  ShieldCheck,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { PriceChart } from '../components/PriceChart';
import { api, ApiError, type Market, type Outcome, type TradeSide, type TradeQuote } from '../lib/api';
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
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatShortDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}

function categoryIcon(category: string) {
  const normalized = category.toLowerCase();

  if (normalized.includes('крипто') || normalized.includes('bitcoin') || normalized.includes('btc')) return '₿';
  if (normalized.includes('спорт')) return '🏟';
  if (normalized.includes('sport')) return '🏟';
  if (normalized.includes('полит')) return '◎';
  if (normalized.includes('polit')) return '◎';
  if (normalized.includes('финанс')) return '$';
  if (normalized.includes('finance')) return '$';
  if (normalized.includes('тех')) return '⌘';
  if (normalized.includes('tech')) return '⌘';

  return category.slice(0, 2).toUpperCase();
}

function TradePanel({
  market,
  onMarketUpdated,
}: {
  market: Market;
  onMarketUpdated: (market: Market) => void;
}) {
  const { user } = useAuth();
  const { t, locale, outcomeLabel } = useI18n();
  const [outcome, setOutcome] = useState<Outcome>('YES');
  const [side, setSide] = useState<TradeSide>('BUY');
  const [amount, setAmount] = useState('10');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const isSettled = market.status === 'resolved' || market.status === 'canceled';
  const isClosed = market.status !== 'open' || new Date(market.closeDate).getTime() <= Date.now();
  const priceCents = market.quotes[outcome].ask;
  const numericAmount = Number(amount);
  const balance = Math.round(market.viewer?.balance ?? user?.balance ?? 0);
  const position = market.viewer?.positions[outcome] ?? { shares: 0, avgPriceCents: 0 };
  const viewerPosition = position.shares;
  const validAmount = Number.isFinite(numericAmount) && numericAmount >= 1 && numericAmount <= 10000;
  const overSell = side === 'SELL' && numericAmount > viewerPosition + 1e-6;

  // Position value + unrealized P&L for the selected outcome.
  const currentValue = viewerPosition * (priceCents / 100);
  const unrealizedPnl = viewerPosition * ((priceCents - position.avgPriceCents) / 100);

  // Live quote: debounced preview of the exact fill from the server.
  useEffect(() => {
    if (!validAmount || isSettled || overSell) {
      setQuote(null);
      setIsQuoting(false);
      return;
    }

    let cancelled = false;
    setIsQuoting(true);
    const handle = setTimeout(() => {
      api.quote(market.id, { outcome, side, amount: numericAmount })
        .then((res) => { if (!cancelled) setQuote(res.quote); })
        .catch(() => { if (!cancelled) setQuote(null); })
        .finally(() => { if (!cancelled) setIsQuoting(false); });
    }, 220);

    return () => { cancelled = true; clearTimeout(handle); };
    // Re-quote when the market state moves (yesPercent/tradeCount) or inputs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market.id, market.yesPercent, market.tradeCount, outcome, side, numericAmount, validAmount, isSettled, overSell]);

  const setBuyAmount = (next: number) => {
    setMessage('');
    setAmount(String(Math.max(1, Math.min(10000, Math.round(next)))));
  };

  const setSellFraction = (fraction: number) => {
    setMessage('');
    setAmount(String(Math.max(0, Math.floor(viewerPosition * fraction * 100) / 100)));
  };

  const adjustAmount = (direction: 1 | -1) => {
    setMessage('');
    setAmount((current) => {
      const currentNumber = Number(current);
      return String(Math.max(0, Math.min(10000, Math.round((Number.isFinite(currentNumber) ? currentNumber : 0) + direction))));
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');

    if (!user) {
      setMessageTone('error');
      setMessage(t('market.loginToVote'));
      return;
    }

    setIsSubmitting(true);

    try {
      // Slippage guard: allow a small buffer over the quoted average fill.
      const slippage = quote
        ? side === 'BUY'
          ? { maxPriceCents: Math.min(99, Math.round(quote.avgPriceCents) + 5) }
          : { minPriceCents: Math.max(1, Math.round(quote.avgPriceCents) - 5) }
        : {};
      const response = await api.trade(market.id, { outcome, side, amount: numericAmount, ...slippage });

      onMarketUpdated(response.market);
      setMessageTone('success');
      setMessage(side === 'BUY' ? t('market.buyDone') : t('market.sellDone'));
    } catch (error) {
      setMessageTone('error');
      setMessage(error instanceof ApiError ? error.message : t('market.tradeFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSettled) {
    return (
      <aside className="self-start rounded-[28px] border border-pm-border bg-pm-surface p-5 shadow-[0_18px_44px_var(--color-pm-card-shadow-strong)] lg:sticky lg:top-24">
        {market.status === 'resolved' ? (
          <div className="rounded-[20px] border border-pm-blue/30 bg-pm-blue/10 p-4 text-center">
            <ShieldCheck className="mx-auto mb-2 h-6 w-6 text-pm-blue" />
            <p className="text-base font-bold text-pm-text-strong">
              {t('market.resolvedBanner', { outcome: outcomeLabel((market.winningOutcome ?? 'YES') as Outcome) })}
            </p>
            <p className="mt-1 text-xs font-semibold text-pm-text-muted">{t('market.payoutHint')}</p>
          </div>
        ) : (
          <div className="rounded-[20px] border border-pm-border bg-pm-bg/35 p-4 text-center text-sm font-semibold text-pm-text-muted">
            {t('market.canceledBanner')}
          </div>
        )}
      </aside>
    );
  }

  const disabled = isSubmitting || isClosed || !validAmount || overSell
    || (side === 'BUY' && !!quote && quote.cost > balance + 1e-6);

  return (
    <aside className="self-start rounded-[28px] border border-pm-border bg-pm-surface shadow-[0_18px_44px_var(--color-pm-card-shadow-strong)] lg:sticky lg:top-24">
      <div className="flex items-center gap-3 border-b border-pm-border p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pm-surface-hover text-xl font-bold text-pm-text-strong">
          {categoryIcon(market.category)}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-pm-text-strong">{t('market.tradeTitle')}</h2>
          <p className="text-xs font-medium text-pm-text-muted">{t('market.orderMode')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-pm-bg/45 p-1">
          {(['BUY', 'SELL'] as TradeSide[]).map((nextSide) => (
            <button
              key={nextSide}
              type="button"
              onClick={() => {
                setSide(nextSide);
                setAmount(nextSide === 'BUY' ? '10' : '1');
                setMessage('');
              }}
              className={
                side === nextSide
                  ? 'h-9 rounded-full bg-pm-surface text-sm font-bold text-pm-text-strong shadow-[0_1px_2px_var(--color-pm-card-shadow)]'
                  : 'h-9 rounded-full text-sm font-bold text-pm-text-muted transition-colors hover:text-pm-text-strong'
              }
            >
              {nextSide === 'BUY' ? t('common.buy') : t('common.sell')}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setOutcome('YES')}
            className={
              outcome === 'YES'
                ? 'h-12 rounded-2xl bg-[#22c55e]/75 text-base font-bold text-white transition-colors hover:bg-[#22c55e]/90'
                : 'h-12 rounded-2xl bg-pm-surface-hover text-base font-bold text-pm-text-muted transition-colors hover:text-pm-text-strong'
            }
          >
            {t('common.yes')} {market.quotes.YES.ask}¢
          </button>
          <button
            type="button"
            onClick={() => setOutcome('NO')}
            className={
              outcome === 'NO'
                ? 'h-12 rounded-2xl bg-[#ef4444]/75 text-base font-bold text-white transition-colors hover:bg-[#ef4444]/90'
                : 'h-12 rounded-2xl bg-pm-surface-hover text-base font-bold text-pm-text-muted transition-colors hover:text-pm-text-strong'
            }
          >
            {t('common.no')} {market.quotes.NO.ask}¢
          </button>
        </div>

        <div className="flex items-end justify-between gap-4">
          <label className="text-base font-bold text-pm-text-strong" htmlFor="trade-amount">
            {side === 'BUY' ? t('market.amount') : t('common.shares')}
          </label>
          <div className="group/amount flex items-center justify-end gap-1">
            <input
              id="trade-amount"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setMessage('');
              }}
              inputMode="decimal"
              min="1"
              max="10000"
              type="number"
              step="1"
              required
              className="market-number-input w-24 bg-transparent text-right text-4xl font-bold text-pm-text-strong outline-none placeholder:text-pm-text-muted"
            />
            <div className="pointer-events-none flex h-11 w-7 shrink-0 scale-95 flex-col overflow-hidden rounded-xl border border-pm-border bg-pm-bg/45 opacity-0 transition-all duration-150 group-hover/amount:pointer-events-auto group-hover/amount:scale-100 group-hover/amount:opacity-100">
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => adjustAmount(1)}
                className="flex flex-1 items-center justify-center text-pm-text-muted transition-colors hover:bg-pm-surface-hover hover:text-pm-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pm-blue"
                aria-label={t('market.increaseAmount')}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <div className="h-px bg-pm-border" />
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => adjustAmount(-1)}
                className="flex flex-1 items-center justify-center text-pm-text-muted transition-colors hover:bg-pm-surface-hover hover:text-pm-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pm-blue"
                aria-label={t('market.decreaseAmount')}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {side === 'BUY'
            ? [10, 100, 500].map((value) => (
                <button
                  key={`buy-${value}`}
                  type="button"
                  onClick={() => setBuyAmount(value)}
                  className="h-9 rounded-2xl border border-pm-border text-sm font-bold text-pm-text-muted transition-colors hover:border-pm-text-muted hover:text-pm-text-strong"
                >
                  {value}
                </button>
              ))
            : [0.25, 0.5].map((fraction) => (
                <button
                  key={`sell-${fraction}`}
                  type="button"
                  onClick={() => setSellFraction(fraction)}
                  className="h-9 rounded-2xl border border-pm-border text-sm font-bold text-pm-text-muted transition-colors hover:border-pm-text-muted hover:text-pm-text-strong"
                >
                  {Math.round(fraction * 100)}%
                </button>
              ))}
          <button
            type="button"
            onClick={() => (side === 'BUY' ? setBuyAmount(balance) : setSellFraction(1))}
            className="h-9 rounded-2xl border border-pm-border text-sm font-bold text-pm-text-muted transition-colors hover:border-pm-text-muted hover:text-pm-text-strong"
          >
            {side === 'BUY' ? t('market.maxBuy') : t('market.sellAll')}
          </button>
        </div>

        {/* Live receipt — the exact fill, so the user can read the economics. */}
        <div className="rounded-[24px] border border-pm-border bg-pm-bg/35 p-3 text-sm font-semibold text-pm-text-muted">
          {side === 'BUY' ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-[18px] border border-[#22c55e]/25 bg-[#22c55e]/10 px-3 py-2">
              <span className="text-pm-text-strong">{t('market.toWin')}</span>
              <span className="text-right">
                <span className="block text-lg font-bold text-pm-green">
                  {quote ? `${quote.toWin.toLocaleString(locale, { maximumFractionDigits: 2 })} pts` : '—'}
                </span>
                {quote && (
                  <span className="text-xs font-bold text-pm-green">+{quote.returnPercent.toFixed(0)}%</span>
                )}
              </span>
            </div>
          ) : (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-[18px] border border-pm-border bg-pm-surface/60 px-3 py-2">
              <span className="text-pm-text-strong">{t('market.receive')}</span>
              <span className="text-lg font-bold text-pm-text-strong">
                {quote ? `${quote.cost.toLocaleString(locale, { maximumFractionDigits: 2 })} pts` : '—'}
              </span>
            </div>
          )}

          <div className="flex justify-between gap-3">
            <span>{t('market.avgPrice')}</span>
            <span className="text-pm-text-strong">{isQuoting && !quote ? t('market.estimating') : quote ? `${quote.avgPriceCents.toFixed(1)}¢` : `${priceCents}¢`}</span>
          </div>
          <div className="mt-1 flex justify-between gap-3">
            <span>{t('common.shares')}</span>
            <span className="text-pm-text-strong">{quote ? quote.shares.toLocaleString(locale, { maximumFractionDigits: 2 }) : '—'}</span>
          </div>
          {quote && quote.fee > 0 && (
            <div className="mt-1 flex justify-between gap-3">
              <span>{t('market.fee')}</span>
              <span className="text-pm-text-strong">{quote.fee.toFixed(2)} pts</span>
            </div>
          )}
          <div className="mt-1 flex justify-between gap-3">
            <span>{side === 'BUY' ? t('common.balance') : t('market.receive')}</span>
            <span className="text-pm-text-strong">
              {side === 'BUY' ? `${balance.toLocaleString(locale)} pts` : `${viewerPosition.toFixed(2)} ${t('common.shares').toLowerCase()}`}
            </span>
          </div>
        </div>

        {viewerPosition > 0.0001 && (
          <div className="rounded-[20px] border border-pm-border bg-pm-surface/60 px-3 py-2 text-sm font-semibold">
            <div className="flex items-center justify-between gap-3">
              <span className="text-pm-text-muted">{t('market.holdingTitle')} · {outcomeLabel(outcome)}</span>
              <span className="text-pm-text-strong">{viewerPosition.toFixed(2)} · {currentValue.toLocaleString(locale, { maximumFractionDigits: 0 })} pts</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="text-pm-text-muted">{t('market.pnl')}</span>
              <span className={unrealizedPnl >= 0 ? 'text-pm-green' : 'text-pm-red'}>
                {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toLocaleString(locale, { maximumFractionDigits: 2 })} pts
              </span>
            </div>
          </div>
        )}

        {message && (
          <div
            className={
              messageTone === 'success'
                ? 'flex items-center gap-2 rounded-[20px] border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-2 text-sm font-semibold text-pm-green'
                : 'rounded-[20px] border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-sm font-semibold text-pm-red'
            }
          >
            {messageTone === 'success' && <CheckCircle2 className="h-4 w-4" />}
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={disabled}
          className="h-12 w-full rounded-full bg-pm-blue text-base font-bold text-white shadow-[0_4px_0_#1d4ed8] transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isClosed ? t('market.closed') : isSubmitting ? t('market.executing') : user ? (side === 'BUY' ? t('common.buy') : t('common.sell')) : t('market.loginAndTrade')}
        </button>

        {!user && (
          <Link to="/login" className="block text-center text-sm font-semibold text-pm-blue transition-colors hover:text-blue-400">
            {t('market.loginLink')}
          </Link>
        )}
      </form>
    </aside>
  );
}

export function MarketDetail() {
  const { id } = useParams();
  const { t, locale, categoryLabel, outcomeLabel, tradeSideLabel } = useI18n();
  const [market, setMarket] = useState<Market | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;

    let ignore = false;

    api.getMarket(id)
      .then(({ market: nextMarket }) => {
        if (!ignore) setMarket(nextMarket);
      })
      .catch((requestError) => {
        if (!ignore) {
          setError(requestError instanceof ApiError ? requestError.message : t('market.loadError'));
        }
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [id]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <div className="h-[420px] animate-pulse rounded-[28px] border border-pm-border bg-pm-surface" />
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-10 sm:px-6">
        <div className="rounded-[28px] border border-pm-border bg-pm-surface p-6">
          <h1 className="text-2xl font-bold text-pm-text-strong">{t('market.notOpenTitle')}</h1>
          <p className="mt-2 text-sm leading-6 text-pm-text-muted">{error || t('market.notFound')}</p>
          <Link to="/" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-pm-blue">
            <ArrowLeft className="h-4 w-4" />
            {t('common.home')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="min-h-full bg-pm-page"
    >
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-5 px-3 py-3 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <section className="min-w-0 space-y-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-pm-text-muted transition-colors hover:text-pm-text-strong">
            <ArrowLeft className="h-4 w-4" />
            {t('common.allMarkets')}
          </Link>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pm-surface text-lg font-bold text-pm-text-strong">
                {categoryIcon(market.category)}
              </div>
              <div className="min-w-0">
                <div className="mb-1 text-sm font-semibold text-pm-text-muted">
                  {categoryLabel(market.category)}
                  {market.createdBy && <span> <span className="mx-1">•</span> {market.createdBy.name}</span>}
                </div>
                <h1 className="text-xl font-bold leading-tight text-pm-text-strong sm:text-2xl">{market.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm font-semibold text-pm-text-muted">
                  <span>{formatMoney(market.volume, locale)} {t('common.volume')}</span>
                  <span>•</span>
                  <span>{market.tradeCount} {t('common.trades')}</span>
                  <span>•</span>
                  <span>{t('common.until')} {formatDate(market.closeDate, locale)}</span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 text-pm-text">
              <button className="rounded-2xl p-2 transition-colors hover:bg-pm-surface hover:text-pm-text-strong" aria-label={t('market.marketCode')}>
                <Code2 className="h-5 w-5" />
              </button>
              <button className="rounded-2xl p-2 transition-colors hover:bg-pm-surface hover:text-pm-text-strong" aria-label={t('market.link')}>
                <LinkIcon className="h-5 w-5" />
              </button>
              <button className="rounded-2xl p-2 transition-colors hover:bg-pm-surface hover:text-pm-text-strong" aria-label={t('market.save')}>
                <Bookmark className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="rounded-[28px] border border-pm-border bg-pm-surface p-3.5">
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-pm-text">
                <span className="h-2.5 w-2.5 rounded-full bg-pm-green" />
                <span>{t('common.yes')}</span>
                <span className="font-bold text-pm-text-strong">{market.yesPercent}%</span>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-pm-text">
                <span className="h-2.5 w-2.5 rounded-full bg-pm-red" />
                <span>{t('common.no')}</span>
                <span className="font-bold text-pm-text-strong">{market.noPercent}%</span>
              </div>
            </div>

            <PriceChart history={market.history} />

            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-pm-border pt-2.5 text-sm font-semibold text-pm-text-muted">
              <div className="flex flex-wrap items-center gap-3">
                <CalendarClock className="h-4 w-4" />
                <span>{t('common.created')} {formatDate(market.createdAt, locale)}</span>
              </div>
              <div className="flex items-center gap-2 text-pm-text">
                <TrendingUp className="h-4 w-4 text-pm-blue" />
                <span>{market.yesPrice}¢ / {market.noPrice}¢</span>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-pm-border bg-pm-surface">
            {market.outcomes.map((outcome) => (
              <div
                key={outcome.outcome}
                className="grid grid-cols-1 gap-3 border-b border-pm-border p-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              >
                <div>
                  <h2 className="text-base font-bold text-pm-text-strong sm:text-lg">{outcomeLabel(outcome.outcome)}</h2>
                  <p className="mt-0.5 text-sm font-semibold text-pm-text-muted">{formatMoney(outcome.pool, locale)} {t('common.supported')}</p>
                </div>
                <div className="flex items-baseline gap-2 sm:min-w-[130px] sm:justify-end">
                  <span className="text-2xl font-bold text-pm-text-strong sm:text-3xl">{outcome.percent}%</span>
                  <span className="text-sm font-bold text-pm-text-muted">{outcome.priceCents}¢</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:w-[170px]">
                  <div className={outcome.outcome === 'YES' ? 'h-9 rounded-full bg-[#22c55e]/10 px-4 text-center text-sm font-bold leading-9 text-pm-green' : 'h-9 rounded-full bg-[#ef4444]/10 px-4 text-center text-sm font-bold leading-9 text-pm-red'}>
                    {outcomeLabel(outcome.outcome)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-5">
            <div className="flex items-center gap-6 border-b border-pm-border text-lg font-bold">
              <button className="border-b-2 border-pm-text-strong pb-3 text-pm-text-strong">{t('common.rules')}</button>
              <button className="pb-3 text-pm-text-muted transition-colors hover:text-pm-text-strong">{t('admin.statTrades')}</button>
            </div>

            <div className="rounded-[28px] border border-pm-border bg-pm-surface">
              <div className="flex items-center justify-between border-b border-pm-border p-4">
                <div className="flex items-center gap-2 font-bold text-pm-text-strong">
                  <Info className="h-5 w-5 text-pm-blue" />
                  {t('market.context')}
                </div>
                <span className="text-sm font-semibold text-pm-text-muted">Yes/No</span>
              </div>
              <div className="space-y-4 p-4 text-sm leading-relaxed text-pm-text">
                {market.resolutionSource && (
                  <div>
                    <div className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">{t('common.source')}</div>
                    <p>{market.resolutionSource}</p>
                  </div>
                )}
                {market.resolutionRules || market.description ? (
                  <div>
                    <div className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">{t('common.rules')}</div>
                    <p>{market.resolutionRules || market.description}</p>
                  </div>
                ) : (
                  <p>{t('market.noRules')}</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-5 text-lg font-bold">
              <button className="text-pm-text-strong">{t('market.latestTrades', { count: market.recentTrades.length })}</button>
            </div>

            {market.recentTrades.length > 0 ? (
              <div className="overflow-hidden rounded-[28px] border border-pm-border bg-pm-surface">
                {market.recentTrades.map((trade) => (
                  <div key={trade.id} className="grid grid-cols-1 gap-2 border-b border-pm-border p-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                    <div className="flex min-w-0 items-center gap-2">
                      <UserRound className="h-4 w-4 shrink-0 text-pm-text-muted" />
                      <span className="truncate text-sm font-bold text-pm-text-strong">{trade.userName}</span>
                      <span className="text-sm font-bold text-pm-text-muted">{tradeSideLabel(trade.side)}</span>
                      <span className={trade.outcome === 'YES' ? 'text-sm font-bold text-pm-green' : 'text-sm font-bold text-pm-red'}>
                        {outcomeLabel(trade.outcome)}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-pm-text">{t('admin.amountAtPrice', { amount: formatMoney(trade.amount, locale), price: trade.priceCents })}</div>
                    <div className="text-sm font-semibold text-pm-text-muted">{formatDate(trade.createdAt, locale)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] border border-pm-border bg-pm-surface px-4 py-3 text-sm font-semibold text-pm-text-muted">
                {t('market.noTrades')}
              </div>
            )}

            <div className="inline-flex items-center gap-2 rounded-full bg-pm-surface px-4 py-2 text-sm font-semibold text-pm-text-muted">
              <ShieldCheck className="h-4 w-4" />
              {t('market.disclaimer')}
            </div>
          </div>
        </section>

        <TradePanel market={market} onMarketUpdated={setMarket} />
      </div>
    </motion.div>
  );
}
