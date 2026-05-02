import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  FileText,
  Gauge,
  Link2,
  LockKeyhole,
  PlusCircle,
  Scale,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

const categories = ['Общее', 'Политика', 'Криптовалюта', 'Спорт', 'Финансы', 'Геополитика', 'Технологии'];

function toDateTimeLocal(date: Date) {
  const localDate = new Date(date);
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());

  return localDate.toISOString().slice(0, 16);
}

function defaultStartDate() {
  return toDateTimeLocal(new Date(Date.now() + 5 * 60 * 1000));
}

function defaultCloseDate() {
  return toDateTimeLocal(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
}

export function CreateMarket() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [formMessage, setFormMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialProbability, setInitialProbability] = useState(50);
  const [liquidity, setLiquidity] = useState(1000);
  const [category, setCategory] = useState('Общее');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage('');
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const rules = String(formData.get('resolutionRules') || '').trim();

    try {
      const response = await api.createMarket({
        title: String(formData.get('title') || ''),
        description: rules,
        category,
        resolutionSource: String(formData.get('resolutionSource') || ''),
        resolutionRules: rules,
        startDate: new Date(String(formData.get('startDate') || '')).toISOString(),
        closeDate: new Date(String(formData.get('closeDate') || '')).toISOString(),
        liquidity,
        initialProbability,
        tickSize: Number(formData.get('tickSize') || 1),
        minOrderSize: Number(formData.get('minOrderSize') || 1),
      });

      navigate(`/market/${response.market.id}`);
    } catch (error) {
      setFormMessage(error instanceof ApiError ? error.message : 'Не удалось создать рынок.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoading && !user) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-89px)] max-w-[760px] items-center px-4 py-10 sm:px-6">
        <div className="w-full rounded-2xl border border-pm-border bg-pm-surface p-6 shadow-[0_18px_48px_var(--color-pm-card-shadow-strong)]">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-pm-surface-hover text-pm-blue">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-pm-text-strong">Нужен аккаунт</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-pm-text">
            Создавать рынки и торговать долями могут только зарегистрированные пользователи.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/register"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-pm-blue px-5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
            >
              Зарегистрироваться
            </Link>
            <Link
              to="/login"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-pm-border px-5 text-sm font-bold text-pm-text-strong transition-colors hover:bg-pm-surface-hover"
            >
              Войти
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-pm-border bg-pm-surface px-3 py-1.5 text-sm font-semibold text-pm-text">
            <PlusCircle className="h-4 w-4 text-pm-blue" />
            Новый рынок
          </div>
          <h1 className="text-3xl font-bold text-pm-text-strong">Создать prediction market</h1>
        </div>
        <div className="rounded-xl border border-pm-border bg-pm-surface px-4 py-3 text-sm font-semibold text-pm-text-muted">
          Баланс: <span className="text-pm-text-strong">{Math.round(user?.balance ?? 0).toLocaleString('ru-RU')} pts</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-5 rounded-2xl border border-pm-border bg-pm-surface p-5 shadow-[0_18px_48px_var(--color-pm-card-shadow-strong)] sm:p-6">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
              <FileText className="h-4 w-4" />
              Вопрос
            </span>
            <input
              name="title"
              required
              minLength={12}
              maxLength={180}
              placeholder="BTC будет выше $100 000 к 31 декабря 2026?"
              className="h-12 w-full rounded-xl border border-pm-border bg-pm-bg/45 px-4 text-base font-semibold text-pm-text-strong outline-none transition-colors placeholder:text-pm-text-muted focus:border-pm-blue focus:bg-pm-bg"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
                <Tag className="h-4 w-4" />
                Категория
              </span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-12 w-full rounded-xl border border-pm-border bg-pm-bg/45 px-4 text-base font-semibold text-pm-text-strong outline-none transition-colors focus:border-pm-blue focus:bg-pm-bg"
              >
                {categories.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
                <Link2 className="h-4 w-4" />
                Источник резолюции
              </span>
              <input
                name="resolutionSource"
                required
                maxLength={300}
                placeholder="Официальный сайт, API, протокол, oracle"
                className="h-12 w-full rounded-xl border border-pm-border bg-pm-bg/45 px-4 text-base font-semibold text-pm-text-strong outline-none transition-colors placeholder:text-pm-text-muted focus:border-pm-blue focus:bg-pm-bg"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
                <CalendarClock className="h-4 w-4" />
                Запуск
              </span>
              <input
                name="startDate"
                type="datetime-local"
                required
                defaultValue={defaultStartDate()}
                className="h-12 w-full rounded-xl border border-pm-border bg-pm-bg/45 px-4 text-base font-semibold text-pm-text-strong outline-none transition-colors focus:border-pm-blue focus:bg-pm-bg"
              />
            </label>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
                <CalendarClock className="h-4 w-4" />
                Завершение
              </span>
              <input
                name="closeDate"
                type="datetime-local"
                required
                defaultValue={defaultCloseDate()}
                className="h-12 w-full rounded-xl border border-pm-border bg-pm-bg/45 px-4 text-base font-semibold text-pm-text-strong outline-none transition-colors focus:border-pm-blue focus:bg-pm-bg"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
              <Scale className="h-4 w-4" />
              Правила резолюции
            </span>
            <textarea
              name="resolutionRules"
              rows={8}
              required
              minLength={40}
              maxLength={2500}
              placeholder="Рынок закроется как Да, если... Укажи источник, дедлайн, таймзону и спорные случаи."
              className="w-full resize-y rounded-xl border border-pm-border bg-pm-bg/45 px-4 py-3 text-base font-medium leading-7 text-pm-text-strong outline-none transition-colors placeholder:text-pm-text-muted focus:border-pm-blue focus:bg-pm-bg"
            />
          </label>
        </section>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-pm-border bg-pm-surface p-5 shadow-[0_18px_48px_var(--color-pm-card-shadow-strong)]">
            <div className="mb-4 flex items-center gap-2 text-base font-bold text-pm-text-strong">
              <Gauge className="h-5 w-5 text-pm-blue" />
              Рынок
            </div>

            <div className="space-y-5">
              <label className="block">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm font-bold text-pm-text-strong">
                  <span>Стартовая вероятность</span>
                  <span>{initialProbability}% / {100 - initialProbability}%</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={99}
                  value={initialProbability}
                  onChange={(event) => setInitialProbability(Number(event.target.value))}
                  className="w-full accent-pm-blue"
                />
              </label>

              <label className="block">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm font-bold text-pm-text-strong">
                  <span>Виртуальная ликвидность</span>
                  <span>{liquidity.toLocaleString('ru-RU')}</span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={10000}
                  step={100}
                  value={liquidity}
                  onChange={(event) => setLiquidity(Number(event.target.value))}
                  className="w-full accent-pm-blue"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">Tick</span>
                  <select
                    name="tickSize"
                    defaultValue="1"
                    className="h-11 w-full rounded-xl border border-pm-border bg-pm-bg/45 px-3 text-sm font-bold text-pm-text-strong outline-none focus:border-pm-blue"
                  >
                    <option value="1">1¢</option>
                    <option value="0.5">0.5¢</option>
                    <option value="0.1">0.1¢</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">Min order</span>
                  <input
                    name="minOrderSize"
                    type="number"
                    min={1}
                    max={1000}
                    defaultValue={1}
                    className="h-11 w-full rounded-xl border border-pm-border bg-pm-bg/45 px-3 text-sm font-bold text-pm-text-strong outline-none focus:border-pm-blue"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-pm-border bg-pm-surface p-5">
            <div className="mb-4 flex items-center gap-2 text-base font-bold text-pm-text-strong">
              <Banknote className="h-5 w-5 text-pm-green" />
              Предпросмотр
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[#22c55e]/25 bg-[#22c55e]/10 p-3">
                <div className="text-sm font-bold text-pm-green">Да</div>
                <div className="mt-1 text-2xl font-bold text-pm-text-strong">{initialProbability}¢</div>
              </div>
              <div className="rounded-xl border border-[#ef4444]/25 bg-[#ef4444]/10 p-3">
                <div className="text-sm font-bold text-pm-red">Нет</div>
                <div className="mt-1 text-2xl font-bold text-pm-text-strong">{100 - initialProbability}¢</div>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-pm-bg/45 p-3 text-sm font-semibold leading-6 text-pm-text-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-pm-blue" />
              <span>После создания правила, источник и даты попадут в карточку рынка.</span>
            </div>
          </div>

          {formMessage && (
            <div className="rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-sm font-semibold text-pm-red">
              {formMessage}
            </div>
          )}

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-pm-blue px-6 text-base font-bold text-white shadow-[0_4px_0_#1d4ed8] transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Создаю...' : 'Создать рынок'}
            <ArrowRight className="h-4 w-4" />
          </motion.button>
        </aside>
      </form>
    </motion.div>
  );
}
