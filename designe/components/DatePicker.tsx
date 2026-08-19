import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { fieldTriggerClass, popoverPanelClass } from './UI';
import { useLanguage } from '../context/LanguageContext';

// Календарь для даты рождения.
//
// Заменяет <input type="date">: тот рисуется браузером, поэтому выглядел в каждом браузере
// по-своему, не знал тёмной темы и на десктопе открывался мелким системным окном.
//
// Три уровня — годы → месяцы → дни. Год выбирается сеткой, а не стрелками: до 1990-го от текущего
// года пришлось бы пролистать больше четырёхсот месяцев, и календарь без быстрого перехода к году
// для даты рождения бесполезен. По той же причине пустое поле открывается сразу на выборе года.

const DAYS_IN_WEEK = 7;
const WEEKS_SHOWN = 6;
const YEARS_PER_PAGE = 16;
const MIN_YEAR = 1900;
// Примерная высота раскрытой панели — по ней решается, разворачивать её вниз или вверх.
const PANEL_HEIGHT_PX = 360;

const pad = (value: number) => String(value).padStart(2, '0');

// Строку собираем вручную. toISOString() переводит дату в UTC, и для отрицательных смещений
// (весь американский континент) 1 марта превращается в 28 февраля — день рождения уезжает назад.
const toISODate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// И обратно: new Date('2001-03-12') разбирается как полночь UTC, то есть в тех же зонах даёт
// 11 марта. Поэтому дату собираем покомпонентно, в локальном времени.
const fromISODate = (value?: string | null): Date | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? '').trim());
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day);

    // Конструктор Date переносит лишние дни на следующий месяц (31 февраля → 3 марта). Значит,
    // такую дату ввели ошибочно, и принимать её за настоящую нельзя.
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
    return date;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addMonths = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth() + amount, 1);
const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

type CalendarView = 'days' | 'months' | 'years';

