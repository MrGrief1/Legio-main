import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Wallet, TrendingUp, Trophy, PieChart, ArrowUpRight } from 'lucide-react';
import { api, ApiError, type Portfolio as PortfolioData, type PortfolioPosition } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';
import { formatCents, formatPoints, formatSignedPct, formatSignedPoints } from '../lib/format';

function pnlClass(value: number) {
  if (value > 0) return 'text-pm-green';
  if (value < 0) return 'text-pm-red';
  return 'text-pm-text-muted';
}

function outcomeBadgeClass(outcome: string) {
  if (outcome === 'YES') return 'bg-[rgba(34,197,94,0.15)] text-pm-green';
  if (outcome === 'NO') return 'bg-[rgba(239,68,68,0.15)] text-pm-red';
  return 'bg-pm-soft-badge text-pm-text';
}

function StatCard({
  icon,
  label,
  value,
  sub,
  valueClass,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-[20px] border border-pm-border bg-pm-surface p-4">
      <div className="flex items-center gap-2 text-pm-text-muted">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className={cn('mt-2 text-2xl font-bold tabular-nums text-pm-text-strong', valueClass)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs font-medium text-pm-text-muted">{sub}</div>}
    </div>
  );
}

function PositionRow({ position, locale }: { position: PortfolioPosition; locale: string }) {
  const statusLabel: Record<string, string> = {
    open: 'Активен',
    paused: 'На паузе',
    resolved: 'Решён',
    canceled: 'Отменён',
  };

  return (
    <Link
      to={`/market/${position.marketId}`}
      className="group grid grid-cols-1 gap-3 border-t border-pm-border px-4 py-4 transition-colors hover:bg-pm-surface-hover sm:grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,auto))] sm:items-center sm:gap-4"
    >
      {/* Market + outcome */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-bold', outcomeBadgeClass(position.outcome))}>
            {position.outcomeLabel}
          </span>
          {position.marketStatus !== 'open' && (
            <span className="rounded-md bg-pm-soft-badge px-1.5 py-0.5 text-[11px] font-semibold text-pm-text-muted">
              {statusLabel[position.marketStatus] ?? position.marketStatus}
            </span>
          )}
        </div>
        <div className="mt-1 truncate text-sm font-semibold text-pm-text-strong group-hover:text-pm-blue">
          {position.marketTitle}
        </div>
        <div className="mt-0.5 text-xs font-medium text-pm-text-muted">
          {new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(position.shares)} долей ·
          средняя {formatCents(position.avgPriceCents)} → сейчас {formatCents(position.currentPriceCents)}
        </div>
      </div>

      {/* Cost basis */}
      <div className="text-left sm:text-right">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-pm-text-muted sm:hidden">Вложено</div>
        <div className="text-sm font-semibold tabular-nums text-pm-text">{formatPoints(position.costBasis, locale)}</div>
      </div>

      {/* Current value */}
      <div className="text-left sm:text-right">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-pm-text-muted sm:hidden">Сейчас стоит</div>
        <div className="text-sm font-semibold tabular-nums text-pm-text-strong">{formatPoints(position.currentValue, locale)}</div>
      </div>

      {/* P&L */}
      <div className="text-left sm:text-right">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-pm-text-muted sm:hidden">P&L</div>
        <div className={cn('text-sm font-bold tabular-nums', pnlClass(position.unrealizedPnl))}>
          {formatSignedPoints(position.unrealizedPnl, locale)}
        </div>
        <div className={cn('text-xs font-semibold tabular-nums', pnlClass(position.unrealizedPnl))}>
          {formatSignedPct(position.unrealizedPnlPercent, locale)}
        </div>
      </div>

      {/* To win */}
      <div className="text-left sm:text-right">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-pm-text-muted sm:hidden">Выиграешь</div>
        <div className="flex items-center gap-1 text-sm font-bold tabular-nums text-pm-green sm:justify-end">
          {formatPoints(position.toWin, locale)}
          <ArrowUpRight className="h-3.5 w-3.5 opacity-70" />
        </div>
      </div>
    </Link>
  );
}

export function Portfolio() {
  const { user } = useAuth();
  const { locale } = useI18n();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    let ignore = false;
    setIsLoading(true);

    api.getPortfolio()
      .then(({ portfolio }) => {
        if (!ignore) setData(portfolio);
      })
      .catch((requestError) => {
        if (!ignore) setError(requestError instanceof ApiError ? requestError.message : 'Не удалось загрузить портфель.');
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [user]);

  if (!user) {
    return (
      <div className="mx-auto max-w-[1400px] px-3 py-10 sm:px-6">
        <div className="mx-auto max-w-md rounded-[28px] border border-dashed border-pm-border bg-pm-surface p-8 text-center">
          <PieChart className="mx-auto h-8 w-8 text-pm-text-muted" />
          <h2 className="mt-3 text-xl font-bold text-pm-text-strong">Войдите, чтобы увидеть портфель</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-pm-text-muted">
            Здесь видно ваши позиции, баланс, прибыль/убыток и сколько вы выиграете, если рынок решится в вашу пользу.
          </p>
          <Link
            to="/login"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-pm-blue px-5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
          >
            Войти
          </Link>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto max-w-[1400px] px-3 py-5 sm:px-6"
    >
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-pm-text-strong">Портфель</h1>
        <p className="mt-1 text-sm font-medium text-pm-text-muted">
          Цена = вероятность (64¢ = 64%). Одна выигрышная доля приносит ровно 1 pt.
        </p>
      </div>

      {error && (
        <div className="mb-5 rounded-[20px] border border-pm-red/30 bg-pm-red/10 px-4 py-3 text-sm font-semibold text-pm-red">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[92px] animate-pulse rounded-[20px] border border-pm-border bg-pm-surface" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              icon={<PieChart className="h-4 w-4" />}
              label="Стоимость портфеля"
              value={formatPoints(data.totalValue, locale)}
              sub={`${formatPoints(data.cash, locale)} кэш + ${formatPoints(data.positionsValue, locale)} в позициях`}
            />
            <StatCard
              icon={<Wallet className="h-4 w-4" />}
              label="Свободный баланс"
              value={formatPoints(data.cash, locale)}
              sub="доступно для сделок"
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Нереализованный P&L"
              value={formatSignedPoints(data.unrealizedPnl, locale)}
              sub={formatSignedPct(data.unrealizedPnlPercent, locale)}
              valueClass={pnlClass(data.unrealizedPnl)}
            />
            <StatCard
              icon={<Trophy className="h-4 w-4" />}
              label="Реализованный P&L"
              value={formatSignedPoints(data.realizedPnl, locale)}
              sub="по закрытым сделкам"
              valueClass={pnlClass(data.realizedPnl)}
            />
          </div>

          <div className="mt-6 overflow-hidden rounded-[24px] border border-pm-border bg-pm-surface">
            <div className="hidden grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,auto))] gap-4 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-pm-text-muted sm:grid">
              <div>Рынок и позиция ({data.openCount})</div>
              <div className="text-right">Вложено</div>
              <div className="text-right">Сейчас стоит</div>
              <div className="text-right">P&L</div>
              <div className="text-right">Выиграешь</div>
            </div>

            {data.positions.length > 0 ? (
              data.positions.map((position) => (
                <div key={`${position.marketId}-${position.outcome}`}>
                  <PositionRow position={position} locale={locale} />
                </div>
              ))
            ) : (
              <div className="border-t border-pm-border px-4 py-12 text-center">
                <h2 className="text-lg font-bold text-pm-text-strong">Открытых позиций пока нет</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-pm-text-muted">
                  Выберите рынок, купите «Да» или «Нет» — и позиция появится здесь с текущей стоимостью и потенциальным выигрышем.
                </p>
                <Link
                  to="/"
                  className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-pm-blue px-5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
                >
                  К рынкам
                </Link>
              </div>
            )}
          </div>
        </>
      ) : null}
    </motion.div>
  );
}
