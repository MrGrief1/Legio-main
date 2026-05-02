import { type FormEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Bookmark,
  CalendarClock,
  CheckCircle2,
  Code2,
  Info,
  Link as LinkIcon,
  ShieldCheck,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import {
  CartesianGrid,
  Customized,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, ApiError, type Market, type Outcome, type TradeSide } from '../lib/api';
import { useAuth } from '../lib/auth';

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}

function categoryIcon(category: string) {
  const normalized = category.toLowerCase();

  if (normalized.includes('крипто') || normalized.includes('bitcoin') || normalized.includes('btc')) return '₿';
  if (normalized.includes('спорт')) return '🏟';
  if (normalized.includes('полит')) return '◎';
  if (normalized.includes('финанс')) return '$';
  if (normalized.includes('тех')) return '⌘';

  return category.slice(0, 2).toUpperCase();
}

type ChartRow = {
  time: string;
  isoTime: string;
  yes: number;
  no: number;
};

type ChartHoverPoint = {
  color: string;
  key: 'yes' | 'no';
  pathD: string;
  pathLength: number;
  totalLength: number;
  name: string;
  value: number;
  svgX: number;
  x: number;
  y: number;
};

type ChartHoverState = {
  visible: boolean;
  isLeaving: boolean;
  exitProgress: number;
  x: number;
  svgX: number;
  viewBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  time: string;
  points: ChartHoverPoint[];
};

const hiddenChartHover: ChartHoverState = {
  visible: false,
  isLeaving: false,
  exitProgress: 0,
  x: 0,
  svgX: 0,
  viewBox: {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  },
  time: '',
  points: [],
};

const chartSeries = [
  { key: 'yes', name: 'Да', color: '#22c55e' },
  { key: 'no', name: 'Нет', color: '#ef4444' },
] as const;

const chartHoverExitDurationMs = 420;
const chartHoverExitDuration = chartHoverExitDurationMs / 1000;

