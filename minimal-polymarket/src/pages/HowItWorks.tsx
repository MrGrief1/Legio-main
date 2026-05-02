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

const steps = [
  {
    icon: ClipboardList,
    title: 'Рынок задаёт вопрос',
    text: 'Администратор публикует событие, дату закрытия, источник результата и правила разрешения.',
  },
  {
    icon: HandCoins,
    title: 'Участники выбирают сторону',
    text: 'Покупка «Да» или «Нет» меняет цену долей. Чем выше цена, тем сильнее рынок верит в исход.',
  },
  {
    icon: LineChart,
    title: 'Цена двигается от сделок',
    text: 'Каждая сделка обновляет вероятность, объём, историю и текущие котировки на странице рынка.',
  },
  {
    icon: CheckCircle2,
    title: 'После закрытия итог фиксируется',
    text: 'Когда появляется подтверждение из указанного источника, рынок получает финальный статус.',
  },
];

const highlights = [
  { label: 'Да', value: '64¢', width: '64%', className: 'bg-pm-green' },
  { label: 'Нет', value: '36¢', width: '36%', className: 'bg-pm-red' },
];

const checklist = [
  'Смотри формулировку вопроса и дату закрытия перед сделкой.',
  'Проверяй источник результата: именно он определяет финальное решение.',
  'Учитывай, что цена показывает ожидание участников, а не гарантию исхода.',
];

export function HowItWorks() {
  const { user } = useAuth();

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
          className="flex min-h-[360px] flex-col justify-between rounded-xl border border-pm-border bg-pm-surface p-5 shadow-[0_1px_2px_var(--color-pm-card-shadow)] sm:p-7"
        >
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-pm-border bg-pm-bg px-3 py-1.5 text-sm font-semibold text-pm-text-muted">
              <Gauge className="h-4 w-4 text-pm-blue" />
              Рынки прогнозов
            </div>
            <h1 className="max-w-3xl text-3xl font-bold leading-tight text-pm-text-strong sm:text-5xl">
              Как работает Legio
            </h1>
            <p className="mt-5 max-w-2xl text-base font-medium leading-7 text-pm-text-muted sm:text-lg">
              Legio превращает вопрос о будущем событии в рынок. Участники покупают доли «Да» или «Нет», а цена показывает текущую оценку вероятности.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-pm-blue px-5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
            >
              Смотреть рынки
              <ArrowRight className="h-4 w-4" />
            </Link>
            {user?.isAdmin && (
              <Link
                to="/create"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-pm-border px-5 text-sm font-bold text-pm-text-strong transition-colors hover:bg-pm-surface-hover"
              >
                Создать рынок
              </Link>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.06 }}
          className="flex min-h-[360px] flex-col rounded-xl border border-pm-border bg-pm-surface p-5 shadow-[0_1px_2px_var(--color-pm-card-shadow)] sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-pm-text-muted">Пример рынка</p>
              <h2 className="mt-1 text-xl font-bold leading-snug text-pm-text-strong">
                Будет ли событие выполнено до дедлайна?
              </h2>
            </div>
            <ShieldCheck className="h-8 w-8 shrink-0 text-pm-green" />
          </div>

          <div className="mt-8 space-y-5">
            {highlights.map((item) => (
              <div key={item.label}>
                <div className="mb-2 flex items-center justify-between text-sm font-bold">
                  <span className="text-pm-text-strong">{item.label}</span>
                  <span className="text-pm-text-muted">{item.value}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-pm-bg">
                  <div className={`h-full rounded-full ${item.className}`} style={{ width: item.width }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-pm-bg p-3">
              <div className="text-xs font-semibold text-pm-text-muted">Объём</div>
              <div className="mt-1 text-lg font-bold text-pm-text-strong">$12.4K</div>
            </div>
            <div className="rounded-lg bg-pm-bg p-3">
              <div className="text-xs font-semibold text-pm-text-muted">Сделки</div>
              <div className="mt-1 text-lg font-bold text-pm-text-strong">128</div>
            </div>
            <div className="rounded-lg bg-pm-bg p-3">
              <div className="text-xs font-semibold text-pm-text-muted">Статус</div>
              <div className="mt-1 text-lg font-bold text-pm-green">Открыт</div>
            </div>
          </div>

          <div className="mt-auto pt-8">
            <div className="flex items-center gap-2 rounded-lg border border-pm-border bg-pm-bg px-3 py-2 text-sm font-semibold text-pm-text-muted">
              <Search className="h-4 w-4 text-pm-blue" />
              Цена рынка обновляется после сделок
            </div>
          </div>
        </motion.div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => {
          const StepIcon = step.icon;

          return (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.08 + index * 0.04 }}
              className="rounded-xl border border-pm-border bg-pm-surface p-4 shadow-[0_1px_2px_var(--color-pm-card-shadow)]"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-pm-bg text-pm-blue">
                <StepIcon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-pm-text-strong">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-pm-text-muted">{step.text}</p>
            </motion.div>
          );
        })}
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-pm-border bg-pm-surface p-5 shadow-[0_1px_2px_var(--color-pm-card-shadow)] sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <WalletCards className="h-6 w-6 text-pm-blue" />
            <h2 className="text-xl font-bold text-pm-text-strong">Что означает цена</h2>
          </div>
          <p className="text-sm leading-6 text-pm-text-muted">
            Цена 64¢ у стороны «Да» означает, что рынок оценивает исход примерно в 64%. Если итог действительно «Да», доля этой стороны становится выигрышной; если нет, выигрывает противоположная сторона.
          </p>
        </div>

        <div className="rounded-xl border border-pm-border bg-pm-surface p-5 shadow-[0_1px_2px_var(--color-pm-card-shadow)] sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-pm-green" />
            <h2 className="text-xl font-bold text-pm-text-strong">На что смотреть</h2>
          </div>
          <div className="space-y-3">
            {checklist.map((item) => (
              <div key={item} className="flex gap-3 text-sm leading-6 text-pm-text-muted">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-pm-green" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </motion.div>
  );
}
