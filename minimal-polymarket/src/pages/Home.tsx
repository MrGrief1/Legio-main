import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, PlusCircle, X } from 'lucide-react';
import { motion } from 'motion/react';
import { MarketCard } from '../components/MarketCard';
import { Sidebar } from '../components/Sidebar';
import { FeaturedMarket } from '../components/FeaturedMarket';
import { api, ApiError, type Market } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ALL_CATEGORY, useI18n } from '../lib/i18n';
import { formatPoints } from '../lib/format';

function categoryIcon(category: string) {
  const normalized = category.toLowerCase();

  if (normalized.includes('крипто') || normalized.includes('bitcoin') || normalized.includes('btc')) return '₿';
  if (normalized.includes('спорт')) return '🏟';
  if (normalized.includes('sport')) return '🏟';
  if (normalized.includes('полит')) return '◎';
  if (normalized.includes('polit')) return '◎';
  if (normalized.includes('финанс')) return '$';
  if (normalized.includes('finance')) return '$';
  if (normalized.includes('тех')) return '⌘';
  if (normalized.includes('tech')) return '⌘';

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
  const { t, locale, categoryLabel } = useI18n();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const query = searchParams.get('q') ?? '';
  const activeCategory = searchParams.get('category') ?? ALL_CATEGORY;
  const sort = searchParams.get('sort') ?? 'trending';
  const status = searchParams.get('status') ?? 'all';

  useEffect(() => {
    let ignore = false;

    api.listMarkets()
      .then(({ markets: nextMarkets }) => {
        if (!ignore) setMarkets(nextMarkets);
      })
      .catch((requestError) => {
        if (!ignore) {
          setError(requestError instanceof ApiError ? requestError.message : t('home.loadError'));
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

    if (categoryFromUrl && categoryFromUrl !== ALL_CATEGORY && !uniqueCategories.includes(categoryFromUrl)) {
      return [ALL_CATEGORY, categoryFromUrl, ...uniqueCategories];
    }

    return [ALL_CATEGORY, ...uniqueCategories];
  }, [markets, searchParams]);

  const updateSearchParam = (key: 'q' | 'category', value: string, replace = true) => {
    const nextParams = new URLSearchParams(searchParams);
    const trimmedValue = value.trim();

    if (!trimmedValue || trimmedValue === ALL_CATEGORY) {
      nextParams.delete(key);
    } else {
      nextParams.set(key, value);
    }

    setSearchParams(nextParams, { replace });
  };

  const setParam = (key: string, value: string, defaultValue: string) => {
    const nextParams = new URLSearchParams(searchParams);

    if (!value || value === defaultValue) {
      nextParams.delete(key);
    } else {
      nextParams.set(key, value);
    }

    setSearchParams(nextParams, { replace: true });
  };

  const isFiltering = query.trim().length > 0
    || activeCategory !== ALL_CATEGORY
    || status !== 'all'
    || sort !== 'trending';

  const filteredMarkets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const matched = markets.filter((market) => {
      const matchesCategory = activeCategory === ALL_CATEGORY || market.category === activeCategory;
      const matchesQuery = !normalizedQuery
        || market.title.toLowerCase().includes(normalizedQuery)
        || market.description.toLowerCase().includes(normalizedQuery)
        || market.category.toLowerCase().includes(normalizedQuery)
        || categoryLabel(market.category).toLowerCase().includes(normalizedQuery);
      const matchesStatus = status === 'all'
        || (status === 'open' && market.status === 'open')
        || (status === 'resolved' && (market.status === 'resolved' || market.status === 'canceled'));

      return matchesCategory && matchesQuery && matchesStatus;
    });

    const sorted = [...matched];
    const time = (value: string) => new Date(value).getTime();

    if (sort === 'new') {
      sorted.sort((left, right) => time(right.createdAt) - time(left.createdAt));
    } else if (sort === 'ending') {
      // Soonest close first, but keep already-closed markets at the bottom.
      const closeKey = (market: Market) => (market.status === 'open' ? time(market.closeDate) : Number.MAX_SAFE_INTEGER);
      sorted.sort((left, right) => closeKey(left) - closeKey(right));
    } else if (sort === 'competitive') {
      sorted.sort((left, right) => Math.abs(left.yesPercent - 50) - Math.abs(right.yesPercent - 50));
    } else {
      sorted.sort((left, right) => right.volume - left.volume); // trending = volume desc
    }

    return sorted;
  }, [activeCategory, categoryLabel, markets, query, status, sort]);

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
            {isFiltering ? t('home.results') : t('home.allMarkets')}
          </h1>
          <p className="mt-1 text-sm font-medium text-pm-text-muted">
            {isLoading
              ? t('common.loading')
              : isFiltering
                ? t('home.filteredCount', { filtered: filteredMarkets.length, total: markets.length })
                : t('home.totalCount', { count: markets.length })}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="flex h-10 min-w-0 items-center rounded-full border border-pm-border bg-pm-surface px-3 sm:w-[260px]">
            <Search className="mr-2 h-4 w-4 shrink-0 text-pm-text-muted" />
            <input
              value={query}
              onChange={(event) => updateSearchParam('q', event.target.value)}
              type="search"
              aria-label={t('common.searchMarkets')}
              placeholder={t('home.searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-pm-text-strong outline-none placeholder:text-pm-text-muted"
            />
            {query && (
              <button
                type="button"
                onClick={() => updateSearchParam('q', '')}
                className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-pm-text-muted transition-colors hover:bg-pm-surface-hover hover:text-pm-text-strong"
                aria-label={t('common.clearSearch')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={sort}
              onChange={(event) => setParam('sort', event.target.value, 'trending')}
              aria-label={t('common.filters')}
              className="h-10 flex-1 cursor-pointer rounded-full border border-pm-border bg-pm-surface px-3 text-sm font-semibold text-pm-text-strong outline-none transition-colors hover:bg-pm-surface-hover sm:flex-none"
            >
              <option value="trending">{t('home.sortTrending')}</option>
              <option value="new">{t('home.sortNew')}</option>
              <option value="ending">{t('home.sortEnding')}</option>
              <option value="competitive">{t('home.sortCompetitive')}</option>
            </select>
            <select
              value={status}
              onChange={(event) => setParam('status', event.target.value, 'all')}
              aria-label={t('common.filters')}
              className="h-10 flex-1 cursor-pointer rounded-full border border-pm-border bg-pm-surface px-3 text-sm font-semibold text-pm-text-strong outline-none transition-colors hover:bg-pm-surface-hover sm:flex-none"
            >
              <option value="all">{t('home.statusAll')}</option>
              <option value="open">{t('home.statusOpen')}</option>
              <option value="resolved">{t('home.statusResolved')}</option>
            </select>
            {user?.isAdmin && (
              <Link
                to="/create"
                className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-pm-blue px-4 text-sm font-bold text-white transition-colors hover:bg-blue-700"
              >
                <PlusCircle className="h-4 w-4" />
                <span className="hidden sm:inline">{t('common.create')}</span>
              </Link>
            )}
          </div>
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
            {categoryLabel(category)}
          </button>
        ))}
      </motion.div>

      {error && (
        <div className="mb-5 rounded-[24px] border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-3 text-sm font-semibold text-pm-red">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[188px] animate-pulse rounded-[24px] border border-pm-border bg-pm-surface" />
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
                volume={formatPoints(market.volume, locale, { compact: true })}
                status={market.tradeCount > 0 ? 'active' : 'new'}
                category={categoryLabel(market.category)}
                yesPercent={market.yesPercent}
                noPercent={market.noPercent}
                tradeCount={market.tradeCount}
              />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="rounded-[28px] border border-dashed border-pm-border bg-pm-surface p-8 text-center">
          <h2 className="text-xl font-bold text-pm-text-strong">{t('home.noResultsTitle')}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-pm-text-muted">
            {user?.isAdmin
              ? t('home.noResultsAdmin')
              : t('home.noResultsUser')}
          </p>
          {user?.isAdmin && (
            <Link
              to="/create"
              className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-pm-blue px-5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
            >
              {t('common.createMarket')}
            </Link>
          )}
        </div>
      )}
    </motion.div>
  );
}
