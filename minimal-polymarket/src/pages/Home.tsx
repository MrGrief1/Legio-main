import { Search, SlidersHorizontal, Bookmark } from 'lucide-react';
import { motion } from 'motion/react';
import { MarketCard } from '../components/MarketCard';
import { Sidebar } from '../components/Sidebar';
import { FeaturedMarket } from '../components/FeaturedMarket';

const MOCK_MARKETS = [
  {
    id: "1",
    title: "Джеймс Коми был приговорён к тюремному...",
    icon: <img src="https://ui-avatars.com/api/?name=James+Comey&background=random" alt="Comey" className="w-full h-full object-cover" />,
    volume: "$160K",
    status: "new" as const,
    yesPercent: 9,
    noPercent: 91,
    layout: "binary" as const
  },
  {
    id: "2",
    title: "BTC вверх или вниз на 5 м",
    icon: "₿",
    volume: "$2M",
    status: "active" as const,
    category: "Bitcoin",
    yesPercent: 50,
    noPercent: 50,
    layout: "binary" as const
  },
  {
    id: "3",
    title: "Победитель выборов в Законодательное собрание Западной Бенгалии",
    icon: "🇮🇳",
    volume: "$5M",
    layout: "list" as const,
    yesPercent: 0, noPercent: 0, // Ignored in list
    listOptions: [
      { name: "AITC", percent: 51 },
      { name: "БДП", percent: 50 }
    ]
  },
  {
    id: "4",
    title: "Что произойдет с сырой нефтью WTI (WTI) в мае 2026 года?",
    icon: "💧",
    volume: "$2M",
    layout: "list" as const,
    yesPercent: 0, noPercent: 0,
    listOptions: [
      { name: "↑ $90", percent: 99 },
      { name: "↑ $100", percent: 98 }
    ]
  },
  {
    id: "5",
    title: "Постоянное мирное соглашение между США и Ираном от...?",
    icon: "🇮🇷",
    volume: "$71M",
    layout: "list" as const,
    yesPercent: 0, noPercent: 0,
    listOptions: [
      { name: "30 июня", percent: 33 },
      { name: "31 мая", percent: 21 }
    ]
  },
  {
    id: "6",
    title: "Vitality vs G2 - Игра 2 (CS2)",
    icon: "🎮",
    volume: "$1M",
    status: "active" as const,
    category: "CS2",
    layout: "list" as const,
    yesPercent: 0, noPercent: 0,
    listOptions: [
      { name: "Vitality", percent: 90 },
      { name: "G2", percent: 11 }
    ]
  },
  {
    id: "7",
    title: "Fnatic vs Solary - Игра 2 (LoL)",
    icon: "⚔️",
    volume: "$946K",
    status: "active" as const,
    category: "LoL",
    layout: "list" as const,
    yesPercent: 0, noPercent: 0,
    listOptions: [
      { name: "Fnatic", percent: 17 },
      { name: "Solary", percent: 84 }
    ]
  },
  {
    id: "8",
    title: "Когда закончится отключение DHS?",
    icon: "🏢",
    volume: "$2M",
    layout: "list" as const,
    yesPercent: 0, noPercent: 0,
    listOptions: [
      { name: "29-30 апреля", percent: 94 },
      { name: "После 30 апреля", percent: 4 }
    ]
  }
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

export function Home() {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 sm:py-5"
    >
      
      {/* Featured Top Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <FeaturedMarket />
        </div>
        <div className="h-full lg:col-span-1">
          <Sidebar />
        </div>
      </div>

      <div className="h-px bg-pm-border w-full mb-5" />

      {/* Page Header & Filters */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4"
      >
        <h1 className="text-2xl font-semibold text-pm-text-strong">Все рынки</h1>
        
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-10 h-10 flex items-center justify-center rounded-lg bg-pm-surface hover:bg-pm-surface-hover text-pm-text hover:text-pm-text-strong transition-colors border border-pm-border border-transparent">
            <Search className="w-5 h-5" />
          </motion.button>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-10 h-10 flex items-center justify-center rounded-lg bg-pm-surface hover:bg-pm-surface-hover text-pm-text hover:text-pm-text-strong transition-colors border border-pm-border border-transparent">
            <SlidersHorizontal className="w-5 h-5" />
          </motion.button>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-10 h-10 flex items-center justify-center rounded-lg bg-pm-surface hover:bg-pm-surface-hover text-pm-text hover:text-pm-text-strong transition-colors border border-pm-border border-transparent">
            <Bookmark className="w-5 h-5" />
          </motion.button>
        </div>
      </motion.div>

      {/* Tags */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-6 pb-2"
      >
        <button className="px-4 py-1.5 rounded-full bg-[rgba(37,99,235,0.15)] text-pm-blue border border-[rgba(37,99,235,0.2)] text-sm font-medium whitespace-nowrap">
          Все
        </button>
        {["Трамп", "Иран", "Fed", "UCL", "Джеймс Коми", "ОПЕК", "Индийские выборы", "Ормузский пролив", "Маск против Альтмана"].map(tag => (
          <button key={tag} className="px-4 py-1.5 rounded-full hover:bg-pm-surface text-pm-text hover:text-pm-text-strong text-sm font-medium whitespace-nowrap transition-colors">
            {tag}
          </button>
        ))}
      </motion.div>

      {/* Grid */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      >
        {MOCK_MARKETS.map((market) => (
          <motion.div key={market.id} variants={itemVariants} className="h-full">
            <MarketCard {...market} />
          </motion.div>
        ))}
      </motion.div>

      {/* Load More */}
      <motion.div 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="mt-10 flex justify-center"
      >
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-6 py-3 rounded-full bg-pm-surface hover:bg-pm-surface-hover border border-pm-border text-pm-text-strong font-medium transition-colors"
        >
          Показать больше рынков
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
