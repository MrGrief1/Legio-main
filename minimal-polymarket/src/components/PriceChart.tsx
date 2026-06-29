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
import { type MarketHistoryPoint } from '../lib/api';
import { useI18n } from '../lib/i18n';

function formatShortDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
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
  { key: 'yes', color: '#22c55e' },
  { key: 'no', color: '#ef4444' },
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
  const { locale } = useI18n();
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
        {formatShortDate(hover.time, locale)}
      </motion.div>

      {hover.points.map((point) => {
        const labelTop = point.key === 'yes' ? point.y - 34 : point.y + 8;
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

function getChartLineDash(hover: ChartHoverState, key: 'yes' | 'no') {
  if (!hover.visible) return undefined;

  const point = hover.points.find((item) => item.key === key);

  if (!point) return undefined;

  return `${point.pathLength} ${Math.max(0, point.totalLength - point.pathLength)}`;
}

export function PriceChart({ history, heightClass = 'h-[220px] sm:h-[260px]' }: { history: MarketHistoryPoint[]; heightClass?: string }) {
  const { t, locale } = useI18n();
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

  useEffect(() => () => {
    clearChartHoverExitTimeout();
    clearChartHoverExitFrame();
  }, []);

  const chartData = useMemo<ChartRow[]>(() => history.map((point) => ({
    time: formatShortDate(point.time, locale),
    isoTime: point.time,
    yes: point.yesPercent,
    no: point.noPercent ?? 100 - point.yesPercent,
  })), [history, locale]);

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
        name: series.key === 'yes' ? t('common.yes') : t('common.no'),
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
            formatter={(value, name) => [`${value}%`, name === 'yes' ? t('common.yes') : t('common.no')]}
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
  );
}
