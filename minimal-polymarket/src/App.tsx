/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useLayoutEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Link } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { AuthProvider } from './lib/auth';
import { LanguageProvider } from './lib/i18n';
import { AuthPage } from './pages/AuthPage';
import { AdminPage } from './pages/AdminPage';
import { CreateMarket } from './pages/CreateMarket';
import { Home } from './pages/Home';
import { HowItWorks } from './pages/HowItWorks';
import { MarketDetail } from './pages/MarketDetail';
import { Portfolio } from './pages/Portfolio';

function NotFound() {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-3xl font-bold text-pm-text-strong">Страница не найдена</h1>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-pm-text-muted">
        Возможно, рынок был удалён или ссылка устарела.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link
          to="/"
          className="inline-flex h-11 items-center justify-center rounded-full bg-pm-blue px-5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
        >
          На главную
        </Link>
        <Link
          to="/portfolio"
          className="inline-flex h-11 items-center justify-center rounded-full border border-pm-border px-5 text-sm font-bold text-pm-text-strong transition-colors hover:bg-pm-surface-hover"
        >
          Открыть портфель
        </Link>
      </div>
    </div>
  );
}

type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'pm-theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

  if (storedTheme === 'dark' || storedTheme === 'light') {
    return storedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    const resetScroll = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    resetScroll();
    window.requestAnimationFrame(resetScroll);
    const timer = window.setTimeout(resetScroll, 50);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}

function AppShell({ theme, onThemeToggle }: { theme: Theme; onThemeToggle: () => void }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-pm-bg font-sans">
      <ScrollToTop />
      <Navbar theme={theme} onThemeToggle={onThemeToggle} />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/create" element={<CreateMarket />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/market/:id" element={<MarketDetail />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const handleThemeToggle = useCallback(() => {
    setTheme((currentTheme) => currentTheme === 'dark' ? 'light' : 'dark');
  }, []);

  return (
    <Router>
      <LanguageProvider>
        <AuthProvider>
          <AppShell theme={theme} onThemeToggle={handleThemeToggle} />
        </AuthProvider>
      </LanguageProvider>
    </Router>
  );
}
