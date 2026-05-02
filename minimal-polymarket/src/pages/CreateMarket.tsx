import { type CSSProperties, type FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Gauge,
  Info,
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
const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const weekdayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const quickTimes = ['09:00', '12:00', '18:00', '23:59'];

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

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function safeParseDateTime(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function startOfCalendarDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isBeforeCalendarDay(left: Date, right: Date) {
  return startOfCalendarDay(left).getTime() < startOfCalendarDay(right).getTime();
}

function isSameCalendarDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function getCalendarDays(visibleMonth: Date) {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(year, month, 1 - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => (
    new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index)
  ));
}

function formatDateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(safeParseDateTime(value));
}

function updateDatePart(value: string, nextDate: Date) {
  const currentDate = safeParseDateTime(value);
  const mergedDate = new Date(nextDate);
  mergedDate.setHours(currentDate.getHours(), currentDate.getMinutes(), 0, 0);

  return toDateTimeLocal(mergedDate);
}

function updateTimePart(value: string, nextTime: string) {
  const [hours, minutes] = nextTime.split(':').map(Number);
  const nextDate = safeParseDateTime(value);

  if (Number.isFinite(hours) && Number.isFinite(minutes)) {
    nextDate.setHours(hours, minutes, 0, 0);
  }

  return toDateTimeLocal(nextDate);
}

type DateTimePickerProps = {
  align?: 'left' | 'right';
  label: string;
  minDate?: Date;
  name: string;
  onChange: (value: string) => void;
  value: string;
};

