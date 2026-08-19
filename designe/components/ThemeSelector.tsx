import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { ThemeMode, useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

// Переключатель темы: светлая / тёмная / как в системе.
//
// Раньше на главном экране висела одна кнопка-«луна», которая просто инвертировала тему и не
// умела следовать настройкам системы. Три состояния в один клик не помещаются, поэтому это
// сегментированный переключатель — та же механика, что у вкладок «Профиль / Безопасность» выше.
//
// Выбор применяется и сохраняется сразу, не по кнопке «Сохранить»: тема — настройка устройства,
// а не поле профиля, и человек должен видеть результат в тот же момент.

export const ThemeSelector: React.FC = () => {
    const { mode, setMode } = useTheme();
    const { t } = useLanguage();

    const options: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
        { value: 'light', label: t.settings.themeLight, icon: <Sun size={16} /> },
        { value: 'dark', label: t.settings.themeDark, icon: <Moon size={16} /> },
        { value: 'system', label: t.settings.themeSystem, icon: <Monitor size={16} /> },
    ];

    const activeIndex = Math.max(0, options.findIndex((option) => option.value === mode));

    return (
        <div className="relative flex p-1 bg-zinc-100 dark:bg-zinc-900 rounded-full" role="radiogroup" aria-label={t.settings.theme}>
            <div
                className="absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/3)] bg-white dark:bg-zinc-700 rounded-full shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)]"
                style={{ transform: `translateX(${activeIndex * 100}%)` }}
            />

            {options.map((option) => {
                const isActive = option.value === mode;

                return (
                    <button
                        key={option.value}
                        // Переключатель стоит внутри <form> настроек: без type="button" выбор темы
                        // отправлял бы форму профиля.
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        onClick={() => setMode(option.value)}
                        className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-1.5 text-xs sm:text-sm font-medium rounded-full transition-colors duration-200 ${isActive
                            ? 'text-zinc-900 dark:text-white'
                            : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                            }`}
                    >
                        <span className="shrink-0">{option.icon}</span>
                        <span className="truncate">{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
};
