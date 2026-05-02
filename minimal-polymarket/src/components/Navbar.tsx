import { Link, useLocation } from 'react-router-dom';
import {
  Globe,
  House,
  Info,
  LayoutDashboard,
  LogOut,
  Moon,
  PlusCircle,
  Search,
  ShieldCheck,
  Sun,
  UserRound,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../lib/auth';

type NavbarProps = {
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
};

const categoryItems = ['Политика', 'Спорт', 'Криптовалюта', 'Финансы', 'Геополитика', 'Технологии'];

function squareLinkClass(isActive: boolean) {
  return isActive
    ? 'flex h-10 w-10 items-center justify-center rounded-lg bg-pm-blue text-white'
    : 'flex h-10 w-10 items-center justify-center rounded-lg bg-pm-surface text-pm-text transition-colors hover:bg-pm-surface-hover hover:text-pm-text-strong';
}

function dockLinkClass(isActive: boolean) {
  return isActive
    ? 'flex h-12 items-center justify-center gap-2 rounded-lg bg-pm-blue text-sm font-bold text-white'
    : 'flex h-12 items-center justify-center gap-2 rounded-lg text-sm font-bold text-pm-text-muted transition-colors hover:bg-pm-surface hover:text-pm-text-strong';
}

export function Navbar({ theme, onThemeToggle }: NavbarProps) {
  const isLightTheme = theme === 'light';
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const isAuthRoute = pathname === '/login' || pathname === '/register';
  const isAdminRoute = pathname === '/admin';
  const isCreateRoute = pathname === '/create';

  return (
    <>
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
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
              <span className="hidden text-lg font-semibold text-pm-text-strong sm:block">Polymarket</span>
              <span className="text-base font-semibold text-pm-text-strong sm:hidden">Legio</span>
            </Link>

            <div className="hidden max-w-2xl flex-1 items-center rounded-full border border-transparent bg-pm-surface px-4 py-2 transition-colors focus-within:border-pm-border focus-within:bg-pm-bg md:flex">
              <Search className="mr-3 h-5 w-5 text-pm-text-muted" />
              <input
                type="text"
                placeholder="Поиск рынков..."
                className="w-full bg-transparent text-sm text-pm-text-strong outline-none placeholder:text-pm-text-muted"
              />
              <span className="rounded bg-pm-surface-hover px-1.5 py-0.5 text-xs text-pm-text-muted">/</span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-pm-text transition-colors hover:bg-pm-surface hover:text-pm-text-strong lg:flex"
              >
                <Info className="h-4 w-4 text-pm-blue" />
                Как это работает
              </motion.button>

              {user ? (
                <>
                  {user.isAdmin && (
                    <>
                      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="sm:hidden">
                        <Link
                          to="/admin"
                          aria-label="Админ-панель"
                          title="Админ-панель"
                          className={squareLinkClass(isAdminRoute)}
                        >
                          <LayoutDashboard className="h-5 w-5" />
                        </Link>
                      </motion.div>
                      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="sm:hidden">
                        <Link
                          to="/create"
                          aria-label="Создать рынок"
                          title="Создать рынок"
                          className={squareLinkClass(isCreateRoute)}
                        >
                          <PlusCircle className="h-5 w-5" />
                        </Link>
                      </motion.div>
                      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="hidden sm:block">
                        <Link
                          to="/admin"
                          className="inline-flex items-center gap-2 rounded-lg border border-pm-border bg-pm-surface px-3 py-2 text-sm font-semibold text-pm-text-strong transition-colors hover:bg-pm-surface-hover"
                        >
                          <LayoutDashboard className="h-4 w-4 text-pm-blue" />
                          Админка
                        </Link>
                      </motion.div>
                      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="hidden sm:block">
                        <Link
                          to="/create"
                          className="inline-flex items-center gap-2 rounded-lg bg-pm-blue px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                        >
                          <PlusCircle className="h-4 w-4" />
                          Создать
                        </Link>
                      </motion.div>
                    </>
                  )}

                  <div className="hidden max-w-[180px] items-center gap-2 text-sm font-semibold text-pm-text-strong md:flex">
                    <span className="truncate">{user.name}</span>
                    {user.isAdmin && <ShieldCheck className="h-4 w-4 shrink-0 text-pm-green" />}
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={logout}
                    aria-label="Выйти"
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-pm-surface text-pm-text transition-colors hover:bg-pm-surface-hover hover:text-pm-text-strong"
                  >
                    <LogOut className="h-5 w-5" />
                  </motion.button>
                </>
              ) : (
                <>
                  <motion.div whileHover={{ scale: 1.05 }} className="hidden sm:block">
                    <Link
                      to="/login"
                      className={
                        pathname === '/login'
                          ? 'inline-flex px-4 py-2 text-sm font-semibold text-pm-text-strong'
                          : 'inline-flex px-4 py-2 text-sm font-semibold text-pm-text hover:text-pm-text-strong'
                      }
                    >
                      Войти
                    </Link>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="hidden sm:block">
                    <Link
                      to="/register"
                      className="inline-flex rounded-lg bg-pm-blue px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                    >
                      Зарегистрироваться
                    </Link>
                  </motion.div>
                  <Link
                    to="/login"
                    aria-label="Войти"
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-pm-surface text-pm-text transition-colors hover:bg-pm-surface-hover hover:text-pm-text-strong sm:hidden"
                  >
                    <UserRound className="h-5 w-5" />
                  </Link>
                </>
              )}

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label={isLightTheme ? 'Включить тёмную тему' : 'Включить светлую тему'}
                title={isLightTheme ? 'Тёмная тема' : 'Светлая тема'}
                onClick={onThemeToggle}
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-pm-surface text-pm-text transition-colors hover:bg-pm-surface-hover hover:text-pm-text-strong"
              >
                {isLightTheme ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="Выбор языка"
                className="hidden h-10 w-10 items-center justify-center rounded-lg bg-pm-surface text-pm-text transition-colors hover:bg-pm-surface-hover hover:text-pm-text-strong sm:flex"
              >
                <Globe className="h-5 w-5" />
              </motion.button>
            </div>
          </div>

          {!isAuthRoute && (
            <div className="no-scrollbar mt-3 flex items-center gap-4 overflow-x-auto border-t border-pm-border pt-3 text-sm font-medium text-pm-text-muted sm:gap-6">
              <Link to="/" className="flex items-center gap-1 whitespace-nowrap text-pm-text-strong">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                  <polyline points="16 7 22 7 22 13" />
                </svg>
                Тенденции
              </Link>
              <button className="whitespace-nowrap transition-colors hover:text-pm-text-strong">Новое</button>
              <div className="mx-1 h-4 w-px bg-pm-border" />
              {categoryItems.map((item) => (
                <button key={item} className="whitespace-nowrap transition-colors hover:text-pm-text-strong">
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {user?.isAdmin && !isAuthRoute && (
        <nav
          className="fixed inset-x-0 bottom-0 z-50 border-t border-pm-border bg-pm-bg/95 px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 shadow-[0_-10px_30px_var(--color-pm-card-shadow-strong)] backdrop-blur sm:hidden"
          aria-label="Мобильная админ-навигация"
        >
          <div className="mx-auto grid max-w-sm grid-cols-3 gap-2">
            <Link to="/" className={pathname === '/' ? 'flex h-12 items-center justify-center gap-2 rounded-lg bg-pm-surface-hover text-sm font-bold text-pm-text-strong' : dockLinkClass(false)}>
              <House className="h-4 w-4" />
              Рынки
            </Link>
            <Link to="/admin" className={dockLinkClass(isAdminRoute)}>
              <LayoutDashboard className="h-4 w-4" />
              Панель
            </Link>
            <Link to="/create" className={dockLinkClass(isCreateRoute)}>
              <PlusCircle className="h-4 w-4" />
              Создать
            </Link>
          </div>
        </nav>
      )}
    </>
  );
}