function DateTimePicker({ align = 'left', label, minDate, name, onChange, value }: DateTimePickerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const selectedDate = useMemo(() => safeParseDateTime(value), [value]);
  const minCalendarDate = useMemo(() => (minDate ? startOfCalendarDay(minDate) : null), [minDate]);
  const [visibleMonth, setVisibleMonth] = useState(() => (
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  ));
  const calendarDays = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);
  const currentTime = `${pad(selectedDate.getHours())}:${pad(selectedDate.getMinutes())}`;
  const previousMonthLastDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 0);
  const canGoPreviousMonth = !minCalendarDate || previousMonthLastDay.getTime() >= minCalendarDate.getTime();

  useEffect(() => {
    if (isOpen) {
      setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [isOpen, selectedDate]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={wrapperRef} className="relative">
      <span className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
        <CalendarClock className="h-4 w-4" />
        {label}
      </span>
      <input name={name} type="hidden" value={value} />
      <button
        type="button"
        onClick={() => setIsOpen((nextIsOpen) => !nextIsOpen)}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-pm-border bg-pm-bg/45 px-4 text-left text-base font-semibold text-pm-text-strong outline-none transition-colors hover:border-pm-blue/60 hover:bg-pm-bg focus:border-pm-blue focus:bg-pm-bg"
        aria-expanded={isOpen}
      >
        <span>{formatDateTimeLabel(value)}</span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pm-surface-hover text-pm-blue">
          <Clock3 className="h-4 w-4" />
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className={`absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-pm-border bg-pm-surface shadow-[0_18px_48px_var(--color-pm-card-shadow-strong)] sm:w-[360px] ${align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'}`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-pm-border px-3 py-3">
              <button
                type="button"
                onClick={() => {
                  if (canGoPreviousMonth) {
                    setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1));
                  }
                }}
                disabled={!canGoPreviousMonth}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-pm-text-muted transition-colors hover:bg-pm-surface-hover hover:text-pm-text-strong disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-pm-text-muted"
                aria-label="Предыдущий месяц"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="text-sm font-bold text-pm-text-strong">
                {monthNames[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
              </div>
              <button
                type="button"
                onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-pm-text-muted transition-colors hover:bg-pm-surface-hover hover:text-pm-text-strong"
                aria-label="Следующий месяц"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="px-3 pb-3 pt-2">
              <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-pm-text-muted">
                {weekdayNames.map((day) => (
                  <div key={day} className="py-2">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day) => {
                  const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
                  const isSelected = isSameCalendarDay(day, selectedDate);
                  const isToday = isSameCalendarDay(day, new Date());
                  const isDisabled = Boolean(minCalendarDate && isBeforeCalendarDay(day, minCalendarDate));
                  const dayClassName = [
                    'flex h-9 w-full items-center justify-center rounded-lg text-sm font-bold transition-colors',
                    isDisabled
                      ? 'cursor-not-allowed text-pm-text-muted/25'
                      : isSelected
                        ? 'bg-pm-blue text-white shadow-[0_8px_18px_rgba(37,99,235,0.28)]'
                        : isToday
                          ? 'border border-pm-blue/45 text-pm-blue hover:bg-pm-surface-hover'
                          : isCurrentMonth
                          ? 'text-pm-text-strong hover:bg-pm-surface-hover'
                          : 'text-pm-text-muted/45 hover:bg-pm-surface-hover/60',
                  ].join(' ');

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => onChange(updateDatePart(value, day))}
                      disabled={isDisabled}
                      className={dayClassName}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-pm-border bg-pm-bg/30 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
                  <Clock3 className="h-4 w-4" />
                  Время
                </span>
                <input
                  type="time"
                  value={currentTime}
                  onChange={(event) => onChange(updateTimePart(value, event.target.value))}
                  className="market-time-input h-9 rounded-lg border border-pm-border bg-pm-surface px-3 text-sm font-bold text-pm-text-strong outline-none transition-colors focus:border-pm-blue"
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {quickTimes.map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => onChange(updateTimePart(value, time))}
                    className={
                      currentTime === time
                        ? 'h-9 rounded-lg bg-pm-blue text-xs font-bold text-white'
                        : 'h-9 rounded-lg border border-pm-border bg-pm-surface text-xs font-bold text-pm-text transition-colors hover:border-pm-blue/45 hover:text-pm-text-strong'
                    }
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type CustomSliderProps = {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  ticks: [string, string, string];
  value: number;
  valueLabel: string;
  variant: 'probability' | 'liquidity';
};

function CustomSlider({ label, max, min, onChange, step = 1, ticks, value, valueLabel, variant }: CustomSliderProps) {
  const sliderId = useId();
  const progress = ((value - min) / (max - min)) * 100;
  const style = { '--range-progress': `${progress}%` } as CSSProperties;

  return (
    <div>
      <div className="mb-2 grid min-h-9 grid-cols-[minmax(0,1fr)_88px] items-start gap-3 text-sm font-bold text-pm-text-strong">
        <label htmlFor={sliderId} className="leading-5">
          {label}
        </label>
        <span className="flex h-8 w-[88px] shrink-0 items-center justify-center rounded-full bg-pm-soft-badge px-2 text-center text-xs leading-4 text-pm-text-strong tabular-nums whitespace-nowrap">
          {valueLabel}
        </span>
      </div>
      <input
        id={sliderId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={style}
        className={`market-range market-range--${variant}`}
        aria-label={label}
      />
      <div className="mt-1 flex items-center justify-between text-[11px] font-bold text-pm-text-muted">
        <span>{ticks[0]}</span>
        <span>{ticks[1]}</span>
        <span>{ticks[2]}</span>
      </div>
    </div>
  );
}

export function CreateMarket() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [formMessage, setFormMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialProbability, setInitialProbability] = useState(50);
  const [liquidity, setLiquidity] = useState(1000);
  const [category, setCategory] = useState('Общее');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [closeDate, setCloseDate] = useState(defaultCloseDate);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage('');
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const rules = String(formData.get('resolutionRules') || '').trim();

    try {
      const parsedStartDate = new Date(startDate);

      if (Number.isNaN(parsedStartDate.getTime()) || isBeforeCalendarDay(parsedStartDate, new Date())) {
        setFormMessage('Дата запуска не может быть раньше сегодняшнего дня.');
        return;
      }

      const response = await api.createMarket({
        title: String(formData.get('title') || ''),
        description: rules,
        category,
        resolutionSource: String(formData.get('resolutionSource') || ''),
        resolutionRules: rules,
        startDate: new Date(startDate).toISOString(),
        closeDate: new Date(closeDate).toISOString(),
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

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6">
        <div className="h-[520px] animate-pulse rounded-2xl border border-pm-border bg-pm-surface" />
      </div>
    );
  }

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

  if (!isLoading && user && !user.isAdmin) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-89px)] max-w-[760px] items-center px-4 py-10 sm:px-6">
        <div className="w-full rounded-2xl border border-pm-border bg-pm-surface p-6 shadow-[0_18px_48px_var(--color-pm-card-shadow-strong)]">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-pm-surface-hover text-pm-blue">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-pm-text-strong">Публикация только для админов</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-pm-text">
            Обычные пользователи могут торговать и следить за рынками, но выкладывать новые рынки могут только администраторы.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-lg border border-pm-border px-5 text-sm font-bold text-pm-text-strong transition-colors hover:bg-pm-surface-hover"
          >
            На главную
          </Link>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-pm-border bg-pm-surface text-pm-blue">
            <PlusCircle className="h-4 w-4 text-pm-blue" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">Новый рынок</p>
            <h1 className="text-2xl font-bold text-pm-text-strong">Создать prediction market</h1>
          </div>
        </div>
        <div className="rounded-lg border border-pm-border bg-pm-surface px-3 py-2 text-sm font-semibold text-pm-text-muted">
          Баланс: <span className="text-pm-text-strong">{Math.round(user?.balance ?? 0).toLocaleString('ru-RU')} pts</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-4 rounded-2xl border border-pm-border bg-pm-surface p-4 shadow-[0_18px_48px_var(--color-pm-card-shadow-strong)] sm:p-5">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
              <FileText className="h-4 w-4" />
              Вопрос
            </span>
            <input
              name="title"
              required
              minLength={12}
              maxLength={180}
              placeholder="BTC выше $100 000 к 31.12.2026?"
              className="h-11 w-full rounded-xl border border-pm-border bg-pm-bg/45 px-4 text-base font-semibold text-pm-text-strong outline-none transition-colors placeholder:text-pm-text-muted focus:border-pm-blue focus:bg-pm-bg"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
                <Tag className="h-4 w-4" />
                Категория
              </span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-11 w-full rounded-xl border border-pm-border bg-pm-bg/45 px-4 text-base font-semibold text-pm-text-strong outline-none transition-colors focus:border-pm-blue focus:bg-pm-bg"
              >
                {categories.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
                <Link2 className="h-4 w-4" />
                Источник резолюции
              </span>
              <input
                name="resolutionSource"
                required
                maxLength={300}
                placeholder="Сайт, API, протокол, oracle"
                className="h-11 w-full rounded-xl border border-pm-border bg-pm-bg/45 px-4 text-base font-semibold text-pm-text-strong outline-none transition-colors placeholder:text-pm-text-muted focus:border-pm-blue focus:bg-pm-bg"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DateTimePicker
              label="Запуск"
              minDate={new Date()}
              name="startDate"
              value={startDate}
              onChange={setStartDate}
            />

            <DateTimePicker
              align="right"
              label="Завершение"
              name="closeDate"
              value={closeDate}
              onChange={setCloseDate}
            />
          </div>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
              <Scale className="h-4 w-4" />
              Правила резолюции
            </span>
            <textarea
              name="resolutionRules"
              rows={6}
              required
              minLength={40}
              maxLength={2500}
              placeholder="Рынок закроется как Да, если... Укажи источник, дедлайн, таймзону и спорные случаи."
              className="w-full resize-y rounded-xl border border-pm-border bg-pm-bg/45 px-4 py-3 text-base font-medium leading-7 text-pm-text-strong outline-none transition-colors placeholder:text-pm-text-muted focus:border-pm-blue focus:bg-pm-bg"
            />
          </label>
        </section>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-pm-border bg-pm-surface p-4 shadow-[0_18px_48px_var(--color-pm-card-shadow-strong)] sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-base font-bold text-pm-text-strong">
              <Gauge className="h-5 w-5 text-pm-blue" />
              Рынок
            </div>

            <div className="mb-3 border-b border-pm-border pb-3">
              <div className="mb-1.5 flex items-center gap-2 text-sm font-bold text-pm-text-strong">
                <Info className="h-4 w-4 text-pm-blue" />
                Инструкция
              </div>
              <p className="text-xs font-semibold leading-5 text-pm-text-muted">
                <span className="text-pm-text-strong">pts</span> — виртуальные очки; старт задаёт цены Да/Нет; ликвидность сглаживает движение; <span className="text-pm-text-strong">Tick</span> — шаг цены; <span className="text-pm-text-strong">Min order</span> — минимум сделки.
              </p>
            </div>

            <div className="space-y-3">
              <CustomSlider
                label="Стартовая вероятность"
                min={1}
                max={99}
                value={initialProbability}
                onChange={setInitialProbability}
                valueLabel={`${initialProbability}% / ${100 - initialProbability}%`}
                ticks={['Да 1%', '50 / 50', 'Да 99%']}
                variant="probability"
              />

              <CustomSlider
                label="Виртуальная ликвидность"
                min={100}
                max={10000}
                step={100}
                value={liquidity}
                onChange={setLiquidity}
                valueLabel={`${liquidity.toLocaleString('ru-RU')} pts`}
                ticks={['100', '5 000', '10 000']}
                variant="liquidity"
              />

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase leading-4 tracking-[0.08em] text-pm-text-muted">Tick (шаг)</span>
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
                  <span className="mb-2 block text-xs font-bold uppercase leading-4 tracking-[0.08em] text-pm-text-muted">Min order (pts)</span>
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

              <div className="border-t border-pm-border pt-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-pm-text-strong">
                  <Banknote className="h-4 w-4 text-pm-green" />
                  Предпросмотр
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-[#22c55e]/25 bg-[#22c55e]/10 p-2.5">
                    <div className="text-xs font-bold text-pm-green">Да</div>
                    <div className="mt-0.5 text-xl font-bold text-pm-text-strong">{initialProbability}¢</div>
                  </div>
                  <div className="rounded-xl border border-[#ef4444]/25 bg-[#ef4444]/10 p-2.5">
                    <div className="text-xs font-bold text-pm-red">Нет</div>
                    <div className="mt-0.5 text-xl font-bold text-pm-text-strong">{100 - initialProbability}¢</div>
                  </div>
                </div>
                <div className="mt-2 flex items-start gap-2 text-xs font-semibold leading-5 text-pm-text-muted">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-pm-blue" />
                  <span>Правила, источник и даты появятся в карточке рынка.</span>
                </div>
              </div>
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
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-pm-blue px-6 text-base font-bold text-white shadow-[0_4px_0_#1d4ed8] transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Создаю...' : 'Создать рынок'}
            <ArrowRight className="h-4 w-4" />
          </motion.button>
        </aside>
      </form>
    </motion.div>
  );
}
