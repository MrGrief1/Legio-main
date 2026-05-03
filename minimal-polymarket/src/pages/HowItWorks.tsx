import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Gauge,
  HandCoins,
  LineChart,
  Search,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';

const steps = [
  {
    icon: ClipboardList,
    titleKey: 'how.step1Title',
    textKey: 'how.step1Text',
  },
  {
    icon: HandCoins,
    titleKey: 'how.step2Title',
    textKey: 'how.step2Text',
  },
  {
    icon: LineChart,
    titleKey: 'how.step3Title',
    textKey: 'how.step3Text',
  },
  {
    icon: CheckCircle2,
    titleKey: 'how.step4Title',
    textKey: 'how.step4Text',
  },
];

const highlights = [
  { labelKey: 'common.yes', value: '64¢', width: '64%', className: 'bg-pm-green' },
  { labelKey: 'common.no', value: '36¢', width: '36%', className: 'bg-pm-red' },
];

const checklist = ['how.check1', 'how.check2', 'how.check3'];

export function HowItWorks() {
  const { user } = useAuth();
  const { t } = useI18n();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto max-w-[1180px] px-3 py-5 sm:px-6 sm:py-8"
    >
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-stretch">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32 }}
          className="flex min-h-[360px] flex-col justify-between rounded-[28px] border border-pm-border bg-pm-surface p-5 shadow-[0_1px_2px_var(--color-pm-card-shadow)] sm:p-7"
        >
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-pm-border bg-pm-bg px-3 py-1.5 text-sm font-semibold text-pm-text-muted">
              <Gauge className="h-4 w-4 text-pm-blue" />
              {t('how.badge')}
            </div>
            <h1 className="max-w-3xl text-3xl font-bold leading-tight text-pm-text-strong sm:text-5xl">
              {t('how.title')}
            </h1>
            <p className="mt-5 max-w-2xl text-base font-medium leading-7 text-pm-text-muted sm:text-lg">
              {t('how.subtitle')}
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-pm-blue px-5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
            >
              {t('how.viewMarkets')}
              <ArrowRight className="h-4 w-4" />
            </Link>
            {user?.isAdmin && (
              <Link
                to="/create"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-pm-border px-5 text-sm font-bold text-pm-text-strong transition-colors hover:bg-pm-surface-hover"
              >
                {t('common.createMarket')}
              </Link>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.06 }}
          className="flex min-h-[360px] flex-col rounded-[28px] border border-pm-border bg-pm-surface p-5 shadow-[0_1px_2px_var(--color-pm-card-shadow)] sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-pm-text-muted">{t('how.exampleMarket')}</p>
              <h2 className="mt-1 text-xl font-bold leading-snug text-pm-text-strong">
                {t('how.exampleTitle')}
              </h2>
            </div>
            <ShieldCheck className="h-8 w-8 shrink-0 text-pm-green" />
          </div>

          <div className="mt-8 space-y-5">
            {highlights.map((item) => (
              <div key={item.labelKey}>
                <div className="mb-2 flex items-center justify-between text-sm font-bold">
                  <span className="text-pm-text-strong">{t(item.labelKey)}</span>
                  <span className="text-pm-text-muted">{item.value}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-pm-bg">
                  <div className={`h-full rounded-full ${item.className}`} style={{ width: item.width }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 grid grid-cols-3 gap-2">
            <div className="rounded-[18px] bg-pm-bg p-3">
              <div className="text-xs font-semibold text-pm-text-muted">{t('common.volume')}</div>
              <div className="mt-1 text-lg font-bold text-pm-text-strong">$12.4K</div>
            </div>
            <div className="rounded-[18px] bg-pm-bg p-3">
              <div className="text-xs font-semibold text-pm-text-muted">{t('admin.statTrades')}</div>
              <div className="mt-1 text-lg font-bold text-pm-text-strong">128</div>
            </div>
            <div className="rounded-[18px] bg-pm-bg p-3">
              <div className="text-xs font-semibold text-pm-text-muted">{t('how.status')}</div>
              <div className="mt-1 text-lg font-bold text-pm-green">{t('how.open')}</div>
            </div>
          </div>

          <div className="mt-auto pt-8">
            <div className="flex items-center gap-2 rounded-[18px] border border-pm-border bg-pm-bg px-3 py-2 text-sm font-semibold text-pm-text-muted">
              <Search className="h-4 w-4 text-pm-blue" />
              {t('how.priceUpdated')}
            </div>
          </div>
        </motion.div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => {
          const StepIcon = step.icon;

          return (
            <motion.div
              key={step.titleKey}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.08 + index * 0.04 }}
              className="rounded-[24px] border border-pm-border bg-pm-surface p-4 shadow-[0_1px_2px_var(--color-pm-card-shadow)]"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-pm-bg text-pm-blue">
                <StepIcon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-pm-text-strong">{t(step.titleKey)}</h3>
              <p className="mt-2 text-sm leading-6 text-pm-text-muted">{t(step.textKey)}</p>
            </motion.div>
          );
        })}
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-[24px] border border-pm-border bg-pm-surface p-5 shadow-[0_1px_2px_var(--color-pm-card-shadow)] sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <WalletCards className="h-6 w-6 text-pm-blue" />
            <h2 className="text-xl font-bold text-pm-text-strong">{t('how.priceMeaningTitle')}</h2>
          </div>
          <p className="text-sm leading-6 text-pm-text-muted">
            {t('how.priceMeaningText')}
          </p>
        </div>

        <div className="rounded-[24px] border border-pm-border bg-pm-surface p-5 shadow-[0_1px_2px_var(--color-pm-card-shadow)] sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-pm-green" />
            <h2 className="text-xl font-bold text-pm-text-strong">{t('how.watchTitle')}</h2>
          </div>
          <div className="space-y-3">
            {checklist.map((itemKey) => (
              <div key={itemKey} className="flex gap-3 text-sm leading-6 text-pm-text-muted">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-pm-green" />
                <span>{t(itemKey)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </motion.div>
  );
}
