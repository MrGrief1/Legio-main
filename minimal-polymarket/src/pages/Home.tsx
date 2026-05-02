import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, PlusCircle, X } from 'lucide-react';
import { motion } from 'motion/react';
import { MarketCard } from '../components/MarketCard';
import { Sidebar } from '../components/Sidebar';
import { FeaturedMarket } from '../components/FeaturedMarket';
import { api, ApiError, type Market } from '../lib/api';
import { useAuth } from '../lib/auth';

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
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

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export function Home() {
  const { user } = useAuth();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const query = searchParams.get('q') ?? '';
  const activeCategory = searchParams.get('category') ?? 'Все';

  useEffect(() => {
    let ignore = false;

    api.listMarkets()
      .then(({ markets: nextMarkets }) => {
        if (!ignore) setMarkets(nextMarkets);
      })
      .catch((requestError) => {
        if (!ignore) {
          setError(requestError instanceof ApiError ? requestError.message : 'Не удалось загрузить рынки.');
        }
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const categories = useMemo(() => {
    const uniqueCategories = Array.from(new Set(markets.map((market) => market.category))).filter(Boolean);
    const categoryFromUrl = searchParams.get('category');

    if (categoryFromUrl && categoryFromUrl !== 'Все' && !uniqueCategories.includes(categoryFromUrl)) {
      return ['Все', categoryFromUrl, ...uniqueCategories];
    }

    return ['Все', ...uniqueCategories];
  }, [markets, searchParams]);

  const updateSearchParam = (key: 'q' | 'category', value: string, replace = true) => {
    const nextParams = new URLSearchParams(searchParams);
    const trimmedValue = value.trim();

    if (!trimmedValue || trimmedValue === 'Все') {
      nextParams.delete(key);
    } else {
      nextParams.set(key, value);
    }

    setSearchParams(nextParams, { replace });
  };

  const isFiltering = query.trim().length > 0 || activeCategory !== 'Все';

  const filteredMarkets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return markets.filter((market) => {
      const matchesCategory = activeCategory === 'Все' || market.category === activeCategory;
      const matchesQuery = !normalizedQuery
        || market.title.toLowerCase().includes(normalizedQuery)
        || market.description.toLowerCase().includes(normalizedQuery)
        || market.category.toLowerCase().includes(normalizedQuery);

      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, markets, query]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto max-w-[1400px] px-3 py-3 sm:px-6 sm:py-5"
    >
      {!isFiltering && (
        <div className="mb-5 grid grid-cols-1 gap-5 lg:mb-6 lg:grid-cols-3 lg:gap-6">
          <div className="lg:col-span-2">
            <FeaturedMarket market={markets[0]} />
          </div>
          <div className="hidden h-full lg:col-span-1 lg:block">
            <Sidebar markets={markets} />
          </div>
        </div>
      )}

      {!isFiltering && <div className="mb-5 h-px w-full bg-pm-border" />}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center"
      >
        <div>
          <h1 className="text-2xl font-semibold text-pm-text-strong">
            {isFiltering ? 'Результаты' : 'Все рынки'}
          </h1>
          <p className="mt-1 text-sm font-medium text-pm-text-muted">
            {isLoading
              ? 'Загружаю...'
              : isFiltering
                ? `${filteredMarkets.length} из ${markets.length} рынков`
                : `${markets.length} реальных постов-рынков`}
          </p>
        </div>

        <div className="grid w-full grid-cols-[minmax(0,1fr)_40px] gap-2 sm:w-auto sm:flex sm:items-center">
          <div className="flex h-10 min-w-0 items-center rounded-lg border border-pm-border bg-pm-surface px-3 md:w-[320px]">
            <Search className="mr-2 h-4 w-4 shrink-0 text-pm-text-muted" />
            <input
              value={query}
              onChange={(event) => updateSearchParam('q', event.target.value)}
              type="search"
              aria-label="Поиск рынков"
              placeholder="Поиск"
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-pm-text-strong outline-none placeholder:text-pm-text-muted"
            />
            {query && (
              <button
                type="button"
                onClick={() => updateSearchParam('q', '')}
                className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-pm-text-muted transition-colors hover:bg-pm-surface-hover hover:text-pm-text-strong"
                aria-label="Очистить поиск"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent bg-pm-surface text-pm-text transition-colors hover:bg-pm-surface-hover hover:text-pm-text-strong"
            aria-label="Фильтры"
          >
            <SlidersHorizontal className="h-5 w-5" />
          </motion.button>
          {user?.isAdmin && (
            <Link
              to="/create"
              className="col-span-2 flex h-10 items-center justify-center gap-2 rounded-lg bg-pm-blue px-4 text-sm font-bold text-white transition-colors hover:bg-blue-700 sm:col-span-1"
            >
              <PlusCircle className="h-4 w-4" />
              Создать
            </Link>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="no-scrollbar mb-6 flex items-center gap-2 overflow-x-auto pb-2"
      >
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => updateSearchParam('category', category, false)}
            className={
              category === activeCategory
                ? 'whitespace-nowrap rounded-full border border-[rgba(37,99,235,0.2)] bg-[rgba(37,99,235,0.15)] px-4 py-1.5 text-sm font-medium text-pm-blue'
                : 'whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium text-pm-text transition-colors hover:bg-pm-surface hover:text-pm-text-strong'
            }
          >
            {category}
          </button>
        ))}
      </motion.div>

      {error && (
        <div className="mb-5 rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-3 text-sm font-semibold text-pm-red">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[188px] animate-pulse rounded-xl border border-pm-border bg-pm-surface" />
          ))}
        </div>
      ) : filteredMarkets.length > 0 ? (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {filteredMarkets.map((market) => (
            <motion.div key={market.id} variants={itemVariants} className="h-full">
              <MarketCard
                id={market.id}
                title={market.title}
                icon={categoryIcon(market.category)}
                volume={formatMoney(market.volume)}
                status={market.tradeCount > 0 ? 'active' : 'new'}
                category={market.category}
                yesPercent={market.yesPercent}
                noPercent={market.noPercent}
                tradeCount={market.tradeCount}
              />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="rounded-2xl border border-dashed border-pm-border bg-pm-surface p-8 text-center">
          <h2 className="text-xl font-bold text-pm-text-strong">Ничего не найдено</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-pm-text-muted">
            {user?.isAdmin
              ? 'Здесь больше нет фейковых карточек: создай первый рынок или измени фильтр.'
              : 'Здесь появятся рынки, опубликованные администраторами.'}
          </p>
          {user?.isAdmin && (
            <Link
              to="/create"
              className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-pm-blue px-5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
            >
              Создать рынок
            </Link>
          )}
        </div>
      )}
    </motion.div>
  );
}
