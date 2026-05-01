import { ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';

export function Sidebar() {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="flex h-full flex-col"
    >
      {/* Breaking News */}
      <div>
        <h3 className="mb-2 flex items-center gap-1 text-base font-medium leading-none text-white cursor-pointer hover:text-pm-blue transition-colors">
          Срочные новости <ChevronRight className="w-4 h-4" />
        </h3>
        <div className="space-y-0.5">
          {[
            { title: 'Более $3 млн привлечено в публичной продаже Printr?', percent: '1%', trend: 'down', trendVal: '99%' },
            { title: 'Gensyn FDV выше $400M через день после запуска?', percent: '41%', trend: 'down', trendVal: '30%' },
            { title: 'Будет ли Alphabet крупнейшей компанией в мире по рыночной...', percent: '30%', trend: 'up', trendVal: '25%' },
          ].map((news, i) => (
            <motion.div 
              key={i}
              whileHover={{ scale: 1.02 }}
              className="flex gap-2 rounded-lg p-1.5 hover:bg-pm-surface transition-colors cursor-pointer group"
            >
              <span className="text-pm-text-muted text-xs font-mono">{i + 1}</span>
              <div className="flex-1">
                <p className="text-[13px] text-pm-text group-hover:text-white leading-tight">{news.title}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-white leading-tight">{news.percent}</div>
                <div className={`text-[11px] font-medium flex items-center justify-end gap-0.5 ${news.trend === 'up' ? 'text-pm-green' : 'text-pm-red'}`}>
                  {news.trend === 'up' ? "↗" : "↘"} {news.trendVal}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="my-4 h-px w-full bg-pm-border"></div>

      {/* Hot Topics */}
      <div className="flex flex-1 flex-col">
        <h3 className="mb-2 flex items-center gap-1 text-base font-medium leading-none text-white cursor-pointer hover:text-pm-blue transition-colors">
          Горячие темы <ChevronRight className="w-4 h-4" />
        </h3>
        <div className="space-y-0.5">
          {[
            { title: 'Mega', vol: '$11M сегодня' },
            { title: 'Maine', vol: '$121K сегодня' },
            { title: 'Lakers', vol: '$8M сегодня' },
            { title: 'Rocha', vol: '$686K сегодня' },
            { title: 'Mexico', vol: '$29M сегодня' },
          ].map((topic, i) => (
            <motion.div 
              key={i}
              whileHover={{ scale: 1.02 }}
              className="flex gap-2 rounded-lg p-1.5 hover:bg-pm-surface transition-colors cursor-pointer group items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span className="text-pm-text-muted text-xs font-mono">{i + 1}</span>
                <span className="text-[13px] text-pm-text group-hover:text-white font-medium">{topic.title}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-pm-text-muted">
                {topic.vol}
                <span className="text-pm-red">🔥</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </motion.div>
          ))}
        </div>
        
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="mt-auto w-full rounded-full border border-pm-border py-2 text-sm font-medium text-white transition-colors hover:bg-pm-surface"
        >
           Смотреть все
        </motion.button>
      </div>
    </motion.div>
  );
}