function clampChartValue(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getInterpolatedChartPoint(data: ChartRow[], progress: number) {
  const exactIndex = progress * Math.max(1, data.length - 1);
  const leftIndex = Math.floor(exactIndex);
  const rightIndex = Math.min(data.length - 1, leftIndex + 1);
  const mix = exactIndex - leftIndex;
  const left = data[leftIndex];
  const right = data[rightIndex];
  const nearest = data[Math.round(exactIndex)] ?? data[data.length - 1];

  return {
    time: nearest?.isoTime ?? '',
    yes: clampChartValue((left?.yes ?? 50) + ((right?.yes ?? 50) - (left?.yes ?? 50)) * mix),
    no: clampChartValue((left?.no ?? 50) + ((right?.no ?? 50) - (left?.no ?? 50)) * mix),
  };
}

function getPathMeasureAtX(path: SVGPathElement, targetX: number) {
  const totalLength = path.getTotalLength();
  const firstPoint = path.getPointAtLength(0);
  const lastPoint = path.getPointAtLength(totalLength);
  const minX = Math.min(firstPoint.x, lastPoint.x);
  const maxX = Math.max(firstPoint.x, lastPoint.x);
  const clampedX = Math.max(minX, Math.min(maxX, targetX));
  let start = 0;
  let end = totalLength;

  for (let index = 0; index < 24; index += 1) {
    const middle = (start + end) / 2;
    const point = path.getPointAtLength(middle);

    if (point.x < clampedX) {
      start = middle;
    } else {
      end = middle;
    }
  }

  const pathLength = (start + end) / 2;

  return {
    pathLength,
    point: path.getPointAtLength(pathLength),
    totalLength,
  };
}

function getSvgViewport(svg: SVGSVGElement) {
  const box = svg.viewBox.baseVal;

  return {
    x: box?.width ? box.x : 0,
    y: box?.height ? box.y : 0,
    width: box?.width || svg.getBoundingClientRect().width,
    height: box?.height || svg.getBoundingClientRect().height,
  };
}

function ChartViewOverlay({ hover }: { hover: ChartHoverState }) {
  const labelsOnLeft = hover.x > 680;
  const detailOpacity = hover.isLeaving ? 0 : 1;
  const detailTransition = { duration: hover.isLeaving ? 0.12 : 0 };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 bottom-0 z-10">
      <motion.div
        animate={{ opacity: detailOpacity }}
        className="absolute top-0 bottom-8 w-px bg-pm-overlay-line"
        initial={false}
        style={{ left: hover.x }}
        transition={detailTransition}
      />
      <motion.div
        animate={{ opacity: detailOpacity }}
        className="absolute -translate-x-1/2 text-xs font-bold text-pm-text-muted"
        initial={false}
        style={{ left: hover.x, top: -2 }}
        transition={detailTransition}
      >
        {formatShortDate(hover.time)}
      </motion.div>

      {hover.points.map((point) => {
        const labelTop = point.name === 'Да' ? point.y - 34 : point.y + 8;
        const labelPosition = labelsOnLeft
          ? { left: point.x, top: labelTop, transform: 'translateX(calc(-100% - 12px))' }
          : { left: point.x, top: labelTop };

        return (
          <div key={point.name}>
            <motion.div
              animate={{ opacity: detailOpacity }}
              className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-pm-surface"
              initial={false}
              style={{ left: point.x, top: point.y, backgroundColor: point.color }}
              transition={detailTransition}
            />
            <motion.div
              animate={{ opacity: detailOpacity }}
              className={
                labelsOnLeft
                  ? 'absolute flex items-center gap-1 whitespace-nowrap rounded-md border border-pm-border bg-pm-bg/95 px-2 py-1 text-xs font-bold text-pm-text-strong shadow-[0_6px_20px_var(--color-pm-card-shadow-strong)]'
                  : 'absolute ml-3 flex items-center gap-1 whitespace-nowrap rounded-md border border-pm-border bg-pm-bg/95 px-2 py-1 text-xs font-bold text-pm-text-strong shadow-[0_6px_20px_var(--color-pm-card-shadow-strong)]'
              }
              initial={false}
              style={labelPosition}
              transition={detailTransition}
            >
              <span className="h-3 w-1 rounded-full" style={{ backgroundColor: point.color }} />
              <span>{point.name}</span>
              <span>{Math.round(point.value)}%</span>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

function ChartFutureLines({ hover }: { hover: ChartHoverState }) {
  if (!hover.visible || hover.viewBox.width <= 0) return null;

  return (
    <g className="market-detail-future-lines" pointerEvents="none">
      {hover.points.map((point) => {
        const remainingLength = Math.max(0, point.totalLength - point.pathLength);
        const revealedLength = remainingLength * hover.exitProgress;

        return (
          <g key={`future-${point.key}`}>
            <path
              d={point.pathD}
              fill="none"
              stroke="var(--color-pm-chart-future)"
              strokeDasharray={`${remainingLength} ${point.totalLength}`}
              strokeDashoffset={-point.pathLength}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.8}
            />
            {hover.isLeaving && revealedLength > 0 && (
              <path
                d={point.pathD}
                fill="none"
                stroke={point.color}
                strokeDasharray={`${revealedLength} ${point.totalLength}`}
                strokeDashoffset={-point.pathLength}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.8}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

function getChartLineDash(hover: ChartHoverState, key: 'yes' | 'no') {
  if (!hover.visible) return undefined;

  const point = hover.points.find((item) => item.key === key);

  if (!point) return undefined;

  return `${point.pathLength} ${Math.max(0, point.totalLength - point.pathLength)}`;
}

function TradePanel({
  market,
  onMarketUpdated,
}: {
  market: Market;
  onMarketUpdated: (market: Market) => void;
}) {
  const { user } = useAuth();
  const [outcome, setOutcome] = useState<Outcome>('YES');
  const [side, setSide] = useState<TradeSide>('BUY');
  const [amount, setAmount] = useState('10');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isClosed = market.status !== 'open' || new Date(market.closeDate).getTime() <= Date.now();
  const quote = market.quotes[outcome][side === 'BUY' ? 'ask' : 'bid'];
  const numericAmount = Number(amount);
  const viewerPosition = market.viewer?.positions[outcome]?.shares ?? 0;
  const previewShares = side === 'BUY' && Number.isFinite(numericAmount) && numericAmount > 0
    ? numericAmount / (quote / 100)
    : numericAmount;
  const previewValue = side === 'SELL' && Number.isFinite(numericAmount) && numericAmount > 0
    ? numericAmount * (quote / 100)
    : numericAmount;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');

    if (!user) {
      setMessage('Войди в аккаунт, чтобы голосовать.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await api.trade(market.id, {
        outcome,
        side,
        amount: numericAmount,
      });

      onMarketUpdated(response.market);
      setMessage(side === 'BUY' ? 'Покупка исполнена.' : 'Продажа исполнена.');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Не удалось записать сделку.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <aside className="self-start rounded-2xl border border-pm-border bg-pm-surface shadow-[0_18px_44px_var(--color-pm-card-shadow-strong)] lg:sticky lg:top-24">
      <div className="flex items-center gap-3 border-b border-pm-border p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pm-surface-hover text-xl font-bold text-pm-text-strong">
          {categoryIcon(market.category)}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-pm-text-strong">Голосование</h2>
          <p className="text-xs font-medium text-pm-text-muted">Market order, play-money</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-pm-bg/45 p-1">
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
                  ? 'h-9 rounded-lg bg-pm-surface text-sm font-bold text-pm-text-strong shadow-[0_1px_2px_var(--color-pm-card-shadow)]'
                  : 'h-9 rounded-lg text-sm font-bold text-pm-text-muted transition-colors hover:text-pm-text-strong'
              }
            >
              {nextSide === 'BUY' ? 'Купить' : 'Продать'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setOutcome('YES')}
            className={
              outcome === 'YES'
                ? 'h-12 rounded-lg bg-[#22c55e]/75 text-base font-bold text-white transition-colors hover:bg-[#22c55e]/90'
                : 'h-12 rounded-lg bg-pm-surface-hover text-base font-bold text-pm-text-muted transition-colors hover:text-pm-text-strong'
            }
          >
            Да {market.quotes.YES[side === 'BUY' ? 'ask' : 'bid']}¢
          </button>
          <button
            type="button"
            onClick={() => setOutcome('NO')}
            className={
              outcome === 'NO'
                ? 'h-12 rounded-lg bg-[#ef4444]/75 text-base font-bold text-white transition-colors hover:bg-[#ef4444]/90'
                : 'h-12 rounded-lg bg-pm-surface-hover text-base font-bold text-pm-text-muted transition-colors hover:text-pm-text-strong'
            }
          >
            Нет {market.quotes.NO[side === 'BUY' ? 'ask' : 'bid']}¢
          </button>
        </div>

        <div className="flex items-end justify-between gap-4">
          <label className="text-base font-bold text-pm-text-strong" htmlFor="trade-amount">
            {side === 'BUY' ? 'Сумма' : 'Доли'}
          </label>
          <input
            id="trade-amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            min="1"
            max="10000"
            type="number"
            step="1"
            required
            className="w-36 bg-transparent text-right text-4xl font-bold text-pm-text-strong outline-none placeholder:text-pm-text-muted"
          />
        </div>

        <div className="grid grid-cols-4 gap-2">
          {(side === 'BUY' ? [1, 5, 10, 100] : [1, 5, 10, Math.max(1, Math.floor(viewerPosition))]).map((nextAmount, index) => (
            <button
              key={`${side}-${nextAmount}-${index}`}
              type="button"
              onClick={() => setAmount(String(nextAmount))}
              className="h-9 rounded-lg border border-pm-border text-sm font-bold text-pm-text-muted transition-colors hover:border-pm-text-muted hover:text-pm-text-strong"
            >
              {side === 'BUY' ? `+${nextAmount}` : `${nextAmount}`}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-pm-border bg-pm-bg/35 p-3 text-sm font-semibold text-pm-text-muted">
          <div className="flex justify-between gap-3">
            <span>{side === 'BUY' ? 'Ask' : 'Bid'}</span>
            <span className="text-pm-text-strong">{quote}¢</span>
          </div>
          <div className="mt-1 flex justify-between gap-3">
            <span>Доли</span>
            <span className="text-pm-text-strong">{previewShares.toFixed(2)}</span>
          </div>
          <div className="mt-1 flex justify-between gap-3">
            <span>{side === 'BUY' ? 'Баланс' : 'Получишь'}</span>
            <span className="text-pm-text-strong">
              {side === 'BUY'
                ? `${Math.round(market.viewer?.balance ?? user?.balance ?? 0).toLocaleString('ru-RU')} pts`
                : `${previewValue.toFixed(2)} pts`}
            </span>
          </div>
          <div className="mt-1 flex justify-between gap-3">
            <span>Позиция</span>
            <span className="text-pm-text-strong">{viewerPosition.toFixed(2)}</span>
          </div>
        </div>

        {message && (
          <div
            className={
              message.includes('записана')
              || message.includes('исполнена')
                ? 'flex items-center gap-2 rounded-xl border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-2 text-sm font-semibold text-pm-green'
                : 'rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-sm font-semibold text-pm-red'
            }
          >
            {(message.includes('записана') || message.includes('исполнена')) && <CheckCircle2 className="h-4 w-4" />}
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || isClosed}
          className="h-12 w-full rounded-lg bg-pm-blue text-base font-bold text-white shadow-[0_4px_0_#1d4ed8] transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isClosed ? 'Рынок закрыт' : isSubmitting ? 'Исполняю...' : user ? (side === 'BUY' ? 'Купить' : 'Продать') : 'Войти и торговать'}
        </button>

        {!user && (
          <Link to="/login" className="block text-center text-sm font-semibold text-pm-blue transition-colors hover:text-blue-400">
            Войти в аккаунт
          </Link>
        )}
      </form>
    </aside>
  );
}

export function MarketDetail() {
  const { id } = useParams();
  const [market, setMarket] = useState<Market | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const chartRef = useRef<HTMLDivElement>(null);
  const chartHoverExitTimeoutRef = useRef<number | null>(null);
  const chartHoverExitFrameRef = useRef<number | null>(null);
  const [chartHover, setChartHover] = useState<ChartHoverState>(hiddenChartHover);

  const clearChartHoverExitTimeout = () => {
    if (chartHoverExitTimeoutRef.current === null) return;

    window.clearTimeout(chartHoverExitTimeoutRef.current);
    chartHoverExitTimeoutRef.current = null;
  };

  const clearChartHoverExitFrame = () => {
    if (chartHoverExitFrameRef.current === null) return;

    window.cancelAnimationFrame(chartHoverExitFrameRef.current);
    chartHoverExitFrameRef.current = null;
  };

  useEffect(() => {
    if (!id) return;

    let ignore = false;

    api.getMarket(id)
      .then(({ market: nextMarket }) => {
        if (!ignore) setMarket(nextMarket);
      })
      .catch((requestError) => {
        if (!ignore) {
          setError(requestError instanceof ApiError ? requestError.message : 'Не удалось загрузить рынок.');
        }
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [id]);

  useEffect(() => () => {
    clearChartHoverExitTimeout();
    clearChartHoverExitFrame();
  }, []);

  const chartData = useMemo<ChartRow[]>(() => {
    if (!market) return [];

    return market.history.map((point) => ({
      time: formatShortDate(point.time),
      isoTime: point.time,
      yes: point.yesPercent,
      no: point.noPercent ?? 100 - point.yesPercent,
    }));
  }, [market]);

  const handleChartPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const container = chartRef.current;
    const svg = container?.querySelector<SVGSVGElement>('.recharts-surface');

    if (!container || !svg || chartData.length === 0) return;

    const containerRect = container.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const viewport = getSvgViewport(svg);
    const targetSvgX = viewport.x + ((event.clientX - svgRect.left) / svgRect.width) * viewport.width;
    const firstPath =
      svg.querySelector<SVGPathElement>('.market-detail-line-yes .recharts-line-curve')
      ?? svg.querySelector<SVGPathElement>('.recharts-line-curve');

    if (!firstPath) return;

    const firstPoint = firstPath.getPointAtLength(0);
    const lastPoint = firstPath.getPointAtLength(firstPath.getTotalLength());
    const minPathX = Math.min(firstPoint.x, lastPoint.x);
    const maxPathX = Math.max(firstPoint.x, lastPoint.x);
    const hoverSvgX = Math.max(minPathX, Math.min(maxPathX, targetSvgX));
    const progress = Math.max(0, Math.min(1, (hoverSvgX - minPathX) / Math.max(1, maxPathX - minPathX)));
    const activePoint = getInterpolatedChartPoint(chartData, progress);
    const points = chartSeries.reduce<ChartHoverPoint[]>((result, series) => {
      const path =
        svg.querySelector<SVGPathElement>(`.market-detail-line-${series.key} .recharts-line-curve`)
        ?? svg.querySelectorAll<SVGPathElement>('.recharts-line-curve')[series.key === 'yes' ? 0 : 1];

      if (!path) return result;

      const { pathLength, point, totalLength } = getPathMeasureAtX(path, hoverSvgX);
      const x = svgRect.left - containerRect.left + ((hoverSvgX - viewport.x) / viewport.width) * svgRect.width;
      const y = svgRect.top - containerRect.top + ((point.y - viewport.y) / viewport.height) * svgRect.height;

      result.push({
        color: series.color,
        key: series.key,
        pathD: path.getAttribute('d') ?? '',
        pathLength,
        totalLength,
        name: series.name,
        value: activePoint[series.key],
        svgX: hoverSvgX,
        x,
        y,
      });

      return result;
    }, []);

    if (points.length === 0) return;

    clearChartHoverExitTimeout();
    clearChartHoverExitFrame();
    setChartHover({
      visible: true,
      isLeaving: false,
      exitProgress: 0,
      x: points[0].x,
      svgX: points[0].svgX,
      viewBox: viewport,
      time: activePoint.time,
      points,
    });
  };

  const handleChartPointerLeave = () => {
    if (!chartHover.visible) return;

    clearChartHoverExitTimeout();
    clearChartHoverExitFrame();
    setChartHover((previous) => (
      previous.visible ? { ...previous, isLeaving: true, exitProgress: 0 } : previous
    ));

    const startedAt = window.performance.now();
    const easeOutCubic = (value: number) => 1 - (1 - value) ** 3;
    const animateExit = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / chartHoverExitDurationMs);
      const easedProgress = easeOutCubic(progress);

      setChartHover((previous) => (
        previous.isLeaving ? { ...previous, exitProgress: easedProgress } : previous
      ));

      if (progress < 1) {
        chartHoverExitFrameRef.current = window.requestAnimationFrame(animateExit);
        return;
      }

      chartHoverExitFrameRef.current = null;
      setChartHover((previous) => (
        previous.isLeaving ? { ...previous, visible: false, isLeaving: false, exitProgress: 0 } : previous
      ));
    };

    chartHoverExitFrameRef.current = window.requestAnimationFrame(animateExit);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <div className="h-[420px] animate-pulse rounded-2xl border border-pm-border bg-pm-surface" />
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-pm-border bg-pm-surface p-6">
          <h1 className="text-2xl font-bold text-pm-text-strong">Рынок не открыт</h1>
          <p className="mt-2 text-sm leading-6 text-pm-text-muted">{error || 'Такого рынка нет.'}</p>
          <Link to="/" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-pm-blue">
            <ArrowLeft className="h-4 w-4" />
            На главную
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
            Все рынки
          </Link>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pm-surface text-lg font-bold text-pm-text-strong">
                {categoryIcon(market.category)}
              </div>
              <div className="min-w-0">
                <div className="mb-1 text-sm font-semibold text-pm-text-muted">
                  {market.category}
                  {market.createdBy && <span> <span className="mx-1">•</span> {market.createdBy.name}</span>}
                </div>
                <h1 className="text-xl font-bold leading-tight text-pm-text-strong sm:text-2xl">{market.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm font-semibold text-pm-text-muted">
                  <span>{formatMoney(market.volume)} Объём</span>
                  <span>•</span>
                  <span>{market.tradeCount} сделок</span>
                  <span>•</span>
                  <span>До {formatDate(market.closeDate)}</span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 text-pm-text">
              <button className="rounded-lg p-2 transition-colors hover:bg-pm-surface hover:text-pm-text-strong" aria-label="Код рынка">
                <Code2 className="h-5 w-5" />
              </button>
              <button className="rounded-lg p-2 transition-colors hover:bg-pm-surface hover:text-pm-text-strong" aria-label="Ссылка">
                <LinkIcon className="h-5 w-5" />
              </button>
              <button className="rounded-lg p-2 transition-colors hover:bg-pm-surface hover:text-pm-text-strong" aria-label="Сохранить">
                <Bookmark className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-pm-border bg-pm-surface p-3.5">
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-pm-text">
                <span className="h-2.5 w-2.5 rounded-full bg-pm-green" />
                <span>Да</span>
                <span className="font-bold text-pm-text-strong">{market.yesPercent}%</span>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-pm-text">
                <span className="h-2.5 w-2.5 rounded-full bg-pm-red" />
                <span>Нет</span>
                <span className="font-bold text-pm-text-strong">{market.noPercent}%</span>
              </div>
            </div>

            <div
              ref={chartRef}
              className="relative h-[220px] w-full sm:h-[260px]"
              onPointerMove={handleChartPointerMove}
              onPointerLeave={handleChartPointerLeave}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-pm-chart-grid)" strokeDasharray="3 4" vertical={false} />
                  <XAxis
                    dataKey="time"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--color-pm-text-muted)', fontSize: 12, fontWeight: 600 }}
                    dy={10}
                  />
                  <YAxis
                    orientation="right"
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tickFormatter={(value) => `${value}%`}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--color-pm-text-muted)', fontSize: 12, fontWeight: 600 }}
                    width={46}
                  />
                  <Tooltip
                    cursor={false}
                    wrapperStyle={{ display: 'none' }}
                    formatter={(value, name) => [`${value}%`, name === 'yes' ? 'Да' : 'Нет']}
                  />
                  <Line
                    className="market-detail-line-yes"
                    type="stepAfter"
                    dataKey="yes"
                    stroke="#22c55e"
                    strokeDasharray={getChartLineDash(chartHover, 'yes')}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    className="market-detail-line-no"
                    type="stepAfter"
                    dataKey="no"
                    stroke="#ef4444"
                    strokeDasharray={getChartLineDash(chartHover, 'no')}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                  <Customized component={<ChartFutureLines hover={chartHover} />} />
                </LineChart>
              </ResponsiveContainer>
              {chartHover.visible && (
                <ChartViewOverlay hover={chartHover} />
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-pm-border pt-2.5 text-sm font-semibold text-pm-text-muted">
              <div className="flex flex-wrap items-center gap-3">
                <CalendarClock className="h-4 w-4" />
                <span>Создан {formatDate(market.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2 text-pm-text">
                <TrendingUp className="h-4 w-4 text-pm-blue" />
                <span>{market.yesPrice}¢ / {market.noPrice}¢</span>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-pm-border bg-pm-surface">
            {market.outcomes.map((outcome) => (
              <div
                key={outcome.outcome}
                className="grid grid-cols-1 gap-3 border-b border-pm-border p-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              >
                <div>
                  <h2 className="text-base font-bold text-pm-text-strong sm:text-lg">{outcome.name}</h2>
                  <p className="mt-0.5 text-sm font-semibold text-pm-text-muted">{formatMoney(outcome.pool)} поддержано</p>
                </div>
                <div className="flex items-baseline gap-2 sm:min-w-[130px] sm:justify-end">
                  <span className="text-2xl font-bold text-pm-text-strong sm:text-3xl">{outcome.percent}%</span>
                  <span className="text-sm font-bold text-pm-text-muted">{outcome.priceCents}¢</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:w-[170px]">
                  <div className={outcome.outcome === 'YES' ? 'h-9 rounded-lg bg-[#22c55e]/10 px-4 text-center text-sm font-bold leading-9 text-pm-green' : 'h-9 rounded-lg bg-[#ef4444]/10 px-4 text-center text-sm font-bold leading-9 text-pm-red'}>
                    {outcome.outcome === 'YES' ? 'Да' : 'Нет'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-5">
            <div className="flex items-center gap-6 border-b border-pm-border text-lg font-bold">
              <button className="border-b-2 border-pm-text-strong pb-3 text-pm-text-strong">Правила</button>
              <button className="pb-3 text-pm-text-muted transition-colors hover:text-pm-text-strong">Сделки</button>
            </div>

            <div className="rounded-2xl border border-pm-border bg-pm-surface">
              <div className="flex items-center justify-between border-b border-pm-border p-4">
                <div className="flex items-center gap-2 font-bold text-pm-text-strong">
                  <Info className="h-5 w-5 text-pm-blue" />
                  Контекст рынка
                </div>
                <span className="text-sm font-semibold text-pm-text-muted">Yes/No</span>
              </div>
              <div className="space-y-4 p-4 text-sm leading-relaxed text-pm-text">
                {market.resolutionSource && (
                  <div>
                    <div className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">Источник</div>
                    <p>{market.resolutionSource}</p>
                  </div>
                )}
                {market.resolutionRules || market.description ? (
                  <div>
                    <div className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">Правила</div>
                    <p>{market.resolutionRules || market.description}</p>
                  </div>
                ) : (
                  <p>Автор не добавил дополнительных правил. Рынок должен разрешаться по формулировке вопроса.</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-5 text-lg font-bold">
              <button className="text-pm-text-strong">Последние сделки ({market.recentTrades.length})</button>
            </div>

            {market.recentTrades.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-pm-border bg-pm-surface">
                {market.recentTrades.map((trade) => (
                  <div key={trade.id} className="grid grid-cols-1 gap-2 border-b border-pm-border p-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                    <div className="flex min-w-0 items-center gap-2">
                      <UserRound className="h-4 w-4 shrink-0 text-pm-text-muted" />
                      <span className="truncate text-sm font-bold text-pm-text-strong">{trade.userName}</span>
                      <span className="text-sm font-bold text-pm-text-muted">{trade.side === 'BUY' ? 'купил' : 'продал'}</span>
                      <span className={trade.outcome === 'YES' ? 'text-sm font-bold text-pm-green' : 'text-sm font-bold text-pm-red'}>
                        {trade.outcome === 'YES' ? 'Да' : 'Нет'}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-pm-text">{formatMoney(trade.amount)} по {trade.priceCents}¢</div>
                    <div className="text-sm font-semibold text-pm-text-muted">{formatDate(trade.createdAt)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-pm-border bg-pm-surface px-4 py-3 text-sm font-semibold text-pm-text-muted">
                Сделок пока нет. Первая сделка задаст начальное движение цены.
              </div>
            )}

            <div className="inline-flex items-center gap-2 rounded-full bg-pm-surface px-4 py-2 text-sm font-semibold text-pm-text-muted">
              <ShieldCheck className="h-4 w-4" />
              Цены здесь считаются внутри приложения и не являются реальными сделками Polymarket.
            </div>
          </div>
        </section>

        <TradePanel market={market} onMarketUpdated={setMarket} />
      </div>
    </motion.div>
  );
}
