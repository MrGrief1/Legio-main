
import React from 'react';
import { getCategoryIcon } from '../constants';
import { LevelProgress } from './LevelProgress';
import { SettingsModal } from './SettingsModal';
import { AuthModal } from './AuthModal';
import { Avatar } from './Avatar';
import { MessageSquare, Info, Search, Shield, Trophy, BarChart3, AlertCircle, MessageCircle, Heart, PlusCircle, ListChecks, Vote, Settings, LogOut, LogIn } from 'lucide-react';
import { Input } from './UI';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { API_URL } from '../config';

// Which nav entry to highlight. Matches the app views plus the two feed shortcuts
// ('feed' / 'favorites') and, for category buttons, the raw category id.
export type SidebarNavKey = string;

// 'auto'   – only when the right panel (which hosts the full auth card) is hidden, i.e. below xl.
// 'always' – the right panel is not rendered at all for this view, so the sidebar always owns it.
// 'never'  – the mobile menu already shows the full auth card above the nav.
export type SidebarAccountVisibility = 'auto' | 'always' | 'never';

// Где показывать виджет «Прогресс». Он же живёт в правой панели под карточкой профиля, но панель
// рендерится только с xl и не на всех экранах приложения — там, где её нет, виджет должен остаться
// в боковом меню, иначе уровень негде посмотреть.
// 'auto'   – скрыт с xl: правая панель показывает его сама.
// 'always' – правой панели тут нет вовсе, меню показывает виджет на любой ширине.
export type SidebarLevelVisibility = 'auto' | 'always';

interface SidebarProps {
  className?: string;
  showHeader?: boolean;
  activeKey?: SidebarNavKey;
  accountVisibility?: SidebarAccountVisibility;
  levelVisibility?: SidebarLevelVisibility;
  onAdminClick?: () => void;
  onCreatePollClick?: () => void;
  onManagePollsClick?: () => void;
  onFeedClick?: () => void;
  onOpenPollsClick?: () => void;
  onLeaderboardClick?: () => void;
  onStatisticsClick?: () => void;
  onErrorReportsClick?: () => void;
  onChatsClick?: () => void;
  onInfoClick?: () => void;
  onCategorySelect?: (id: string) => void;
  onSearch?: (query: string) => void;
}


type SidebarCategory = {
  id: string;
  name: string;
  count: number;
};

// Shared nav button styling. The transparent border on inactive items keeps every row the same
// height as the active one, so switching tabs doesn't shift the list.
const navItemClass = (isActive: boolean) => [
  'flex items-center gap-3 w-full px-3.5 lg:px-4 py-2.5 lg:py-3 rounded-full text-sm font-medium transition-colors',
  isActive
    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/20'
    : 'border border-transparent text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900',
].join(' ');

