import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
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
import { type Market } from '../lib/api';
import { useI18n } from '../lib/i18n';

// One drawn line. For a binary market this is a single YES series; for a
// multi-outcome (categorical) market there is one per outcome.
export type ChartSeries = { key: string; name: string; color: string };
export type ChartHistoryPoint = { time: string; values: Record<string, number> };

// Build the chart's series + history from a market. Binary markets draw a single
// trend-coloured YES line; multi-outcome markets draw one line per outcome.
export function marketChartProps(market: Market, yesLabel: string): { series: ChartSeries[]; history: ChartHistoryPoint[] } {
  if (market.marketType === 'multi' && market.outcomes.length >= 2) {
    return {
      series: market.outcomes.map((o) => ({ key: o.outcome, name: o.name, color: o.color || '#888888' })),
      history: (market.history ?? []).map((p) => ({ time: p.time, values: p.values ?? {} })),
    };
  }

  const history = (market.history ?? []).map((p) => ({ time: p.time, values: { yes: p.yesPercent } }));
  const up = history.length > 1 ? history[history.length - 1].values.yes >= history[0].values.yes : true;

  return {
    series: [{ key: 'yes', name: yesLabel, color: up ? '#22c55e' : '#ef4444' }],
    history,
  };
}

function formatShortDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(value));
}

// One day in ms; below ~2 days of total span we label the time axis by time-of-day
// (HH:MM) instead of date, so an intraday market doesn't show the same date on every tick.
const intradaySpanMs = 2 * 24 * 60 * 60 * 1000;

function formatChartTime(value: string | number, locale: string, spanMs: number) {
  const date = new Date(value);
  const options: Intl.DateTimeFormatOptions =
    spanMs > 0 && spanMs < intradaySpanMs
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'short' };

  return new Intl.DateTimeFormat(locale, options).format(date);
}

type ChartRow = { time: string; isoTime: string; ts: number } & Record<string, number | string>;

type ChartHoverPoint = {
  color: string;
  key: string;
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
  viewBox: { x: number; y: number; width: number; height: number };
  time: string;
  points: ChartHoverPoint[];
};

const hiddenChartHover: ChartHoverState = {
  visible: false,
  isLeaving: false,
  exitProgress: 0,
  x: 0,
  svgX: 0,
  viewBox: { x: 0, y: 0, width: 0, height: 0 },
  time: '',
  points: [],
};

const chartHoverExitDurationMs = 420;

