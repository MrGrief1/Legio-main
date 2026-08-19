import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

// Тема хранится в двух измерениях:
//   mode  — что выбрал человек: «светлая», «тёмная» или «как в системе»;
//   theme — что реально нарисовано на экране (у режима 'system' зависит от настроек ОС).
// Разделение нужно ради 'system': переключатель в настройках должен подсвечивать «Авто», а не ту
// тему, в которую «Авто» сейчас разрешилось.
export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

// Ключ и обработка неизвестного значения повторяют public/theme-init.js — тот скрипт ставит класс
// до первой отрисовки, и если правила разойдутся, страница мигнёт чужой темой.
const readStoredMode = (): ThemeMode => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored === 'light' || stored === 'dark' ? stored : 'system';
    } catch {
        return 'system';
    }
};

const prefersDark = () => typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches;

const resolveTheme = (mode: ThemeMode): ResolvedTheme => (
    mode === 'system' ? (prefersDark() ? 'dark' : 'light') : mode
);

const applyTheme = (theme: ResolvedTheme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
};

interface ThemeContextType {
    mode: ThemeMode;
    theme: ResolvedTheme;
    setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
    const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme(readStoredMode()));

    // Единственное место во всём приложении, которое трогает класс `dark`.
    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    // В режиме «Авто» следим за системой: пользователь может переключить тему ОС, не трогая вкладку.
    useEffect(() => {
        if (mode !== 'system') return;

        const media = window.matchMedia(DARK_QUERY);
        const handleChange = () => setTheme(media.matches ? 'dark' : 'light');

        handleChange();
        media.addEventListener('change', handleChange);
        return () => media.removeEventListener('change', handleChange);
    }, [mode]);

    const setMode = useCallback((next: ThemeMode) => {
        setModeState(next);
        setTheme(resolveTheme(next));
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Приватный режим — тема доживёт до конца сессии и не сохранится. Это лучше, чем падение.
        }
    }, []);

    return (
        <ThemeContext.Provider value={{ mode, theme, setMode }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = (): ThemeContextType => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