interface DatePickerProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    // По умолчанию — сегодня: сервер отклоняет дату рождения из будущего.
    maxDate?: Date;
    minDate?: Date;
    ariaLabel?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({
    value,
    onChange,
    placeholder,
    maxDate,
    minDate,
    ariaLabel,
}) => {
    const { language, t } = useLanguage();
    const locale = language === 'ru' ? 'ru-RU' : 'en-US';

    const [isOpen, setIsOpen] = useState(false);
    const [view, setView] = useState<CalendarView>('days');
    const [dropUp, setDropUp] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const selected = fromISODate(value);
    const today = startOfDay(new Date());
    const max = maxDate ? startOfDay(maxDate) : today;
    const min = minDate ? startOfDay(minDate) : new Date(MIN_YEAR, 0, 1);

    // Месяц, который сейчас показан. Открытие с пустым полем ставит курсор на сегодня, но сразу
    // на уровень годов — оттуда до нужного года два клика.
    const [cursor, setCursor] = useState(() => {
        const base = selected || max;
        return new Date(base.getFullYear(), base.getMonth(), 1);
    });

    const monthNames = useMemo(() => {
        const formatter = new Intl.DateTimeFormat(locale, { month: 'long' });
        return Array.from({ length: 12 }, (_, index) => capitalize(formatter.format(new Date(2000, index, 1))));
    }, [locale]);

    const shortMonthNames = useMemo(() => {
        const formatter = new Intl.DateTimeFormat(locale, { month: 'short' });
        return Array.from({ length: 12 }, (_, index) => capitalize(formatter.format(new Date(2000, index, 1))));
    }, [locale]);

    // 1 января 2024 года — понедельник, поэтому неделя от него даёт подписи в нужном порядке.
    const weekdayNames = useMemo(() => {
        const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
        return Array.from({ length: DAYS_IN_WEEK }, (_, index) => capitalize(formatter.format(new Date(2024, 0, 1 + index))));
    }, [locale]);

    const triggerLabel = selected
        ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(selected)
        : (placeholder || t.datePicker.placeholder);

    // Панель ограничена не окном, а модалкой настроек, внутри которой она открывается: подтягиваем
    // её в видимую часть, чтобы календарь не оказался наполовину за обрезом.
    useEffect(() => {
        if (!isOpen) return;
        const frame = requestAnimationFrame(() => {
            panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        return () => cancelAnimationFrame(frame);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown, true);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [isOpen]);

    const openCalendar = () => {
        const base = selected || max;
        setCursor(new Date(base.getFullYear(), base.getMonth(), 1));
        setView(selected ? 'days' : 'years');

        // На телефоне поле даты оказывается в нижней половине экрана, и панель просто не помещается
        // под ним. Разворачиваем вверх только если снизу места не хватает, а сверху его больше:
        // иначе панель прыгала бы вверх и в тех случаях, когда снизу всё помещается.
        const rect = triggerRef.current?.getBoundingClientRect();
        const spaceBelow = rect ? window.innerHeight - rect.bottom : 0;
        setDropUp(Boolean(rect && spaceBelow < PANEL_HEIGHT_PX && rect.top > spaceBelow));

        setIsOpen(true);
    };

    const commit = (date: Date) => {
        onChange(toISODate(date));
        setIsOpen(false);
    };

    const isDayDisabled = (date: Date) => date > max || date < min;

    // 42 ячейки всегда: если рисовать столько недель, сколько занимает месяц, высота панели
    // прыгала бы при листании, а вместе с ней — и кнопки под сеткой.
    const days = useMemo(() => {
        const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        // getDay() считает от воскресенья, а неделя в календаре начинается с понедельника.
        const leading = (firstOfMonth.getDay() + 6) % DAYS_IN_WEEK;
        const gridStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - leading);

        return Array.from({ length: DAYS_IN_WEEK * WEEKS_SHOWN }, (_, index) => (
            new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
        ));
    }, [cursor]);

    // Последняя страница обрезается по максимуму: рисовать 2027-й серым, когда выбрать его нельзя,
    // значит показывать заведомо мёртвую клетку.
    const yearPageStart = Math.floor((cursor.getFullYear() - MIN_YEAR) / YEARS_PER_PAGE) * YEARS_PER_PAGE + MIN_YEAR;
    const yearPageEnd = Math.min(yearPageStart + YEARS_PER_PAGE - 1, max.getFullYear());
    const years = Array.from({ length: yearPageEnd - yearPageStart + 1 }, (_, index) => yearPageStart + index);

    const goPrev = () => {
        if (view === 'days') setCursor(addMonths(cursor, -1));
        else if (view === 'months') setCursor(new Date(cursor.getFullYear() - 1, cursor.getMonth(), 1));
        else setCursor(new Date(cursor.getFullYear() - YEARS_PER_PAGE, cursor.getMonth(), 1));
    };

    const goNext = () => {
        if (view === 'days') setCursor(addMonths(cursor, 1));
        else if (view === 'months') setCursor(new Date(cursor.getFullYear() + 1, cursor.getMonth(), 1));
        else setCursor(new Date(cursor.getFullYear() + YEARS_PER_PAGE, cursor.getMonth(), 1));
    };

    const prevDisabled = view === 'days'
        ? addMonths(cursor, -1) < new Date(min.getFullYear(), min.getMonth(), 1)
        : view === 'months'
            ? cursor.getFullYear() - 1 < min.getFullYear()
            : yearPageStart <= MIN_YEAR;

    const nextDisabled = view === 'days'
        ? addMonths(cursor, 1) > new Date(max.getFullYear(), max.getMonth(), 1)
        : view === 'months'
            ? cursor.getFullYear() + 1 > max.getFullYear()
            : yearPageStart + YEARS_PER_PAGE > max.getFullYear();

    const headerLabel = view === 'days'
        ? `${monthNames[cursor.getMonth()]} ${cursor.getFullYear()}`
        : view === 'months'
            ? String(cursor.getFullYear())
            : `${yearPageStart} — ${yearPageEnd}`;

    const navButtonClass = (disabled: boolean) => [
        'p-2 rounded-full transition-colors',
        disabled
            ? 'text-zinc-300 dark:text-zinc-700 cursor-not-allowed'
            : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white',
    ].join(' ');

    const cellClass = (state: { selected: boolean; current: boolean; disabled: boolean; muted?: boolean }) => [
        'flex items-center justify-center rounded-full text-sm transition-colors',
        state.disabled
            ? 'text-zinc-300 dark:text-zinc-700 cursor-not-allowed'
            : state.selected
                ? 'bg-blue-500 text-white font-semibold shadow-sm shadow-blue-500/30'
                : state.current
                    ? 'text-blue-600 dark:text-blue-400 font-semibold ring-1 ring-inset ring-blue-400/60 hover:bg-blue-50 dark:hover:bg-blue-500/10'
                    : state.muted
                        ? 'text-zinc-300 dark:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white',
    ].join(' ');

    return (
        <div className="relative" ref={containerRef}>
            <button
                ref={triggerRef}
                // Календарь стоит внутри <form> настроек — без type="button" любое нажатие
                // отправляло бы форму.
                type="button"
                onClick={() => (isOpen ? setIsOpen(false) : openCalendar())}
                className={fieldTriggerClass(isOpen, Boolean(selected))}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-label={ariaLabel}
            >
                <CalendarIcon size={16} className="shrink-0 text-zinc-400" />
                <span className="flex-1 truncate">{triggerLabel}</span>
                <ChevronDown
                    size={16}
                    className={`shrink-0 text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {isOpen && (
                <div
                    ref={panelRef}
                    role="dialog"
                    className={[
                        dropUp ? 'animate-popover-up bottom-full mb-2' : 'animate-popover top-full mt-2',
                        'absolute left-0 z-30 scroll-mt-4 scroll-mb-4 w-full sm:w-[330px] p-3',
                        popoverPanelClass,
                    ].join(' ')}
                >
                    {/* Шапка: стрелки листают текущий уровень, подпись переключает уровень выше */}
                    <div className="flex items-center justify-between gap-1 mb-2">
                        <button type="button" onClick={goPrev} disabled={prevDisabled} className={navButtonClass(prevDisabled)} aria-label={t.datePicker.previous}>
                            <ChevronLeft size={18} />
                        </button>

                        <button
                            type="button"
                            onClick={() => setView(view === 'days' ? 'months' : view === 'months' ? 'years' : 'days')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                            {headerLabel}
                            <ChevronDown size={14} className={`text-zinc-400 transition-transform duration-200 ${view === 'days' ? '' : 'rotate-180'}`} />
                        </button>

                        <button type="button" onClick={goNext} disabled={nextDisabled} className={navButtonClass(nextDisabled)} aria-label={t.datePicker.next}>
                            <ChevronRight size={18} />
                        </button>
                    </div>

                    {view === 'days' && (
                        <div className="animate-calendar-view">
                            <div className="grid grid-cols-7 mb-1">
                                {weekdayNames.map((name) => (
                                    <div key={name} className="h-7 flex items-center justify-center text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                                        {name}
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-7 gap-y-0.5">
                                {days.map((day) => {
                                    const disabled = isDayDisabled(day);
                                    return (
                                        <button
                                            key={day.getTime()}
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => commit(day)}
                                            className={`h-9 ${cellClass({
                                                selected: Boolean(selected && isSameDay(day, selected)),
                                                current: isSameDay(day, today),
                                                disabled,
                                                muted: day.getMonth() !== cursor.getMonth(),
                                            })}`}
                                        >
                                            {day.getDate()}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {view === 'months' && (
                        <div className="animate-calendar-view grid grid-cols-3 gap-1">
                            {monthNames.map((name, index) => {
                                // Месяц недоступен, если в нём нет ни одного разрешённого дня.
                                const disabled = new Date(cursor.getFullYear(), index, 1) > new Date(max.getFullYear(), max.getMonth(), 1)
                                    || new Date(cursor.getFullYear(), index, 1) < new Date(min.getFullYear(), min.getMonth(), 1);

                                return (
                                    <button
                                        key={name}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => {
                                            setCursor(new Date(cursor.getFullYear(), index, 1));
                                            setView('days');
                                        }}
                                        className={`h-11 ${cellClass({
                                            selected: Boolean(selected && selected.getFullYear() === cursor.getFullYear() && selected.getMonth() === index),
                                            current: today.getFullYear() === cursor.getFullYear() && today.getMonth() === index,
                                            disabled,
                                        })}`}
                                    >
                                        {shortMonthNames[index]}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {view === 'years' && (
                        <div className="animate-calendar-view grid grid-cols-4 gap-1">
                            {years.map((year) => {
                                const disabled = year > max.getFullYear() || year < min.getFullYear();

                                return (
                                    <button
                                        key={year}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => {
                                            setCursor(new Date(year, cursor.getMonth(), 1));
                                            setView('months');
                                        }}
                                        className={`h-11 ${cellClass({
                                            selected: Boolean(selected && selected.getFullYear() === year),
                                            current: today.getFullYear() === year,
                                            disabled,
                                        })}`}
                                    >
                                        {year}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                        <button
                            type="button"
                            onClick={() => {
                                setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
                                setView('days');
                            }}
                            className="px-3 py-1.5 rounded-full text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-colors"
                        >
                            {t.datePicker.today}
                        </button>

                        {/* Дата рождения на сервере обнуляемая, и старое поле type="date" очищалось
                            крестиком браузера — без этой кнопки её было бы не убрать. */}
                        <button
                            type="button"
                            disabled={!value}
                            onClick={() => {
                                onChange('');
                                setIsOpen(false);
                            }}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${value
                                ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                                : 'text-zinc-300 dark:text-zinc-700 cursor-not-allowed'
                                }`}
                        >
                            {t.datePicker.clear}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
