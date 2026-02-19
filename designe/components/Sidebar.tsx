
import React from 'react';
import { LEVELS, getLevel } from '../constants';
import { LevelsModal } from './LevelsModal';
import { MessageSquare, Info, Search, Moon, Sun, Shield, Trophy, BarChart3, AlertCircle, MessageCircle, Heart, Newspaper } from 'lucide-react';
import { Input } from './UI';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { API_URL } from '../config';

interface SidebarProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  className?: string;
  showHeader?: boolean;
  onAdminClick?: () => void;
  onFeedClick?: () => void;
  onLeaderboardClick?: () => void;
  onStatisticsClick?: () => void;
  onErrorReportsClick?: () => void;
  onChatsClick?: () => void;
  onInfoClick?: () => void;
  onCategorySelect?: (id: string) => void;
  onSearch?: (query: string) => void;
}

import { User } from '../types';

type SidebarCategory = {
  id: string;
  name: string;
  count: number;
};

export const Sidebar: React.FC<SidebarProps> = ({ theme, toggleTheme, className = '', showHeader = true, onAdminClick, onFeedClick, onLeaderboardClick, onStatisticsClick, onErrorReportsClick, onChatsClick, onInfoClick, onCategorySelect, onSearch }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [leaders, setLeaders] = React.useState<User[]>([]);
  const [categories, setCategories] = React.useState<SidebarCategory[]>([]);
  const [isLevelsModalOpen, setIsLevelsModalOpen] = React.useState(false);

  React.useEffect(() => {
    fetch(`${API_URL}/leaders`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setLeaders(data);
        } else {
          setLeaders([]);
        }
      })
      .catch(err => {
        console.error(err);
        setLeaders([]);
      });

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
    <aside className={`flex flex-col w-full pt-8 pb-6 px-4 ${className}`}>
      {/* Logo Area */}
      {showHeader && (
        <div className="flex items-center justify-between mb-10 px-2">
          <div className="flex items-center gap-3 cursor-pointer" onClick={onFeedClick}>
            {/* Custom SVG Icon based on user image */}
            <svg width="42" height="42" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
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
            <h1 className="text-4xl font-serif italic font-medium tracking-tight text-black dark:text-white pt-1">Legio</h1>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      )}

      {/* Intro Text */}
      {showHeader && (
        <div className="px-2 mb-8">
          <p className="text-xs text-zinc-500 dark:text-zinc-500 leading-relaxed">
            {t.sidebar.tagline}
          </p>
        </div>
      )}

      {/* Main Nav */}
      <div className="space-y-2 mb-8">
        <button
          onClick={onFeedClick}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-full text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/10 hover:border-blue-200 dark:hover:border-blue-500/20 transition-colors text-sm font-medium"
        >
          <MessageSquare size={18} />
          {t.sidebar.projectNews}
        </button>

        <button
          onClick={() => onCategorySelect && onCategorySelect('favorites')}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-full text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-sm font-medium"
        >
          <Heart size={18} />
          Избранное
        </button>

        <button
          onClick={onChatsClick}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-full text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-sm font-medium"
        >
          <MessageCircle size={18} />
          {/* Use a translation key if available, otherwise fallback string */}
          {t.sidebar.chats || "Chats"}
        </button>

        <button
          onClick={onLeaderboardClick}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-full text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-sm font-medium"
        >
          <Trophy size={18} />
          {t.sidebar.leaderboard}
        </button>

        {user && (user.role === 'admin' || user.role === 'creator') && (
          <button
            onClick={onAdminClick}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-full text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-sm font-medium"
          >
            <Shield size={18} />
            {t.sidebar.adminPanel}
          </button>
        )}

        {user && user.role === 'admin' && (
          <>
            <button
              onClick={onStatisticsClick}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-full text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-sm font-medium"
            >
              <BarChart3 size={18} />
              {t.sidebar.statistics}
            </button>

            <button
              onClick={onErrorReportsClick}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-full text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-sm font-medium"
            >
              <AlertCircle size={18} />
              {t.sidebar.errorReports}
            </button>
          </>
        )}

        <button
          onClick={onInfoClick}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-full text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-sm font-medium"
        >
          <Info size={18} />
          {t.sidebar.information}
        </button>
      </div>

      {/* Progress Widget */}
      {user && (
        <div
          className="mb-8 bg-zinc-100 dark:bg-zinc-800/50 rounded-2xl p-4 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          onClick={() => setIsLevelsModalOpen(true)}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Trophy size={16} />
              </div>
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Прогресс</div>
                <div className="text-sm font-bold text-zinc-900 dark:text-white">{getLevel(user.points || 0).name}</div>
              </div>
            </div>
            <div className="text-sm font-mono font-medium text-zinc-500">
              {user.points?.toLocaleString() || 0}
            </div>
          </div>

          <div className="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-1000"
              style={{
                width: `${Math.min(100, Math.max(0, ((user.points || 0) - getLevel(user.points || 0).minPoints) / ((LEVELS[getLevel(user.points || 0).id]?.minPoints || (getLevel(user.points || 0).minPoints * 2)) - getLevel(user.points || 0).minPoints) * 100))}%`
              }}
            />
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-8">
        <Input
          placeholder={t.sidebar.searchPlaceholder}
          icon={<Search size={16} />}
          className="bg-white dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800"
          onChange={(e) => onSearch && onSearch(e.target.value)}
        />
      </div>

      {/* Categories */}
      <div className="px-3 mb-3">
        <h3 className="text-[11px] font-bold text-zinc-500 dark:text-zinc-600 uppercase tracking-widest">{t.sidebar.categories}</h3>
      </div>
      <div className="space-y-1">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onCategorySelect && onCategorySelect(cat.id)}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-full text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-sm group"
          >
            <span className="text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition-colors">
              <Newspaper size={18} />
            </span>
            {cat.name}
          </button>
        ))}
      </div>

      <LevelsModal isOpen={isLevelsModalOpen} onClose={() => setIsLevelsModalOpen(false)} />
    </aside>
  );
};
