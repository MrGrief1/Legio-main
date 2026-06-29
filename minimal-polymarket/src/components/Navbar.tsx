import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  Globe,
  Info,
  LayoutDashboard,
  LogOut,
  Moon,
  PieChart,
  PlusCircle,
  Search,
  ShieldCheck,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../lib/auth';
import { navCategoryValues, useI18n } from '../lib/i18n';

type NavbarProps = {
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
};

const menuItemClass =
  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-pm-text transition-colors hover:bg-pm-surface-hover hover:text-pm-text-strong';

export function Navbar({ theme, onThemeToggle }: NavbarProps) {
  const isLightTheme = theme === 'light';
  const { language, t, categoryLabel, toggleLanguage } = useI18n();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, logout } = useAuth();
  const isAuthRoute = pathname === '/login' || pathname === '/register';
  const isHowItWorksRoute = pathname === '/how-it-works';
  const isPortfolioRoute = pathname === '/portfolio';
  const balanceLabel = user
    ? `${new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ru-RU', { maximumFractionDigits: user.balance >= 100 ? 0 : 2 }).format(user.balance)} pt`
    : '';
  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? '';
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') ?? '');
  const [menuOpen, setMenuOpen] = useState(false);
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchQuery(searchParams.get('q') ?? '');
  }, [searchParams]);

  // Close the account menu on navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Close the account menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;

    const handlePointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditableTarget = target
        && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditableTarget) {
        event.preventDefault();
        desktopSearchRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleShortcut);

    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);

    if (pathname === '/') {
      const nextParams = new URLSearchParams(searchParams);
      const trimmedValue = value.trim();

      if (trimmedValue) {
        nextParams.set('q', value);
      } else {
        nextParams.delete('q');
      }

      setSearchParams(nextParams, { replace: true });
    }
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = searchQuery.trim();

    navigate(trimmedQuery ? `/?q=${encodeURIComponent(trimmedQuery)}` : '/');
  };

  const handleSearchClear = () => {
    setSearchQuery('');

    if (pathname === '/') {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('q');
      setSearchParams(nextParams, { replace: true });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="sticky top-0 z-50 border-b border-pm-border bg-pm-bg"
    >
      <div className="px-3 py-2.5 sm:px-6 sm:py-3">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <Link to="/" className="flex shrink-0 items-center gap-2 outline-none">
            <motion.div whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }}>
              <svg
                width="28"
                height="28"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-pm-text-strong"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M16 2.66663L3.33331 9.99996V24.6666L16 31.9999L28.6666 24.6666V9.99996L16 2.66663ZM16 5.3333L5.33331 11.5L16 17.6666L26.6666 11.5L16 5.3333ZM5.33331 13.8L15 19.4V30.3333L5.33331 24.6666V13.8Z"
                  fill="currentColor"
                />
              </svg>
            </motion.div>
            <span className="text-base font-semibold text-pm-text-strong sm:text-lg">Legio</span>
          </Link>

          <form
            role="search"
            onSubmit={handleSearchSubmit}
            className="hidden max-w-2xl flex-1 items-center rounded-full border border-transparent bg-pm-surface px-4 py-2 transition-colors focus-within:border-pm-border focus-within:bg-pm-bg md:flex"
          >
            <Search className="mr-3 h-5 w-5 text-pm-text-muted" />
            <input
              ref={desktopSearchRef}
              value={searchQuery}
              onChange={(event) => handleSearchChange(event.target.value)}
              type="text"
              aria-label={t('common.searchMarkets')}
              placeholder={t('nav.searchPlaceholder')}
              className="w-full bg-transparent text-sm text-pm-text-strong outline-none placeholder:text-pm-text-muted"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={handleSearchClear}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-pm-text-muted transition-colors hover:bg-pm-surface-hover hover:text-pm-text-strong"
                aria-label={t('common.clearSearch')}
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <span className="rounded bg-pm-surface-hover px-1.5 py-0.5 text-xs text-pm-text-muted">/</span>
            )}
          </form>

          <div className="flex shrink-0 items-center gap-2">
            {user && (
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                <Link
                  to="/portfolio"
                  title={t('nav.portfolio')}
                  aria-label={t('nav.portfolio')}
                  className={
                    isPortfolioRoute
                      ? 'inline-flex h-10 items-center gap-2 rounded-2xl bg-pm-blue px-3 text-sm font-bold text-white'
                      : 'inline-flex h-10 items-center gap-2 rounded-2xl border border-pm-border bg-pm-surface px-3 text-sm font-bold text-pm-text-strong transition-colors hover:bg-pm-surface-hover'
                  }
                >
                  <PieChart className="h-4 w-4 text-pm-blue" />
                  <span className="tabular-nums">{balanceLabel}</span>
                </Link>
              </motion.div>
            )}

            {!user && (
              <Link
                to="/register"
                className="hidden h-10 items-center rounded-2xl bg-pm-blue px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:inline-flex"
              >
                {t('common.register')}
              </Link>
            )}

            {/* Single account / settings menu — collapses the toolbar into one control. */}
            <div className="relative" ref={menuRef}>
              <motion.button
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={t('nav.menu')}
                className="flex h-10 items-center gap-1.5 rounded-2xl border border-pm-border bg-pm-surface pl-1.5 pr-2 text-pm-text transition-colors hover:bg-pm-surface-hover"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pm-blue text-xs font-bold text-white">
                  {user ? initial : <UserRound className="h-4 w-4" />}
                </span>
                <ChevronDown className={`h-4 w-4 text-pm-text-muted transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
              </motion.button>

              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.12 }}
                  role="menu"
                  className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-pm-border bg-pm-surface p-2 shadow-[0_18px_44px_var(--color-pm-card-shadow-strong)]"
                >
                  {user && (
                    <div className="mb-1 flex items-center gap-2.5 rounded-xl px-3 py-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pm-blue text-sm font-bold text-white">
                        {initial}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 text-sm font-bold text-pm-text-strong">
                          <span className="truncate">{user.name}</span>
                          {user.isAdmin && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-pm-green" />}
                        </div>
                        <div className="text-xs font-semibold text-pm-text-muted">{balanceLabel}</div>
                      </div>
                    </div>
                  )}

                  {user && <div className="my-1 h-px bg-pm-border" />}

                  {user && (
                    <Link to="/portfolio" className={menuItemClass} role="menuitem">
                      <PieChart className="h-4 w-4 text-pm-blue" />
                      {t('nav.portfolio')}
                    </Link>
                  )}
                  {user?.isAdmin && (
                    <Link to="/create" className={menuItemClass} role="menuitem">
                      <PlusCircle className="h-4 w-4 text-pm-blue" />
                      {t('common.createMarket')}
                    </Link>
                  )}
                  {user?.isAdmin && (
                    <Link to="/admin" className={menuItemClass} role="menuitem">
                      <LayoutDashboard className="h-4 w-4 text-pm-blue" />
                      {t('nav.adminPanel')}
                    </Link>
                  )}
                  <Link to="/how-it-works" className={menuItemClass} role="menuitem">
                    <Info className="h-4 w-4 text-pm-blue" />
                    {t('nav.howItWorks')}
                  </Link>

                  <div className="my-1 h-px bg-pm-border" />

                  <button type="button" onClick={onThemeToggle} className={menuItemClass} role="menuitem">
                    {isLightTheme ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                    {isLightTheme ? t('nav.darkTheme') : t('nav.lightTheme')}
                  </button>
                  <button type="button" onClick={toggleLanguage} className={menuItemClass} role="menuitem">
                    <Globe className="h-4 w-4" />
                    {language === 'ru' ? 'English' : 'Русский'}
                  </button>

                  <div className="my-1 h-px bg-pm-border" />

                  {user ? (
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); logout(); }}
                      className={`${menuItemClass} text-pm-red hover:text-pm-red`}
                      role="menuitem"
                    >
                      <LogOut className="h-4 w-4" />
                      {t('nav.logout')}
                    </button>
                  ) : (
                    <>
                      <Link to="/login" className={menuItemClass} role="menuitem">
                        <UserRound className="h-4 w-4" />
                        {t('common.login')}
                      </Link>
                      <Link to="/register" className={`${menuItemClass} text-pm-blue hover:text-pm-blue`} role="menuitem">
                        <PlusCircle className="h-4 w-4" />
                        {t('common.register')}
                      </Link>
                    </>
                  )}
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {!isAuthRoute && (
          <div className="no-scrollbar mt-3 flex items-center gap-4 overflow-x-auto border-t border-pm-border pt-3 text-sm font-medium text-pm-text-muted sm:gap-6">
            <Link
              to="/?sort=trending"
              className={
                pathname === '/' && (searchParams.get('sort') ?? 'trending') === 'trending'
                  ? 'flex items-center gap-1 whitespace-nowrap text-pm-text-strong'
                  : 'flex items-center gap-1 whitespace-nowrap transition-colors hover:text-pm-text-strong'
              }
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
              {t('nav.trends')}
            </Link>
            <Link
              to="/?sort=new"
              className={
                pathname === '/' && searchParams.get('sort') === 'new'
                  ? 'whitespace-nowrap text-pm-text-strong'
                  : 'whitespace-nowrap transition-colors hover:text-pm-text-strong'
              }
            >
              {t('nav.new')}
            </Link>
            <div className="mx-1 h-4 w-px bg-pm-border" />
            {navCategoryValues.map((item) => (
              <Link key={item} to={`/?category=${encodeURIComponent(item)}`} className="whitespace-nowrap transition-colors hover:text-pm-text-strong">
                {categoryLabel(item)}
              </Link>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