function clampChartValue(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

// Auto-zoom the Y axis to the data band (like Polymarket): if every line sits
// between 20% and 48%, show roughly 15%–55% with nice 5/10-step ticks instead
// of squashing them around the middle of a fixed 0–100 axis.
function niceYDomain(values: number[]): { domain: [number, number]; ticks: number[] } {
  if (values.length === 0) return { domain: [0, 100], ticks: [0, 25, 50, 75, 100] };

  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(3, (hi - lo) * 0.12);
  const paddedLo = Math.max(0, lo - pad);
  const paddedHi = Math.min(100, hi + pad);
  const rawStep = (paddedHi - paddedLo) / 5 || 25;
  const step = [1, 2, 5, 10, 20, 25, 50].find((candidate) => candidate >= rawStep) ?? 25;
  const domainMin = Math.max(0, Math.floor(paddedLo / step) * step);
  const domainMax = Math.min(100, Math.ceil(paddedHi / step) * step);
  const ticks: number[] = [];

  for (let tick = domainMin; tick <= domainMax + 1e-9; tick += step) {
    ticks.push(Math.round(tick));
  }

  return { domain: [domainMin, domainMax], ticks };
}

// Samples are dense and evenly spaced in time, so the cursor's fractional progress
// maps linearly to a data index. We snap to the NEAREST sample; with ~140 points the
// value there matches the line under the cursor to well under a percent (rounded away).
function getActiveChartPoint(data: ChartRow[], progress: number, keys: string[]) {
  const exactIndex = progress * Math.max(1, data.length - 1);
  const index = Math.min(data.length - 1, Math.max(0, Math.round(exactIndex)));
  const point = data[index];
  const values: Record<string, number> = {};

  for (const key of keys) {
    values[key] = clampChartValue(Number(point?.[key] ?? 50));
  }

  return { isoTime: String(point?.isoTime ?? ''), values };
}

// Per-series path geometry, sampled ONCE into monotonic-x arrays. `getPointAtLength`
// forces synchronous layout, so calling it ~24×/series on every pointermove is what
// made hovering lag. We sample each path a single time (per data/size change) and then
// resolve the cursor with a pure-JS binary search — no DOM reads on the hot path.
type SeriesSamples = {
  pathD: string;
  totalLength: number;
  xs: Float64Array;
  ys: Float64Array;
  ls: Float64Array;
};

type PathCache = {
  signature: string;
  minX: number;
  maxX: number;
  byKey: Map<string, SeriesSamples>;
};

const pathSampleCount = 220;

function sampleSeriesPath(path: SVGPathElement): SeriesSamples {
  const totalLength = path.getTotalLength();
  const xs = new Float64Array(pathSampleCount);
  const ys = new Float64Array(pathSampleCount);
  const ls = new Float64Array(pathSampleCount);

  for (let i = 0; i < pathSampleCount; i += 1) {
    const length = (totalLength * i) / (pathSampleCount - 1);
    const point = path.getPointAtLength(length);
    xs[i] = point.x;
    ys[i] = point.y;
    ls[i] = length;
  }

  return { pathD: path.getAttribute('d') ?? '', totalLength, xs, ys, ls };
}

// Binary search the cached samples for the y / path-length at a given svg x (x is
// monotonic increasing because the line is plotted left→right on a time axis).
function measureSampledAtX(samples: SeriesSamples, targetX: number) {
  const { xs, ys, ls } = samples;
  const last = xs.length - 1;
  const clampedX = Math.max(xs[0], Math.min(xs[last], targetX));
  let lo = 0;
  let hi = last;

  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < clampedX) lo = mid;
    else hi = mid;
  }

  const span = xs[hi] - xs[lo];
  const fraction = span > 1e-6 ? (clampedX - xs[lo]) / span : 0;

  return {
    y: ys[lo] + (ys[hi] - ys[lo]) * fraction,
    pathLength: ls[lo] + (ls[hi] - ls[lo]) * fraction,
    totalLength: samples.totalLength,
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

function ChartViewOverlay({ hover, spanMs }: { hover: ChartHoverState; spanMs: number }) {
  const { locale } = useI18n();
  const labelsOnLeft = hover.x > 680;
  const detailOpacity = hover.isLeaving ? 0 : 1;
  const detailTransition = { duration: hover.isLeaving ? 0.12 : 0 };

  // Spread the value boxes vertically so close lines don't overlap their labels:
  // sort by y, then push each label down to keep a minimum gap from the one above.
  const labelGap = 30;
  const labelTop = new Map<string, number>();
  [...hover.points]
    .sort((a, b) => a.y - b.y)
    .forEach((point, index, sorted) => {
      const desired = point.y - 14;
      const previous = index > 0 ? labelTop.get(sorted[index - 1].key) ?? -Infinity : -Infinity;
      labelTop.set(point.key, Math.max(desired, previous + labelGap));
    });

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
        {formatChartTime(hover.time, locale, spanMs)}
      </motion.div>

      {hover.points.map((point) => {
        const top = labelTop.get(point.key) ?? point.y - 13;
        const labelPosition = labelsOnLeft
          ? { left: point.x, top, transform: 'translateX(calc(-100% - 12px))' }
          : { left: point.x, top };

        return (
          <div key={point.key}>
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
                  ? 'absolute flex items-center gap-1 whitespace-nowrap rounded-2xl border border-pm-border bg-pm-bg/95 px-2 py-1 text-xs font-bold text-pm-text-strong shadow-[0_6px_20px_var(--color-pm-card-shadow-strong)]'
                  : 'absolute ml-3 flex items-center gap-1 whitespace-nowrap rounded-2xl border border-pm-border bg-pm-bg/95 px-2 py-1 text-xs font-bold text-pm-text-strong shadow-[0_6px_20px_var(--color-pm-card-shadow-strong)]'
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

function getChartLineDash(hover: ChartHoverState, key: string) {
  if (!hover.visible) return undefined;

  const point = hover.points.find((item) => item.key === key);

  if (!point) return undefined;

  return `${point.pathLength} ${Math.max(0, point.totalLength - point.pathLength)}`;
}

export function PriceChart({
  history,
  series,
  heightClass = 'h-[220px] sm:h-[260px]',
}: {
  history: ChartHistoryPoint[];
  series: ChartSeries[];
  heightClass?: string;
}) {
  const { locale } = useI18n();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartHoverExitTimeoutRef = useRef<number | null>(null);
  const chartHoverExitFrameRef = useRef<number | null>(null);
  const pathCacheRef = useRef<PathCache | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const pointerClientXRef = useRef<number | null>(null);
  const lastHoverXRef = useRef<number>(-1);
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

  const clearPointerFrame = () => {
    if (pointerFrameRef.current === null) return;
    window.cancelAnimationFrame(pointerFrameRef.current);
    pointerFrameRef.current = null;
  };

  useEffect(() => () => {
    clearChartHoverExitTimeout();
    clearChartHoverExitFrame();
    clearPointerFrame();
  }, []);

  const seriesKeys = series.map((s) => s.key);
  const chartData = useMemo<ChartRow[]>(() => history.map((point) => ({
    time: formatShortDate(point.time, locale),
    isoTime: point.time,
    ts: new Date(point.time).getTime(),
    ...point.values,
  })), [history, locale]);

  // Total time span of the data — drives whether the axis/labels read as dates or
  // intraday times, and is passed to the hover overlay for the same decision.
  const spanMs = chartData.length > 1 ? chartData[chartData.length - 1].ts - chartData[0].ts : 0;

  const yAxis = useMemo(() => {
    const values = chartData.flatMap((row) => seriesKeys.map((key) => Number(row[key] ?? 50)));
    return niceYDomain(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData, seriesKeys.join(',')]);

  // The cached path geometry is only valid for a given dataset; drop it when the data
  // changes (e.g. a polling refetch) so it is re-sampled from the new line on next hover.
  useEffect(() => {
    pathCacheRef.current = null;
    lastHoverXRef.current = -1;
  }, [chartData]);

  // Sample every series path once for the current size; reused across pointer moves.
  // The signature keys on the svg size, so a resize transparently rebuilds it.
  const ensurePathCache = (svg: SVGSVGElement, svgRect: DOMRect): PathCache | null => {
    const signature = `${Math.round(svgRect.width)}x${Math.round(svgRect.height)}`;

    if (pathCacheRef.current && pathCacheRef.current.signature === signature) return pathCacheRef.current;

    const byKey = new Map<string, SeriesSamples>();
    for (const item of series) {
      const path = svg.querySelector<SVGPathElement>(`.market-detail-line-${item.key} .recharts-line-curve`);
      if (path) byKey.set(item.key, sampleSeriesPath(path));
    }

    if (byKey.size === 0) return null;

    const first = byKey.get(series[0].key) ?? byKey.values().next().value!;
    const cache: PathCache = {
      signature,
      minX: first.xs[0],
      maxX: first.xs[first.xs.length - 1],
      byKey,
    };
    pathCacheRef.current = cache;

    return cache;
  };

  // Runs at most once per animation frame (see handleChartPointerMove) using cached
  // geometry, so the per-move cost is a handful of array reads instead of dozens of
  // layout-forcing getPointAtLength calls.
  const processPointerAt = (clientX: number) => {
    const container = chartRef.current;
    const svg = container?.querySelector<SVGSVGElement>('.recharts-surface');

    if (!container || !svg || chartData.length === 0 || series.length === 0) return;

    const svgRect = svg.getBoundingClientRect();
    const cache = ensurePathCache(svg, svgRect);

    if (!cache) return;

    const containerRect = container.getBoundingClientRect();
    const viewport = getSvgViewport(svg);
    const targetSvgX = viewport.x + ((clientX - svgRect.left) / svgRect.width) * viewport.width;
    const hoverSvgX = Math.max(cache.minX, Math.min(cache.maxX, targetSvgX));

    // Skip the work + re-render entirely if the cursor is still within the same pixel.
    const roundedX = Math.round(hoverSvgX);
    if (roundedX === lastHoverXRef.current) return;
    lastHoverXRef.current = roundedX;

    const progress = Math.max(0, Math.min(1, (hoverSvgX - cache.minX) / Math.max(1, cache.maxX - cache.minX)));
    const activePoint = getActiveChartPoint(chartData, progress, seriesKeys);
    const points: ChartHoverPoint[] = [];

    for (const item of series) {
      const samples = cache.byKey.get(item.key);
      if (!samples) continue;

      const measure = measureSampledAtX(samples, hoverSvgX);
      const x = svgRect.left - containerRect.left + ((hoverSvgX - viewport.x) / viewport.width) * svgRect.width;
      const y = svgRect.top - containerRect.top + ((measure.y - viewport.y) / viewport.height) * svgRect.height;

      points.push({
        color: item.color,
        key: item.key,
        pathD: samples.pathD,
        pathLength: measure.pathLength,
        totalLength: measure.totalLength,
        name: item.name,
        value: activePoint.values[item.key] ?? 0,
        svgX: hoverSvgX,
        x,
        y,
      });
    }

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
      time: activePoint.isoTime,
      points,
    });
  };

  // Coalesce the high-frequency pointermove stream into one update per frame.
  const handleChartPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    pointerClientXRef.current = event.clientX;
    if (pointerFrameRef.current !== null) return;

    pointerFrameRef.current = window.requestAnimationFrame(() => {
      pointerFrameRef.current = null;
      if (pointerClientXRef.current !== null) processPointerAt(pointerClientXRef.current);
    });
  };

  const handleChartPointerLeave = () => {
    clearPointerFrame();
    lastHoverXRef.current = -1;

    if (!chartHover.visible) return;

    clearChartHoverExitTimeout();
    clearChartHoverExitFrame();
    setChartHover((previous) => (previous.visible ? { ...previous, isLeaving: true, exitProgress: 0 } : previous));

    const startedAt = window.performance.now();
    const easeOutCubic = (value: number) => 1 - (1 - value) ** 3;
    const animateExit = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / chartHoverExitDurationMs);
      const easedProgress = easeOutCubic(progress);

      setChartHover((previous) => (previous.isLeaving ? { ...previous, exitProgress: easedProgress } : previous));

      if (progress < 1) {
        chartHoverExitFrameRef.current = window.requestAnimationFrame(animateExit);
        return;
      }

      chartHoverExitFrameRef.current = null;
      setChartHover((previous) => (previous.isLeaving ? { ...previous, visible: false, isLeaving: false, exitProgress: 0 } : previous));
    };

    chartHoverExitFrameRef.current = window.requestAnimationFrame(animateExit);
  };

  return (
    <div
      ref={chartRef}
      className={`relative w-full ${heightClass}`}
      onPointerMove={handleChartPointerMove}
      onPointerLeave={handleChartPointerLeave}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-pm-chart-grid)" strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickCount={6}
            tickFormatter={(value) => formatChartTime(value, locale, spanMs)}
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--color-pm-text-muted)', fontSize: 12, fontWeight: 600 }}
            dy={10}
          />
          <YAxis
            orientation="right"
            domain={yAxis.domain}
            ticks={yAxis.ticks}
            tickFormatter={(value) => `${value}%`}
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--color-pm-text-muted)', fontSize: 12, fontWeight: 600 }}
            width={46}
            allowDataOverflow
          />
          <Tooltip cursor={false} wrapperStyle={{ display: 'none' }} />
          {series.map((item) => (
            <Line
              key={item.key}
              className={`market-detail-line-${item.key}`}
              type="linear"
              dataKey={item.key}
              stroke={item.color}
              strokeDasharray={getChartLineDash(chartHover, item.key)}
              strokeWidth={2.5}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          ))}
          <Customized component={<ChartFutureLines hover={chartHover} />} />
        </LineChart>
      </ResponsiveContainer>
      {chartHover.visible && <ChartViewOverlay hover={chartHover} spanMs={spanMs} />}
    </div>
  );
}
