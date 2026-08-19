import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { fieldTriggerClass, popoverPanelClass } from './UI';

// Выпадающий список для форм.
//
// Раньше такой список был написан прямо в настройках и знал только тёмную тему: панель всегда была
// zinc-800, поэтому в светлой теме поверх белой формы раскрывался чёрный прямоугольник. Здесь
// панель одинаково уместна в обеих темах, а сам компонент вынесен, чтобы следующее поле выбора не
// начиналось с копирования разметки.

export interface SelectOption<T extends string> {
    value: T;
    label: string;
    // Вторая строка в пункте списка — для пояснения, когда одной подписи мало.
    hint?: string;
    icon?: React.ReactNode;
}

interface SelectProps<T extends string> {
    value: T;
    options: SelectOption<T>[];
    onChange: (value: T) => void;
    // Иконка слева в самой кнопке (не в пунктах списка).
    icon?: React.ReactNode;
    placeholder?: string;
    ariaLabel?: string;
}

// Высота одного пункта плюс отступы панели — по ней прикидывается, куда её раскрывать.
const OPTION_HEIGHT_PX = 50;
const PANEL_PADDING_PX = 16;

export function Select<T extends string>({ value, options, onChange, icon, placeholder, ariaLabel }: SelectProps<T>) {
    const [isOpen, setIsOpen] = useState(false);
    const [dropUp, setDropUp] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const selected = options.find((option) => option.value === value) || null;

    // Список языка стоит последним в форме настроек, и вниз ему места нет: панель уходила за нижний
    // край модалки, и второй пункт был виден наполовину.
    const toggle = () => {
        if (isOpen) {
            setIsOpen(false);
            return;
        }

        const rect = triggerRef.current?.getBoundingClientRect();
        const spaceBelow = rect ? window.innerHeight - rect.bottom : 0;
        const panelHeight = options.length * OPTION_HEIGHT_PX + PANEL_PADDING_PX;
        setDropUp(Boolean(rect && spaceBelow < panelHeight && rect.top > spaceBelow));
        setIsOpen(true);
    };

    // Прокручиваем панель в видимую часть: ограничивает её не окно, а сама модалка настроек —
    // список языка стоит у нижнего края, и без этого второй пункт оказывался за обрезом.
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
        // Esc закрывает список, а не всю модалку: слушатель вешается только пока список открыт,
        // поэтому обычное поведение Esc в диалоге не ломается.
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

    return (
        <div className="relative" ref={containerRef}>
            <button
                ref={triggerRef}
                // Список живёт внутри <form> настроек: без type="button" клик по нему отправлял бы
                // форму и сохранял профиль.
                type="button"
                onClick={toggle}
                className={fieldTriggerClass(isOpen, Boolean(selected))}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-label={ariaLabel}
            >
                {icon && <span className="shrink-0 text-zinc-400">{icon}</span>}
                {selected?.icon && <span className="shrink-0 text-zinc-500 dark:text-zinc-400">{selected.icon}</span>}
                <span className="flex-1 truncate">{selected ? selected.label : placeholder}</span>
                <ChevronDown
                    size={16}
                    className={`shrink-0 text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {isOpen && (
                <div
                    ref={panelRef}
                    role="listbox"
                    className={[
                        dropUp ? 'animate-popover-up bottom-full mb-2' : 'animate-popover top-full mt-2',
                        'absolute left-0 right-0 z-30 scroll-mt-4 scroll-mb-4 p-1.5 flex flex-col gap-0.5',
                        popoverPanelClass,
                    ].join(' ')}
                >
                    {options.map((option) => {
                        const isSelected = option.value === value;

                        return (
                            <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => {
                                    onChange(option.value);
                                    setIsOpen(false);
                                }}
                                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm text-left transition-colors ${isSelected
                                    ? 'bg-blue-500 text-white'
                                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white'
                                    }`}
                            >
                                {option.icon && (
                                    <span className={`shrink-0 ${isSelected ? 'text-white' : 'text-zinc-400'}`}>{option.icon}</span>
                                )}
                                <span className="flex-1 min-w-0">
                                    <span className="block font-medium truncate">{option.label}</span>
                                    {option.hint && (
                                        <span className={`block text-xs truncate ${isSelected ? 'text-blue-100' : 'text-zinc-500'}`}>
                                            {option.hint}
                                        </span>
                                    )}
                                </span>
                                {isSelected && <Check size={16} className="shrink-0" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
