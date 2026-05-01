import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import type { Market } from '../lib/api';

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function MarketRow({ market, index }: { market: Market; index: number }) {
  return (
    <Link
      to={`/market/${market.id}`}
      className="flex gap-2 rounded-lg p-1.5 transition-colors hover:bg-pm-surface group"
    >
      <span className="text-xs font-mono text-pm-text-muted">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] leading-tight text-pm-text group-hover:text-pm-text-strong">{market.title}</p>
        <div className="mt-1 text-[11px] font-semibold text-pm-text-muted">{formatMoney(market.volume)} объём</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold leading-tight text-pm-text-strong">{market.yesPercent}%</div>
        <div className="text-[11px] font-medium text-pm-green">Да</div>
      </div>
    </Link>
  );
}

export function Sidebar({ markets = [] }: { markets?: Market[] }) {
  const activeMarkets = markets
    .filter((market) => market.status === 'open')
    .sort((left, right) => right.volume - left.volume)
    .slice(0, 3);
  const newMarkets = [...markets]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: 0.1 }}
      className="flex h-full flex-col"
    >
      <div>
        <h3 className="mb-2 flex items-center gap-1 text-base font-medium leading-none text-pm-text-strong">
          Активные рынки <ChevronRight className="h-4 w-4" />
        </h3>
        <div className="space-y-0.5">
          {activeMarkets.length > 0 ? (
            activeMarkets.map((market, index) => (
              <div key={market.id}>
                <MarketRow market={market} index={index} />
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-pm-border bg-pm-surface p-3 text-sm leading-6 text-pm-text-muted">
              Сделок пока нет.
            </div>
          )}
        </div>
      </div>

      <div className="my-4 h-px w-full bg-pm-border" />

      <div className="flex flex-1 flex-col">
        <h3 className="mb-2 flex items-center gap-1 text-base font-medium leading-none text-pm-text-strong">
          Новые посты <ChevronRight className="h-4 w-4" />
        </h3>
        <div className="space-y-0.5">
          {newMarkets.length > 0 ? (
            newMarkets.map((market, index) => (
              <div key={market.id}>
                <MarketRow market={market} index={index} />
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-pm-border bg-pm-surface p-3 text-sm leading-6 text-pm-text-muted">
              Созданные рынки появятся здесь.
            </div>
          )}
        </div>

        <Link
          to="/create"
          className="mt-auto flex w-full items-center justify-center rounded-full border border-pm-border py-2 text-sm font-medium text-pm-text-strong transition-colors hover:bg-pm-surface"
        >
          Создать рынок
        </Link>
      </div>
    </motion.div>
  );
}
