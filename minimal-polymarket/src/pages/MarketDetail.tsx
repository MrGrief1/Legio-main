import { useParams, Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Link as LinkIcon, Bookmark, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { Sidebar } from '../components/Sidebar';

const mockChartData = Array.from({ length: 30 }, (_, i) => ({
  time: `Apr ${i + 1}`,
  yes: Math.floor(Math.random() * 40) + 60, // 60-100
  no: Math.floor(Math.random() * 30) + 10,  // 10-40
}));

export function MarketDetail() {
  const { id } = useParams();

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 sm:py-8"
    >
      {/* Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column (Chart & Main Info) */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="lg:col-span-2 space-y-6"
        >
          <div className="bg-pm-surface border border-pm-border rounded-2xl p-6">
            
            {/* Header info */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex gap-4 items-start">
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="w-12 h-12 rounded-xl bg-pm-bg flex items-center justify-center text-3xl shrink-0"
                >
                  💧
                </motion.div>
                <div>
                  <div className="flex justify-between items-center w-full">
                    <div className="text-sm text-pm-text-muted flex items-center gap-2 mb-1">
                      Финансы <span className="text-[10px]">●</span> Ежемесячно
                    </div>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-semibold text-white leading-tight">
                    Что произойдет с сырой нефтью WTI (WTI) в мае 2026...
                  </h1>
                </div>
              </div>
              
              <div className="flex gap-2 shrink-0">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-10 h-10 rounded-lg hover:bg-pm-surface-hover flex items-center justify-center text-pm-text hover:text-white transition-colors">
                  <LinkIcon className="w-5 h-5" />
                </motion.button>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-10 h-10 rounded-lg hover:bg-pm-surface-hover flex items-center justify-center text-pm-text hover:text-white transition-colors">
                  <Bookmark className="w-5 h-5" />
                </motion.button>
              </div>
            </div>

            {/* Options List within Chart View */}
            <div className="space-y-3 mb-8">
              {[
                { name: '↑ $100', percent: '98%', color: 'bg-pm-blue' },
                { name: '↑ $90', percent: '99%', color: 'bg-pm-blue' },
                { name: '↓ $80', percent: '32%', color: 'bg-yellow-500' },
                { name: '↓ $70', percent: '11%', color: 'bg-yellow-500' },
              ].map((opt, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  key={i} 
                  className="flex items-center justify-between text-lg group cursor-pointer hover:bg-pm-surface-hover p-2 -mx-2 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3">
                     <span className="text-pm-text group-hover:text-white transition-colors">{opt.name}</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="font-medium text-white">{opt.percent}</span>
                    <div className="hidden sm:flex items-center gap-3 text-sm">
                      <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${opt.color}`}></div><span className="text-pm-text-muted">Да</span></div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Chart */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="h-[300px] sm:h-[400px] w-full mt-4 relative"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockChartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="time" stroke="#2a2b31" tick={{fill: '#8b8f98', fontSize: 12}} dy={10} minTickGap={30} />
                  <YAxis orientation="right" stroke="#2a2b31" tick={{fill: '#8b8f98', fontSize: 12}} tickFormatter={(value) => `${value}%`} dx={10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e1f24', border: '1px solid #2a2b31', borderRadius: '8px', color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Line type="stepAfter" dataKey="yes" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={true} animationDuration={1500} />
                  <Line type="stepAfter" dataKey="no" stroke="#eab308" strokeWidth={2} dot={false} isAnimationActive={true} animationDuration={1500} />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Footer Metadata */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-6 pt-6 border-t border-pm-border gap-4">
               <div className="text-sm text-pm-text-muted flex items-center gap-2">
                 $2M Объём
               </div>
               <div className="flex gap-2">
                  <button className="px-3 py-1.5 rounded bg-pm-bg border border-pm-border text-xs text-pm-text hover:text-white transition-colors">
                    Strait of Hormuz
                  </button>
                  <button className="px-3 py-1.5 rounded bg-pm-bg border border-pm-border text-xs text-pm-text hover:text-white transition-colors flex items-center gap-1">
                    Sports <ChevronRight className="w-3 h-3" />
                  </button>
               </div>
            </div>

          </div>
        </motion.div>

        {/* Right Column (Sidebar) */}
        <Sidebar / >

      </div>
    </motion.div>
  );
}
