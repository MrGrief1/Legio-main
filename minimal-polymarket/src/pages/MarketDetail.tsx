import { type PointerEvent, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Bookmark,
  ChevronDown,
  Code2,
  Info,
  Link as LinkIcon,
  MessageCircle,
  ShieldCheck,
  Smile,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const marketDetails = {
  '1': {
    icon: 'JC',
    category: 'Политика',
    subcategory: 'Суды',
    title: 'Джеймс Коми был приговорён к тюремному заключению?',
    volume: '$160K',
    endDate: '31 дек. 2026 г.',
    selected: '31 декабря 2026 года',
    outcomes: [
      { name: '31 декабря 2026 года', volume: '$94,6K', percent: 9, trend: -35 },
      { name: 'После 31 декабря 2026 года', volume: '$65,4K', percent: 91, trend: 35 },
    ],
  },
  '2': {
    icon: '₿',
    category: 'Криптовалюта',
    subcategory: 'Bitcoin',
    title: 'BTC вверх или вниз на 5 м',
    volume: '$2M',
    endDate: 'Сегодня',
    selected: 'BTC вверх за 5 минут',
    outcomes: [
      { name: 'BTC вверх за 5 минут', volume: '$1,1M', percent: 50, trend: 0 },
      { name: 'BTC вниз за 5 минут', volume: '$900K', percent: 50, trend: 0 },
    ],
  },
  '3': {
    icon: '🇮🇳',
    category: 'Политика',
    subcategory: 'Индийские выборы',
    title: 'Победитель выборов в Законодательное собрание Западной Бенгалии',
    volume: '$5M',
    endDate: '30 июн. 2026 г.',
    selected: 'AITC',
    outcomes: [
      { name: 'AITC', volume: '$2,6M', percent: 51, trend: 4 },
      { name: 'БДП', volume: '$2,4M', percent: 50, trend: -2 },
    ],
  },
  default: {
    icon: '◎',
    category: 'Рынок',
    subcategory: 'Polymarket',
    title: 'Что произойдет с сырой нефтью WTI (WTI) в мае 2026 года?',
    volume: '$2M',
    endDate: '31 мая 2026 г.',
    selected: '↑ $90',
    outcomes: [
      { name: '↑ $90', volume: '$1,2M', percent: 99, trend: 2 },
      { name: '↑ $100', volume: '$800K', percent: 98, trend: 1 },
      { name: '↓ $80', volume: '$220K', percent: 32, trend: -8 },
    ],
  },
};

const chartColors = ['#8bbfff', '#4f7dff', '#f8c545', '#f18834'];

type ChartHoverPoint = {
  color: string;
  pathD: string;
  name: string;
  value: number;
  x: number;
  y: number;
};

type ChartHoverState = {
  visible: boolean;
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

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function buildChartData(outcomes: { percent: number }[]) {
  const wave = [0, -3, 2, -6, 4, 0, 6, -2, 1];
  const timeline = ['апр. 18', 'апр. 19', 'апр. 21', 'апр. 23', 'апр. 25', 'апр. 26', 'апр. 27', 'апр. 29', 'май 1'];

  return timeline.map((time, pointIndex) => {
    const progress = pointIndex / (timeline.length - 1);
    const row: Record<string, number | string> = { time };

    outcomes.slice(0, 4).forEach((outcome, seriesIndex) => {
      const startBias = outcome.percent >= 50 ? -18 : 24;
      const start = clampPercent(outcome.percent + startBias);
      const value = start + (outcome.percent - start) * progress + wave[pointIndex] * (1 - seriesIndex * 0.15);
      row[`line${seriesIndex}`] = clampPercent(value);
    });

    return row;
  });
}

function getInterpolatedChartPoint(data: Record<string, number | string>[], progress: number) {
  const exactIndex = progress * Math.max(1, data.length - 1);
  const leftIndex = Math.floor(exactIndex);
  const rightIndex = Math.min(data.length - 1, leftIndex + 1);
  const mix = exactIndex - leftIndex;
  const left = data[leftIndex];
  const right = data[rightIndex];
  const nearest = data[Math.round(exactIndex)];
  const row: Record<string, number | string> = { time: nearest.time };

  Object.keys(left).forEach((key) => {
    if (key === 'time') return;
    const leftValue = Number(left[key]);
    const rightValue = Number(right[key]);
    row[key] = clampPercent(leftValue + (rightValue - leftValue) * mix);
  });

  return row;
}

function getPointAtPathX(path: SVGPathElement, targetX: number) {
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

  return path.getPointAtLength((start + end) / 2);
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

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 bottom-0">
      {hover.viewBox.width > 0 && (
        <svg
          className="absolute inset-0"
          viewBox={`${hover.viewBox.x} ${hover.viewBox.y} ${hover.viewBox.width} ${hover.viewBox.height}`}
          preserveAspectRatio="none"
        >
          <defs>
            <clipPath id="market-detail-future-line" clipPathUnits="userSpaceOnUse">
              <rect
                x={hover.svgX}
                y={hover.viewBox.y}
                width={Math.max(0, hover.viewBox.x + hover.viewBox.width - hover.svgX)}
                height={hover.viewBox.height}
              />
            </clipPath>
          </defs>
          {hover.points.map((point) => (
            <path
              key={`future-${point.name}`}
              d={point.pathD}
              fill="none"
              stroke="#3f444d"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.8}
              clipPath="url(#market-detail-future-line)"
            />
          ))}
        </svg>
      )}
      <div className="absolute top-0 bottom-8 w-px bg-white/10" style={{ left: hover.x }} />
      <div
        className="absolute -translate-x-1/2 text-xs font-bold text-pm-text-muted"
        style={{ left: hover.x, top: -2 }}
      >
        {hover.time}, 12:00 ДП
      </div>

      {hover.points.map((point) => {
        const labelPosition = labelsOnLeft
          ? { left: point.x, top: point.y - 12, transform: 'translateX(calc(-100% - 12px))' }
          : { left: point.x, top: point.y - 12 };

        return (
          <div key={point.name}>
            <div
              className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-pm-surface"
              style={{ left: point.x, top: point.y, backgroundColor: point.color }}
            />
            <div
              className={
                labelsOnLeft
                  ? 'absolute flex items-center gap-1 whitespace-nowrap rounded-md border border-pm-border bg-pm-bg/95 px-2 py-1 text-xs font-bold text-white shadow-[0_6px_20px_rgba(0,0,0,0.25)]'
                  : 'absolute ml-3 flex items-center gap-1 whitespace-nowrap rounded-md border border-pm-border bg-pm-bg/95 px-2 py-1 text-xs font-bold text-white shadow-[0_6px_20px_rgba(0,0,0,0.25)]'
              }
              style={labelPosition}
            >
              <span className="h-3 w-1 rounded-full" style={{ backgroundColor: point.color }} />
              <span>{point.name}</span>
              <span>{Math.round(point.value)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TradePanel({
  icon,
  selected,
  percent,
}: {
  icon: string;
  selected: string;
  percent: number;
}) {
  const yesPrice = Math.max(1, Math.min(99, Math.round(percent)));
  const noPrice = Math.max(1, Math.min(99, 100 - yesPrice));

  return (
    <aside className="sticky top-24 self-start rounded-2xl border border-pm-border bg-pm-surface shadow-[0_18px_44px_rgba(0,0,0,0.24)]">
      <div className="flex items-center gap-3 border-b border-pm-border p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pm-surface-hover text-xl font-bold text-white">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-white">{selected}</h2>
          <p className="text-xs font-medium text-pm-text-muted">Торговое меню</p>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-pm-border px-4 pt-3">
        <div className="flex gap-5 text-base font-bold">
          <button className="border-b-2 border-white pb-2.5 text-white">Купить</button>
          <button className="pb-2.5 text-pm-text-muted transition-colors hover:text-white">Продать</button>
        </div>
        <button className="flex items-center gap-1 pb-2.5 text-sm font-semibold text-pm-text">
          Рынок <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <button className="h-12 rounded-lg bg-[#22c55e]/75 text-base font-bold text-white transition-colors hover:bg-[#22c55e]/90">
            Да {yesPrice}¢
          </button>
          <button className="h-12 rounded-lg bg-pm-surface-hover text-base font-bold text-pm-text-muted transition-colors hover:text-white">
            Нет {noPrice}¢
          </button>
        </div>

        <div className="flex items-end justify-between gap-4">
          <label className="text-base font-bold text-white" htmlFor="trade-amount">
            Сумма
          </label>
          <input
            id="trade-amount"
            inputMode="decimal"
            placeholder="$0"
            className="w-36 bg-transparent text-right text-4xl font-bold text-pm-text-muted outline-none placeholder:text-pm-text-muted"
          />
        </div>

        <div className="grid grid-cols-4 gap-2">
          {['+$1', '+$5', '+$10', '+$100'].map((amount) => (
            <button
              key={amount}
              className="h-9 rounded-lg border border-pm-border text-sm font-bold text-pm-text-muted transition-colors hover:border-pm-text-muted hover:text-white"
            >
              {amount}
            </button>
          ))}
        </div>

        <button className="h-12 w-full rounded-lg bg-pm-blue text-base font-bold text-white shadow-[0_4px_0_#1d4ed8] transition-colors hover:bg-blue-700">
          Сделка
        </button>

        <p className="text-center text-xs leading-relaxed text-pm-text-muted">
          Совершая торговые операции, ты соглашаешься с{' '}
          <span className="underline decoration-pm-text-muted underline-offset-2">условиями использования</span>.
        </p>
      </div>
    </aside>
  );
}

export function MarketDetail() {
  const { id } = useParams();
  const market = marketDetails[id as keyof typeof marketDetails] ?? marketDetails.default;
  const selectedOutcome = market.outcomes[0];
  const chartData = useMemo(() => buildChartData(market.outcomes), [market.outcomes]);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartHover, setChartHover] = useState<ChartHoverState>(hiddenChartHover);

  const handleChartPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const container = chartRef.current;
    const svg = container?.querySelector<SVGSVGElement>('.recharts-surface');

    if (!container || !svg) return;

    const containerRect = container.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const viewport = getSvgViewport(svg);
    const targetSvgX = viewport.x + ((event.clientX - svgRect.left) / svgRect.width) * viewport.width;
    const firstPath = svg.querySelector<SVGPathElement>('.market-detail-line-0 .recharts-line-curve');

    if (!firstPath) return;

    const firstPoint = firstPath.getPointAtLength(0);
    const lastPoint = firstPath.getPointAtLength(firstPath.getTotalLength());
    const minPathX = Math.min(firstPoint.x, lastPoint.x);
    const maxPathX = Math.max(firstPoint.x, lastPoint.x);
    const progress = Math.max(0, Math.min(1, (targetSvgX - minPathX) / Math.max(1, maxPathX - minPathX)));
    const activePoint = getInterpolatedChartPoint(chartData, progress);
    const points = market.outcomes.slice(0, 4).reduce<ChartHoverPoint[]>((result, outcome, index) => {
      const path =
        svg.querySelector<SVGPathElement>(`.market-detail-line-${index} .recharts-line-curve`) ??
        svg.querySelectorAll<SVGPathElement>('.recharts-line-curve')[index];

      if (!path) return result;

      const point = getPointAtPathX(path, targetSvgX);
      const x = svgRect.left - containerRect.left + ((point.x - viewport.x) / viewport.width) * svgRect.width;
      const y = svgRect.top - containerRect.top + ((point.y - viewport.y) / viewport.height) * svgRect.height;

      result.push({
        color: chartColors[index],
        pathD: path.getAttribute('d') ?? '',
        name: outcome.name,
        value: Number(activePoint[`line${index}`] ?? outcome.percent),
        x,
        y,
      });

      return result;
    }, []);

    if (points.length === 0) return;

    setChartHover({
      visible: true,
      x: points[0].x,
      svgX: targetSvgX,
      viewBox: viewport,
      time: String(activePoint.time),
      points,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="mx-auto max-w-[1400px] px-4 py-3 sm:px-6"
    >
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pm-surface text-lg font-bold text-white">
                {market.icon}
              </div>
              <div className="min-w-0">
                <div className="mb-1 text-sm font-semibold text-pm-text-muted">
                  {market.category} <span className="mx-1">•</span> {market.subcategory}
                </div>
                <h1 className="text-xl font-bold leading-tight text-white sm:text-2xl">{market.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm font-semibold text-pm-text-muted">
                  <span>{market.volume} Объём</span>
                  <span>•</span>
                  <span>{market.endDate}</span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 text-pm-text">
              <button className="rounded-lg p-2 transition-colors hover:bg-pm-surface hover:text-white">
                <Code2 className="h-5 w-5" />
              </button>
              <button className="rounded-lg p-2 transition-colors hover:bg-pm-surface hover:text-white">
                <LinkIcon className="h-5 w-5" />
              </button>
              <button className="rounded-lg p-2 transition-colors hover:bg-pm-surface hover:text-white">
                <Bookmark className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-pm-border bg-pm-surface p-3.5">
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {market.outcomes.slice(0, 4).map((outcome, index) => (
                <div key={outcome.name} className="flex items-center gap-2 text-sm font-semibold text-pm-text">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartColors[index] }} />
                  <span>{outcome.name}</span>
                  <span className="font-bold text-white">{outcome.percent}%</span>
                </div>
              ))}
            </div>

            <div
              ref={chartRef}
              className="relative h-[185px] w-full sm:h-[205px]"
              onPointerMove={handleChartPointerMove}
              onPointerLeave={() => setChartHover((previous) => ({ ...previous, visible: false }))}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="#2a2b31" strokeDasharray="3 4" vertical={false} />
                  <XAxis
                    dataKey="time"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#8b8f98', fontSize: 12, fontWeight: 600 }}
                    dy={10}
                  />
                  <YAxis
                    orientation="right"
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tickFormatter={(value) => `${value}%`}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#8b8f98', fontSize: 12, fontWeight: 600 }}
                    width={46}
                  />
                  <Tooltip
                    cursor={false}
                    wrapperStyle={{ display: 'none' }}
                    formatter={(value, name) => [`${value}%`, name]}
                  />
                  {market.outcomes.slice(0, 4).map((outcome, index) => (
                    <Line
                      key={outcome.name}
                      className={`market-detail-line-${index}`}
                      type="monotone"
                      dataKey={`line${index}`}
                      name={outcome.name}
                      stroke={chartColors[index]}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              {chartHover.visible && (
                <ChartViewOverlay hover={chartHover} />
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-pm-border pt-2.5 text-sm font-semibold text-pm-text-muted">
              <div className="flex flex-wrap items-center gap-3">
                <span>{market.volume} Объём</span>
                <span>•</span>
                <span>{market.endDate}</span>
              </div>
              <div className="flex items-center gap-3">
                {['1Ч', '6Ч', '1Д', '1Н', '1М', 'ВСЕ'].map((range) => (
                  <button
                    key={range}
                    className={range === 'ВСЕ' ? 'font-bold text-white' : 'transition-colors hover:text-white'}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-pm-border bg-pm-surface">
            {market.outcomes.map((outcome, index) => {
              const yesPrice = Math.max(1, Math.min(99, Math.round(outcome.percent)));
              const noPrice = Math.max(1, Math.min(99, 100 - yesPrice));

              return (
                <div
                  key={outcome.name}
                  className="grid grid-cols-1 gap-3 border-b border-pm-border p-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                >
                  <div>
                    <h2 className="text-base font-bold text-white sm:text-lg">{outcome.name}</h2>
                    <p className="mt-0.5 text-sm font-semibold text-pm-text-muted">{outcome.volume} Объём</p>
                  </div>
                  <div className="flex items-baseline gap-2 sm:min-w-[130px] sm:justify-end">
                    <span className="text-2xl font-bold text-white sm:text-3xl">{outcome.percent}%</span>
                    <span className={outcome.trend >= 0 ? 'text-sm font-bold text-pm-green' : 'text-sm font-bold text-pm-red'}>
                      {outcome.trend >= 0 ? '▲' : '▼'} {Math.abs(outcome.trend)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:w-[270px]">
                    <button className="h-9 rounded-lg bg-[#22c55e]/10 px-4 text-sm font-bold text-pm-green transition-colors hover:bg-[#22c55e]/20">
                      Купить Да {yesPrice}¢
                    </button>
                    <button className="h-9 rounded-lg bg-[#ef4444]/10 px-4 text-sm font-bold text-pm-red transition-colors hover:bg-[#ef4444]/20">
                      Купить Нет {noPrice}¢
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-5">
            <div className="flex items-center gap-6 border-b border-pm-border text-lg font-bold">
              <button className="border-b-2 border-white pb-3 text-white">Правила</button>
              <button className="pb-3 text-pm-text-muted transition-colors hover:text-white">Рыночный контекст</button>
            </div>

            <div className="rounded-2xl border border-pm-border bg-pm-surface">
              <div className="flex items-center justify-between border-b border-pm-border p-4">
                <div className="flex items-center gap-2 font-bold text-white">
                  <Info className="h-5 w-5 text-pm-blue" />
                  Дополнительный контекст
                </div>
                <span className="text-sm font-semibold text-pm-text-muted">Обновлено 17 февр.</span>
              </div>
              <div className="space-y-4 p-4 text-sm leading-relaxed text-pm-text">
                <p>
                  Этот рынок разрешится как “Да”, если указанный исход станет публично подтверждённым до даты завершения.
                  Иначе рынок разрешится как “Нет”.
                </p>
                <p>
                  Формулировки, неподтверждённые заявления и неоднозначные источники не считаются достаточным основанием
                  для разрешения рынка.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-5 text-lg font-bold">
              <button className="text-white">Комментарии (45)</button>
              <button className="text-pm-text-muted transition-colors hover:text-white">Крупнейшие держатели</button>
              <button className="text-pm-text-muted transition-colors hover:text-white">Позиции</button>
              <button className="text-pm-text-muted transition-colors hover:text-white">Активность</button>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-pm-border bg-pm-surface px-4 py-3">
              <MessageCircle className="h-5 w-5 text-pm-text-muted" />
              <input
                placeholder="Добавить комментарий..."
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-pm-text-muted"
              />
              <Smile className="h-5 w-5 text-pm-text-muted" />
              <button className="rounded-lg bg-pm-blue px-4 py-2 text-sm font-bold text-white">Опубликовать</button>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-pm-surface px-4 py-2 text-sm font-semibold text-pm-text-muted">
              <ShieldCheck className="h-4 w-4" />
              Не доверяй внешним ссылкам.
            </div>
          </div>
        </section>

        <TradePanel icon={market.icon} selected={market.selected} percent={selectedOutcome.percent} />
      </div>
    </motion.div>
  );
}
