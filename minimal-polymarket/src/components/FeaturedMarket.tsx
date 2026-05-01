import { LineChart, Line, ResponsiveContainer, YAxis, XAxis } from 'recharts';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
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

export function FeaturedMarket() {
  return (
    <div className="flex flex-col gap-4">
      {/* Main Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-pm-surface border border-pm-border rounded-xl p-6 flex flex-col hover:border-pm-text-muted transition-colors relative"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6 w-full">
          <div className="flex items-center gap-4">
            <img 
              src="https://ui-avatars.com/api/?name=James+Comey&background=random" 
              alt="Comey" 
              className="w-12 h-12 rounded-lg object-cover" 
            />
            <div>
              <div className="text-sm text-pm-text-muted mb-1">Политика • Суды</div>
              <h2 className="text-xl lg:text-2xl font-bold text-white leading-tight">
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
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Left Column (Probability, Buttons, News) */}
          <div className="flex-1 flex flex-col w-full lg:w-[45%]">
            
            {/* Probability */}
            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-3xl lg:text-4xl font-bold text-pm-blue">9% вероятность</span>
              <span className="text-pm-red font-medium flex items-center text-sm lg:text-base">
                ▼ 35%
              </span>
            </div>

            {/* Buttons */}
            <div className="flex gap-4 mb-8">
              <button className="flex-1 bg-[#22c55e]/10 text-[#22c55e] hover:bg-[#22c55e]/20 py-3 lg:py-4 rounded-xl font-bold text-lg transition-colors border-none">
                Да
              </button>
              <button className="flex-1 bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20 py-3 lg:py-4 rounded-xl font-bold text-lg transition-colors border-none">
                Нет
              </button>
            </div>

            {/* News items (The "three initial elements") */}
            <div 
              className="flex-1 overflow-hidden relative h-[180px] mb-8"
              style={{ WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)', maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)' }}
            >
              <motion.div
                animate={{ y: ["-50%", "0%"] }}
                transition={{ duration: 15, ease: "linear", repeat: Infinity }}
                className="flex flex-col gap-5 pt-2"
              >
                {[...Array(2)].map((_, arrayIndex) => (
                  <div key={arrayIndex} className="flex flex-col gap-5">
                    <a href="#" className="group block cursor-pointer">
                      <div className="flex items-center gap-2 text-xs text-pm-text-muted mb-1.5">
                        <span className="flex items-center justify-center font-bold text-pm-text bg-white/10 rounded-[3px] h-[16px] px-1.5 text-[10px]">AP</span>
                        <span className="leading-[16px]">AP News • 2д назад</span>
                      </div>
                      <p className="text-sm text-pm-text group-hover:text-white transition-colors leading-snug">
                        Ex-FBI Director Comey indicted again, in a probe over an online post officials call a Trump threat
                      </p>
                    </a>
                    
                    <a href="#" className="group block cursor-pointer">
                      <div className="flex items-center gap-2 text-xs text-pm-text-muted mb-1.5">
                        <span className="flex items-center justify-center font-serif font-bold text-pm-text bg-white/10 rounded-[3px] h-[16px] px-1.5 text-[10px] italic">wp</span>
                        <span className="leading-[16px]">The Washington Post • 2д назад</span>
                      </div>
                      <p className="text-sm text-pm-text group-hover:text-white transition-colors leading-snug">
                        Former Fauci aide charged in alleged effort to thwart pandemic inquiries
                      </p>
                    </a>

                    <a href="#" className="group block cursor-pointer">
                      <div className="flex items-center gap-2 text-xs text-pm-text-muted mb-1.5">
                        <span className="flex items-center justify-center font-bold text-pm-text bg-white/10 rounded-[3px] h-[16px] px-1.5 text-[10px] tracking-wider">BBC</span>
                        <span className="leading-[16px]">BBC • 2д назад</span>
                      </div>
                      <p className="text-sm text-pm-text group-hover:text-white transition-colors leading-snug">
                        Former FBI director James Comey charged with threatening Trump's life in Instagram post
                      </p>
                    </a>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Footer Left */}
            <div className="text-xs font-medium text-pm-text-muted mt-auto pt-2">
              $94.6K Объём
            </div>
          </div>

          {/* Right Column (Chart) */}
          <div className="flex-1 right-chart-col w-full lg:w-[55%] flex flex-col relative min-h-[300px]">
            {/* Chart */}
            <div className="flex-1 w-full relative mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockChartData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
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
                    type="stepAfter" 
                    dataKey="val" 
                    stroke="#2563eb" 
                    strokeWidth={2} 
                    dot={false} 
                    isAnimationActive={false} 
                  />
                </LineChart>
              </ResponsiveContainer>
              {/* Optional current value marker point */}
              <div className="absolute right-[40px] top-[76%] w-2.5 h-2.5 bg-pm-blue rounded-full border-2 border-pm-surface"></div>
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
      <div className="flex items-center justify-between px-2">
        {/* Dots */}
        <div className="flex items-center gap-1.5">
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
          <button className="flex items-center gap-1 px-4 py-2 rounded-full bg-pm-surface hover:bg-pm-surface-hover text-sm font-medium text-pm-text transition-colors border border-pm-border">
            <ChevronLeft className="w-4 h-4" /> BTC 5min Up or Down
          </button>
          <button className="flex items-center gap-1 px-4 py-2 rounded-full bg-pm-surface hover:bg-pm-surface-hover text-sm font-medium text-pm-text transition-colors border border-pm-border">
            Peace Deal <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
