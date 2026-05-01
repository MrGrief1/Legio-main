import { type PointerEvent, useRef, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis } from 'recharts';
import { motion } from 'motion/react';
import { Link as LinkIcon, Bookmark, ChevronLeft, ChevronRight } from 'lucide-react';

const mockChartData = [
  { time: '', val: 45 },
  { time: '', val: 42 },
  { time: '', val: 30 },
  { time: '', val: 30 },
  { time: '', val: 15 },
  { time: '12:00 ПП', val: 9 },
  { time: '', val: 9 },
  { time: '12:00 ДП', val: 9 },
  { time: '', val: 9 },
  { time: '12:00 ПП', val: 9 },
  { time: '', val: 9 },
  { time: '12:00 ДП', val: 9 },
  { time: '', val: 9 },
];

type FeaturedChartHover = {
  active: boolean;
  width: number;
  svgX: number;
  pathD: string;
  viewBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  x: number;
  y: number;
  value: number;
  time: string;
};

const initialChartHover: FeaturedChartHover = {
  active: false,
  width: 0,
  svgX: 0,
  pathD: '',
  viewBox: {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  },
  x: 0,
  y: 0,
  value: 9,
  time: '12:00 ДП',
};

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

function getChartRowAtProgress(progress: number) {
  const exactIndex = progress * Math.max(1, mockChartData.length - 1);
  const row = mockChartData[Math.round(exactIndex)] ?? mockChartData[mockChartData.length - 1];

  return {
    value: row.val,
    time: row.time || '12:00 ДП',
  };
}