// Compact account block: avatar, points, settings and logout (or a login button when signed out).
// Keeps profile controls reachable at widths where the right panel is hidden.
const SidebarAccount: React.FC = () => {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isAuthOpen, setIsAuthOpen] = React.useState(false);

  // Signing in swaps this block to the profile view, which unmounts the auth dialog before it can
  // close itself. Reset the flag here, or the dialog would pop straight back open after a logout.
  React.useEffect(() => {
    if (user) setIsAuthOpen(false);
  }, [user]);

  if (!user) {
    return (
      <>
        <button
          onClick={() => setIsAuthOpen(true)}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 mb-6 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black text-sm font-bold hover:opacity-90 transition-opacity"
        >
          <LogIn size={16} className="shrink-0" />
          <span className="truncate">{t.auth.loginButton}</span>
        </button>

        <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div className="mb-6 flex items-center gap-2.5 p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800">
        <Avatar src={user.avatar} alt={user.username} size={40} fallbackText={user.name || user.username} />

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
            {user.name || user.username}
          </div>
          <div className="text-xs font-medium text-blue-500 dark:text-blue-400">
            {user.points?.toLocaleString() || 0} {t.points}
          </div>
        </div>

        <div className="flex items-center shrink-0">
          <button
            onClick={() => setIsSettingsOpen(true)}
            title={t.settings.title}
            aria-label={t.settings.title}
            className="p-1.5 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={logout}
            title={t.auth.logout}
            aria-label={t.auth.logout}
            className="p-1.5 rounded-full text-zinc-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ className = '', showHeader = true, activeKey = 'feed', accountVisibility = 'auto', levelVisibility = 'auto', onAdminClick, onCreatePollClick, onManagePollsClick, onFeedClick, onOpenPollsClick, onLeaderboardClick, onStatisticsClick, onErrorReportsClick, onChatsClick, onInfoClick, onCategorySelect, onSearch }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [categories, setCategories] = React.useState<SidebarCategory[]>([]);

  // The sidebar used to fetch /api/leaders here and never render the result — a wasted request on
  // every mount, and the sidebar mounts twice (desktop column + mobile menu). The leaderboard lives
  // in the right panel and on its own page; nothing here needs it.
  React.useEffect(() => {
    fetch(`${API_URL}/categories`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch categories');
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setCategories(data.filter((item) => item && item.id).map((item) => ({
            id: String(item.id),
            name: String(item.name || item.id),
            count: Number(item.count || 0),
          })));
        } else {
          setCategories([]);
        }
      })
      .catch(err => {
        console.error(err);
        setCategories([]);
      });
  }, []);

  return (
    <aside className={`flex flex-col w-full pt-6 lg:pt-8 pb-6 px-3 lg:px-4 ${className}`}>
      {/* Logo Area */}
      {showHeader && (
        <div className="flex items-center justify-between gap-2 mb-6 lg:mb-8 px-1 lg:px-2">
          <div className="flex items-center gap-2 lg:gap-3 min-w-0 cursor-pointer" onClick={onFeedClick}>
            {/* Custom SVG Icon based on user image */}
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-9 h-9 lg:w-[42px] lg:h-[42px] shrink-0">
              {/* Chat Bubble Outline */}
              <path d="M36 19C36 28.5 28 36 19 36C16.5 36 14 35.5 12 34.5L4 37L6.5 29C4.5 26.5 4 23 4 19C4 10 11 3 20 3C29 3 36 10 36 19Z" stroke="currentColor" strokeWidth="2.5" className="text-black dark:text-white" strokeLinecap="round" strokeLinejoin="round" />

              {/* Bar Chart Inside */}
              {/* Left Bar */}
              <rect x="12" y="19" width="4" height="8" rx="1.5" className="fill-black dark:fill-white" />
              {/* Middle Bar (Blue) */}
              <rect x="18" y="12" width="4" height="15" rx="1.5" fill="#06b6d4" />
              {/* Right Bar */}
              <rect x="24" y="16" width="4" height="11" rx="1.5" className="fill-black dark:fill-white" />
            </svg>

            {/* Text with specific font */}
            {/* No `truncate` here: it sets overflow:hidden, and an italic serif "g" descends below
                the line box — so the bottom of the wordmark was being clipped. The text is a fixed
                five characters, so there is nothing to truncate anyway. `leading-normal` gives the
                descender room; pb-1 keeps it clear of the container edge. */}
            <h1 className="text-3xl lg:text-4xl font-serif italic font-medium tracking-tight text-black dark:text-white leading-normal pt-1 pb-1 whitespace-nowrap">Legio</h1>
          </div>
        </div>
      )}

      {/* Intro Text — dropped on narrow desktops to keep the nav above the fold */}
      {showHeader && (
        <div className="hidden xl:block px-2 mb-6">
          <p className="text-xs text-zinc-500 dark:text-zinc-500 leading-relaxed">
            {t.sidebar.tagline}
          </p>
        </div>
      )}

      {/* Account (profile / login) */}
      {accountVisibility !== 'never' && (
        <div className={accountVisibility === 'auto' ? 'xl:hidden' : ''}>
          <SidebarAccount />
        </div>
      )}

      {/* Main Nav */}
      <div className="space-y-1.5 mb-6">
        <button onClick={onFeedClick} className={navItemClass(activeKey === 'feed')}>
          <MessageSquare size={18} className="shrink-0" />
          <span className="truncate">{t.sidebar.latestNews}</span>
        </button>

        <button
          onClick={onOpenPollsClick}
          className={navItemClass(activeKey === 'open-polls')}
        >
          <Vote size={18} className="shrink-0" />
          <span className="truncate">{t.sidebar.openPolls}</span>
        </button>

        <button
          onClick={() => onCategorySelect && onCategorySelect('favorites')}
          className={navItemClass(activeKey === 'favorites')}
        >
          <Heart size={18} className="shrink-0" />
          <span className="truncate">{t.sidebar.favorites}</span>
        </button>

        {/* Чат скрыт
        <button
          onClick={onChatsClick}
          className={navItemClass(false)}
        >
          <MessageCircle size={18} className="shrink-0" />
          <span className="truncate">{t.sidebar.chats || "Chats"}</span>
        </button>
        */}

        <button onClick={onLeaderboardClick} className={navItemClass(activeKey === 'leaderboard')}>
          <Trophy size={18} className="shrink-0" />
          <span className="truncate">{t.sidebar.leaderboard}</span>
        </button>

        {user && (user.role === 'admin' || user.role === 'creator') && (
          <>
            <button onClick={onCreatePollClick} className={navItemClass(activeKey === 'create')}>
              <PlusCircle size={18} className="shrink-0" />
              <span className="truncate">{t.sidebar.createPoll}</span>
            </button>

            <button onClick={onManagePollsClick} className={navItemClass(activeKey === 'manage')}>
              <ListChecks size={18} className="shrink-0" />
              <span className="truncate">{t.sidebar.managePolls}</span>
            </button>
          </>
        )}

        {user && user.role === 'admin' && (
          <>
            <button onClick={onAdminClick} className={navItemClass(activeKey === 'admin')}>
              <Shield size={18} className="shrink-0" />
              <span className="truncate">{t.sidebar.adminPanel}</span>
            </button>

            <button onClick={onStatisticsClick} className={navItemClass(activeKey === 'statistics')}>
              <BarChart3 size={18} className="shrink-0" />
              <span className="truncate">{t.sidebar.statistics}</span>
            </button>

            <button onClick={onErrorReportsClick} className={navItemClass(activeKey === 'reports')}>
              <AlertCircle size={18} className="shrink-0" />
              <span className="truncate">{t.sidebar.errorReports}</span>
            </button>
          </>
        )}

        <button onClick={onInfoClick} className={navItemClass(activeKey === 'info')}>
          <Info size={18} className="shrink-0" />
          <span className="truncate">{t.sidebar.information}</span>
        </button>
      </div>

      {/* Progress Widget — та же карточка, что и в правой панели; здесь она нужна только там,
          где правой панели нет (мобильное меню и ширины ниже xl). */}
      <LevelProgress className={`mb-6 ${levelVisibility === 'auto' ? 'xl:hidden' : ''}`} />

      {/* Search */}
      <div className="mb-6">
        <Input
          placeholder={t.sidebar.searchPlaceholder}
          icon={<Search size={16} />}
          className="bg-white dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 !py-2.5"
          onChange={(e) => onSearch && onSearch(e.target.value)}
        />
      </div>

      {/* Categories */}
      <div className="px-3 mb-2">
        <h3 className="text-[11px] font-bold text-zinc-500 dark:text-zinc-600 uppercase tracking-widest">{t.sidebar.categories}</h3>
      </div>
      <div className="space-y-1">
        {categories.map((cat) => {
          const CategoryIcon = getCategoryIcon(cat.id);
          const isActive = activeKey === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onCategorySelect && onCategorySelect(cat.id)}
              className={`flex items-center gap-3 w-full px-3.5 lg:px-4 py-2.5 rounded-full text-sm transition-colors group ${isActive
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/5'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900'
                }`}
            >
              <span className={`shrink-0 transition-colors ${isActive ? 'text-blue-500' : 'text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-400'}`}>
                <CategoryIcon size={18} />
              </span>
              <span className="truncate">{cat.name}</span>
            </button>
          );
        })}
      </div>

    </aside>
  );
};
