import { Link, useLocation } from 'react-router-dom';
import { Search, Info, Globe, Moon, Sun, UserRound } from 'lucide-react';
import { motion } from 'motion/react';

type NavbarProps = {
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
};

export function Navbar({ theme, onThemeToggle }: NavbarProps) {
  const isLightTheme = theme === 'light';
  const { pathname } = useLocation();
  const isAuthRoute = pathname === '/login' || pathname === '/register';

  return (
    <motion.div 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 bg-pm-bg border-b border-pm-border"
    >
      <div className="px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <Link to="/" className="flex items-center gap-2 shrink-0 outline-none">
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
            <span className="font-semibold text-lg hidden sm:block text-pm-text-strong">Polymarket</span>
          </Link>

          {/* Search Bar */}
          <div className="flex-1 max-w-2xl hidden md:flex items-center bg-pm-surface rounded-full px-4 py-2 border border-transparent focus-within:border-pm-border focus-within:bg-pm-bg transition-colors">
            <Search className="w-5 h-5 text-pm-text-muted mr-3" />
            <input
              type="text"
              placeholder="Поиск polymarkets..."
              className="w-full bg-transparent text-sm outline-none text-pm-text-strong placeholder:text-pm-text-muted"
            />
            <span className="text-pm-text-muted text-xs bg-pm-surface-hover px-1.5 py-0.5 rounded">/</span>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <motion.button whileHover={{ scale: 1.05 }} className="hidden lg:flex items-center gap-1.5 text-sm text-pm-text hover:text-pm-text-strong font-medium px-3 py-2 rounded-lg hover:bg-pm-surface transition-colors">
              <Info className="w-4 h-4 text-pm-blue" />
              Как это работает
            </motion.button>
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
              className="p-2 text-pm-text hover:text-pm-text-strong bg-pm-surface hover:bg-pm-surface-hover rounded-lg transition-colors sm:hidden"
            >
              <UserRound className="w-5 h-5" />
            </Link>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              aria-label={isLightTheme ? 'Включить тёмную тему' : 'Включить светлую тему'}
              title={isLightTheme ? 'Тёмная тема' : 'Светлая тема'}
              onClick={onThemeToggle}
              className="p-2 text-pm-text hover:text-pm-text-strong bg-pm-surface hover:bg-pm-surface-hover rounded-lg transition-colors"
            >
              {isLightTheme ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </motion.button>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="p-2 text-pm-text hover:text-pm-text-strong bg-pm-surface hover:bg-pm-surface-hover rounded-lg transition-colors">
              <Globe className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {!isAuthRoute && (
          <div className="flex items-center gap-6 mt-4 overflow-x-auto no-scrollbar text-sm font-medium text-pm-text-muted border-t border-pm-border pt-3">
            <Link to="/" className="text-pm-text-strong whitespace-nowrap hidden sm:flex items-center gap-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>
              Тенденции
            </Link>
            <button className="hover:text-pm-text-strong whitespace-nowrap transition-colors">Последние новости</button>
            <button className="hover:text-pm-text-strong whitespace-nowrap transition-colors">Новое</button>
            <div className="w-px h-4 bg-pm-border mx-1"></div>
            <button className="hover:text-pm-text-strong whitespace-nowrap transition-colors">Политика</button>
            <button className="hover:text-pm-text-strong whitespace-nowrap transition-colors">Спорт</button>
            <button className="hover:text-pm-text-strong whitespace-nowrap transition-colors">Криптовалюта</button>
            <button className="hover:text-pm-text-strong whitespace-nowrap transition-colors">Киберспорт</button>
            <button className="hover:text-pm-text-strong whitespace-nowrap transition-colors">Иран</button>
            <button className="hover:text-pm-text-strong whitespace-nowrap transition-colors">Финансы</button>
            <button className="hover:text-pm-text-strong whitespace-nowrap transition-colors">Геополитика</button>
            <button className="hover:text-pm-text-strong whitespace-nowrap transition-colors">Технологии</button>
            <button className="hover:text-pm-text-strong whitespace-nowrap transition-colors">Культура</button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