export function FeaturedMarket() {
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartHover, setChartHover] = useState<FeaturedChartHover>(initialChartHover);

  const handleChartPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const container = chartRef.current;
    const svg = container?.querySelector<SVGSVGElement>('.recharts-surface');
    const path =
      svg?.querySelector<SVGPathElement>('.featured-market-line.recharts-line-curve') ??
      svg?.querySelector<SVGPathElement>('.featured-market-line .recharts-line-curve') ??
      svg?.querySelector<SVGPathElement>('.recharts-line-curve');

    if (!container || !svg || !path) return;

    const containerRect = container.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const viewport = getSvgViewport(svg);
    const targetSvgX = viewport.x + ((event.clientX - svgRect.left) / svgRect.width) * viewport.width;
    const point = getPointAtPathX(path, targetSvgX);
    const firstPoint = path.getPointAtLength(0);
    const lastPoint = path.getPointAtLength(path.getTotalLength());
    const minPathX = Math.min(firstPoint.x, lastPoint.x);
    const maxPathX = Math.max(firstPoint.x, lastPoint.x);
    const progress = Math.max(0, Math.min(1, (targetSvgX - minPathX) / Math.max(1, maxPathX - minPathX)));
    const row = getChartRowAtProgress(progress);

    setChartHover((previous) => ({
      ...previous,
      active: true,
      width: containerRect.width,
      svgX: point.x,
      pathD: path.getAttribute('d') ?? '',
      viewBox: viewport,
      x: svgRect.left - containerRect.left + ((point.x - viewport.x) / viewport.width) * svgRect.width,
      y: svgRect.top - containerRect.top + ((point.y - viewport.y) / viewport.height) * svgRect.height,
      value: row.value,
      time: row.time,
    }));
  };

  const featuredTooltipOnLeft = chartHover.x > chartHover.width - 150;
  const featuredDateOnLeft = chartHover.x > chartHover.width - 70;

  return (
    <div className="flex flex-col gap-3">
      {/* Main Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-pm-surface border border-pm-border rounded-xl p-4 lg:p-5 flex flex-col hover:border-pm-text-muted transition-colors relative"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-4 w-full">
          <div className="flex items-center gap-3">
            <img 
              src="https://ui-avatars.com/api/?name=James+Comey&background=random" 
              alt="Comey" 
              className="w-10 h-10 rounded-lg object-cover" 
            />
            <div>
              <div className="text-xs text-pm-text-muted mb-0.5">Политика • Суды</div>
              <h2 className="text-lg lg:text-xl font-bold text-white leading-tight">
                Джеймс Коми приговорен к тюремному заключению ...
              </h2>
            </div>
          </div>
          <div className="flex gap-3 text-pm-text-muted shrink-0 ml-4">
            <LinkIcon className="w-5 h-5 cursor-pointer hover:text-white transition-colors" />
            <Bookmark className="w-5 h-5 cursor-pointer hover:text-white transition-colors" />
          </div>
        </div>

        {/* Content Columns */}
        <div className="flex flex-col lg:flex-row gap-5">
          
          {/* Left Column (Probability, Buttons, News) */}
          <div className="flex-1 flex flex-col w-full lg:w-[45%]">
            
            {/* Probability */}
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-2xl lg:text-3xl font-bold text-pm-blue">9% вероятность</span>
              <span className="text-pm-red font-medium flex items-center text-sm">
                ▼ 35%
              </span>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 mb-5">
              <button className="flex-1 bg-[#22c55e]/10 text-[#22c55e] hover:bg-[#22c55e]/20 py-2.5 lg:py-3 rounded-lg font-bold text-base transition-colors border-none">
                Да
              </button>
              <button className="flex-1 bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20 py-2.5 lg:py-3 rounded-lg font-bold text-base transition-colors border-none">
                Нет
              </button>
            </div>

            {/* News items (The "three initial elements") */}
            <div 
              className="relative mb-4 h-[135px] shrink-0 overflow-hidden lg:h-[150px]"
              style={{ WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)', maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)' }}
            >
              <motion.div
                animate={{ y: ["-50%", "0%"] }}
                transition={{ duration: 15, ease: "linear", repeat: Infinity }}
                className="flex flex-col gap-4 pt-2"
              >
                {[...Array(2)].map((_, arrayIndex) => (
                  <div key={arrayIndex} className="flex flex-col gap-4">
                    <a href="#" className="group block cursor-pointer">
                      <div className="flex items-center gap-2 text-xs text-pm-text-muted mb-1.5">
                        <span className="flex items-center justify-center font-bold text-pm-text bg-white/10 rounded-[3px] h-[16px] px-1.5 text-[10px]">AP</span>
                        <span className="leading-[16px]">AP News • 2д назад</span>
                      </div>
                      <p className="text-[13px] text-pm-text group-hover:text-white transition-colors leading-snug">
                        Ex-FBI Director Comey indicted again, in a probe over an online post officials call a Trump threat
                      </p>
                    </a>
                    
                    <a href="#" className="group block cursor-pointer">
                      <div className="flex items-center gap-2 text-xs text-pm-text-muted mb-1.5">
                        <span className="flex items-center justify-center font-serif font-bold text-pm-text bg-white/10 rounded-[3px] h-[16px] px-1.5 text-[10px] italic">wp</span>
                        <span className="leading-[16px]">The Washington Post • 2д назад</span>
                      </div>
                      <p className="text-[13px] text-pm-text group-hover:text-white transition-colors leading-snug">
                        Former Fauci aide charged in alleged effort to thwart pandemic inquiries
                      </p>
                    </a>

                    <a href="#" className="group block cursor-pointer">
                      <div className="flex items-center gap-2 text-xs text-pm-text-muted mb-1.5">
                        <span className="flex items-center justify-center font-bold text-pm-text bg-white/10 rounded-[3px] h-[16px] px-1.5 text-[10px] tracking-wider">BBC</span>
                        <span className="leading-[16px]">BBC • 2д назад</span>
                      </div>
                      <p className="text-[13px] text-pm-text group-hover:text-white transition-colors leading-snug">
                        Former FBI director James Comey charged with threatening Trump's life in Instagram post
                      </p>
                    </a>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Footer Left */}
            <div className="text-xs font-medium text-pm-text-muted mt-auto">
              $94.6K Объём
            </div>
          </div>

          {/* Right Column (Chart) */}
          <div className="right-chart-col relative h-[250px] w-full lg:h-[270px] lg:w-[55%]">
            {/* Chart */}
            <div
              ref={chartRef}
              className="absolute inset-x-0 top-0 bottom-7"
              onPointerMove={handleChartPointerMove}
              onPointerLeave={() => setChartHover((previous) => ({ ...previous, active: false }))}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockChartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <XAxis 
                    dataKey="time" 
                    axisLine={{ stroke: '#2a2b31' }} 
                    tickLine={false} 
                    tick={{ fontSize: 11, fill: '#8b8f98' }} 
                    dy={10} 
                  />
                  <YAxis 
                    domain={[0, 50]} 
                    ticks={[0, 10, 20, 30, 40, 50]}
                    tickFormatter={(val) => `${val}%`}
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 11, fill: '#8b8f98' }} 
                    orientation="right"
                    width={40}
                  />
                  <Line 
                    className="featured-market-line"
                    type="stepAfter" 
                    dataKey="val" 
                    stroke="#2563eb" 
                    strokeWidth={2} 
                    dot={false} 
                    activeDot={false}
                    isAnimationActive={false} 
                  />
                </LineChart>
              </ResponsiveContainer>

              {chartHover.active && chartHover.pathD && (
                <svg
                  className="pointer-events-none absolute inset-0"
                  viewBox={`${chartHover.viewBox.x} ${chartHover.viewBox.y} ${chartHover.viewBox.width} ${chartHover.viewBox.height}`}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <clipPath id="featured-market-future-line" clipPathUnits="userSpaceOnUse">
                      <rect
                        x={chartHover.svgX}
                        y={chartHover.viewBox.y}
                        width={Math.max(0, chartHover.viewBox.x + chartHover.viewBox.width - chartHover.svgX)}
                        height={chartHover.viewBox.height}
                      />
                    </clipPath>
                  </defs>
                  <path
                    d={chartHover.pathD}
                    fill="none"
                    stroke="#3f444d"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.8}
                    clipPath="url(#featured-market-future-line)"
                  />
                </svg>
              )}

              {chartHover.active && (
                <>
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/10"
                    style={{ left: chartHover.x }}
                  />
                  <div
                    className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-pm-blue shadow-[0_0_0_3px_rgba(37,99,235,0.18)]"
                    style={{ left: chartHover.x, top: chartHover.y }}
                  />
                  <div
                    className={
                      featuredTooltipOnLeft
                        ? 'pointer-events-none absolute flex items-center gap-1 whitespace-nowrap rounded-md border border-pm-border bg-pm-bg/95 px-2 py-1 text-xs font-bold text-white shadow-[0_6px_20px_rgba(0,0,0,0.25)]'
                        : 'pointer-events-none absolute ml-3 flex items-center gap-1 whitespace-nowrap rounded-md border border-pm-border bg-pm-bg/95 px-2 py-1 text-xs font-bold text-white shadow-[0_6px_20px_rgba(0,0,0,0.25)]'
                    }
                    style={{
                      left: chartHover.x,
                      top: chartHover.y - 13,
                      transform: featuredTooltipOnLeft ? 'translateX(calc(-100% - 12px))' : undefined,
                    }}
                  >
                    <span className="h-3 w-1 rounded-full bg-pm-blue" />
                    <span>Да</span>
                    <span>{chartHover.value}%</span>
                  </div>
                  <div
                    className="pointer-events-none absolute whitespace-nowrap text-[11px] font-bold text-pm-text-muted"
                    style={{
                      left: chartHover.x,
                      top: 0,
                      transform: featuredDateOnLeft ? 'translateX(-100%)' : 'translateX(-50%)',
                    }}
                  >
                    {chartHover.time}
                  </div>
                </>
              )}
            </div>

            {/* Footer Right */}
            <div className="absolute bottom-0 right-0 text-xs font-medium text-pm-text-muted flex items-center justify-end w-full">
              Завершается дек. 31, 2026 <span className="mx-2">•</span> 
              <span className="flex items-center gap-1 font-bold text-pm-text">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                Polymarket
              </span>
            </div>
          </div>

        </div>
      </motion.div>

      {/* Pagination Below Card */}
      <div className="flex items-center justify-between gap-3 px-2">
        {/* Dots */}
        <div className="flex h-9 items-center gap-1.5 rounded-full border border-pm-border bg-pm-surface px-4">
          <div className="w-1.5 h-1.5 rounded-full bg-pm-text-muted/50"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-pm-text-muted/50"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-pm-text-muted/50"></div>
          <div className="w-6 h-1.5 rounded-full bg-pm-text"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-pm-text-muted/50"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-pm-text-muted/50"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-pm-text-muted/50"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-pm-text-muted/50"></div>
        </div>

        {/* Next/Prev */}
        <div className="flex gap-2">
          <button className="flex h-9 items-center gap-1 rounded-full border border-pm-border bg-pm-surface px-4 text-sm font-medium text-pm-text transition-colors hover:bg-pm-surface-hover">
            <ChevronLeft className="w-4 h-4" /> BTC 5min Up or Down
          </button>
          <button className="flex h-9 items-center gap-1 rounded-full border border-pm-border bg-pm-surface px-4 text-sm font-medium text-pm-text transition-colors hover:bg-pm-surface-hover">
            Peace Deal <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
