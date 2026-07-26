
import React, { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Feed } from './components/Feed';
import { RightPanel } from './components/RightPanel';
import { AuthCard } from './components/AuthCard';
import { AdminPanel } from './components/AdminPanel';
import { CreatePoll } from './components/CreatePoll';
import { ManagePolls } from './components/ManagePolls';
import { Leaderboard } from './components/Leaderboard';
import { Statistics } from './components/Statistics';
import { ErrorReports } from './components/ErrorReports';
import { Information } from './components/Information';
import { ChatModal } from './components/ChatModal';
import { NewsModal } from './components/NewsModal';
import { Poll } from './components/FeedComponents';
import { NewsItem } from './types';
import { API_URL } from './config';
import { useScrollLock } from './hooks/useScrollLock';
import { Menu, X, Moon, Sun } from 'lucide-react';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { ToastProvider } from './context/ToastContext';
import { DialogProvider } from './context/DialogContext';

const AppContent: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [view, setView] = useState<'feed' | 'open-polls' | 'admin' | 'create' | 'manage' | 'leaderboard' | 'statistics' | 'reports' | 'info'>('feed');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [deepNews, setDeepNews] = useState<NewsItem | null>(null);
  const [deepNewsOpen, setDeepNewsOpen] = useState(false);

  // Toggle Theme Function
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);

    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };
  // ... (rest of useEffects)

  // Initialize theme based on system preference or default
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Lock body scroll when mobile menu is open
  useScrollLock(mobileMenuOpen);

  // The mobile menu is CSS-hidden from md up, but its scroll lock lives in React state. Close it
  // when the viewport grows so a resize/rotation can't leave the page frozen behind a menu that
  // is no longer visible.
  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const handleChange = () => {
      if (mediaQuery.matches) setMobileMenuOpen(false);
    };

    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Open a specific post when arriving via a shared /?news=<id> link.
  const fetchDeepNews = useCallback((id: string) => {
    const headers: Record<string, string> = {};
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    return fetch(`${API_URL}/news/${id}`, { headers })
      .then(res => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.id) {
          setDeepNews(data);
          setDeepNewsOpen(true);
        }
      })
      .catch(() => { /* ignore: fall back to the normal feed */ });
  }, []);

  useEffect(() => {
    const newsId = new URLSearchParams(window.location.search).get('news');
    if (newsId) fetchDeepNews(newsId);
  }, [fetchDeepNews]);

  const closeDeepNews = () => {
    setDeepNewsOpen(false);
    // Drop the ?news= param so a refresh/back doesn't reopen the post.
    const url = new URL(window.location.href);
    url.searchParams.delete('news');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const handleCategorySelect = (catId: string) => {
    setCategory(catId);
    setView('feed');
    setMobileMenuOpen(false);
  };

  // Which sidebar entry to highlight: the feed view splits into the "all news" tab, the favorites
  // shortcut and the category buttons, everything else maps straight to the view name.
  const activeNavKey = view === 'feed' ? (category === 'all' ? 'feed' : category) : view;

  // Statistics and the admin panel are wide data views: they take the full width, so the right
  // panel (and the auth card it carries) is absent — the sidebar has to own the account block in
  // that case. Squeezing the admin user table into max-w-3xl clips its right-hand columns.
  const isWideView = view === 'statistics' || view === 'admin';
  const rightPanelVisible = !isWideView;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white font-sans selection:bg-blue-100 dark:selection:bg-zinc-700 selection:text-blue-900 dark:selection:text-white transition-colors duration-300 overflow-x-hidden">

      {/* Background Light Effect (Spotlight) */}
      <div className="fixed inset-0 z-0 pointer-events-none flex justify-center overflow-hidden">
        {/* Dark Mode Spotlight - Optimized */}
        <div className={`transition-opacity duration-700 ${theme === 'dark' ? 'opacity-100' : 'opacity-0'}`}>
          <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[1200px] h-[800px] bg-[radial-gradient(closest-side,rgba(255,255,255,0.08),transparent)] pointer-events-none" />
          <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-white/5 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* Light Mode Ambient Glow - Optimized */}
        <div className={`transition-opacity duration-700 ${theme === 'light' ? 'opacity-100' : 'opacity-0'}`}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-blue-100/50 blur-3xl rounded-full -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      <div className="relative z-10 max-w-[1440px] mx-auto flex flex-col md:flex-row md:justify-center pt-16 md:pt-0">

        {/* Mobile Header */}
        <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-black/80 backdrop-blur-lg border-b border-zinc-200 dark:border-white/5 z-40 flex items-center justify-between px-4 transition-colors duration-300">
          <div className="flex items-center gap-3" onClick={() => { setView('feed'); setCategory('all'); }}>            <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M36 19C36 28.5 28 36 19 36C16.5 36 14 35.5 12 34.5L4 37L6.5 29C4.5 26.5 4 23 4 19C4 10 11 3 20 3C29 3 36 10 36 19Z" stroke="currentColor" strokeWidth="3" className="text-black dark:text-white" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="11" y="18" width="4" height="8" rx="1" className="fill-black dark:fill-white" />
            <rect x="18" y="11" width="4" height="15" rx="1" fill="#06b6d4" />
            <rect x="25" y="15" width="4" height="11" rx="1" className="fill-black dark:fill-white" />
          </svg>
            <span className="font-serif italic text-2xl font-bold">Legio</span>
          </div>
          <button onClick={() => setMobileMenuOpen(true)} className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors">
            <Menu />
          </button>
        </div>

        {/* Redesigned Mobile Menu Overlay (Full Screen) */}
        <div
          className={`fixed inset-0 z-50 bg-zinc-50 dark:bg-black overflow-y-auto transition-opacity duration-300 md:hidden ${mobileMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
            }`}
        >
          <div className="min-h-full flex flex-col p-4 pb-12">
            {/* Menu Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3" onClick={() => { setView('feed'); setMobileMenuOpen(false) }}>
                <svg width="36" height="36" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M36 19C36 28.5 28 36 19 36C16.5 36 14 35.5 12 34.5L4 37L6.5 29C4.5 26.5 4 23 4 19C4 10 11 3 20 3C29 3 36 10 36 19Z" stroke="currentColor" strokeWidth="3" className="text-black dark:text-white" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="11" y="18" width="4" height="8" rx="1" className="fill-black dark:fill-white" />
                  <rect x="18" y="11" width="4" height="15" rx="1" fill="#06b6d4" />
                  <rect x="25" y="15" width="4" height="11" rx="1" className="fill-black dark:fill-white" />
                </svg>
                <span className="font-serif italic text-3xl font-bold text-black dark:text-white">Legio</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleTheme}
                  className="p-3 rounded-full bg-zinc-200 dark:bg-zinc-900 text-zinc-900 dark:text-white"
                >
                  {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                </button>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-3 rounded-full bg-zinc-200 dark:bg-zinc-900 text-zinc-900 dark:text-white"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Auth Section on Mobile */}
            <div className="mb-8">
              <AuthCard />
            </div>

            <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800 mb-4" />

            {/* Reused Navigation Links */}
            <Sidebar
              theme={theme}
              toggleTheme={toggleTheme}
              className="!pt-0 !px-0 !h-auto overflow-visible"
              showHeader={false}
              activeKey={activeNavKey}
              accountVisibility="never"
              onAdminClick={() => { setView('admin'); setMobileMenuOpen(false) }}
              onCreatePollClick={() => { setView('create'); setMobileMenuOpen(false) }}
              onManagePollsClick={() => { setView('manage'); setMobileMenuOpen(false) }}
              onFeedClick={() => { setView('feed'); setCategory('all'); setMobileMenuOpen(false); }}
              onOpenPollsClick={() => { setView('open-polls'); setMobileMenuOpen(false) }}
              onLeaderboardClick={() => { setView('leaderboard'); setMobileMenuOpen(false) }}
              onStatisticsClick={() => { setView('statistics'); setMobileMenuOpen(false) }}
              onErrorReportsClick={() => { setView('reports'); setMobileMenuOpen(false) }}
              onChatsClick={() => { setChatOpen(true); setMobileMenuOpen(false); }}
              onInfoClick={() => { setView('info'); setMobileMenuOpen(false); }}
              onCategorySelect={handleCategorySelect}
              onSearch={setSearch}
            />
          </div>
        </div>

        {/* Desktop Sidebar — from md up, so narrow laptops keep the nav instead of falling back
            to the mobile burger menu.
            No h-screen/sticky/overflow-y-auto here on purpose: pinning the column to the viewport
            height gave it a second scrollbar and clipped whatever didn't fit — including the Legio
            logo at the top. The column now sizes to its content and scrolls with the page, so
            everything in it is reachable. */}
        <div className="hidden md:block w-60 lg:w-72 shrink-0">
          <Sidebar
            theme={theme}
            toggleTheme={toggleTheme}
            activeKey={activeNavKey}
            accountVisibility={rightPanelVisible ? 'auto' : 'always'}
            onAdminClick={() => setView('admin')}
            onCreatePollClick={() => setView('create')}
            onManagePollsClick={() => setView('manage')}
            onFeedClick={() => { setView('feed'); setCategory('all'); }}
            onOpenPollsClick={() => setView('open-polls')}
            onLeaderboardClick={() => setView('leaderboard')}
            onStatisticsClick={() => setView('statistics')}
            onErrorReportsClick={() => setView('reports')}
            onChatsClick={() => setChatOpen(true)}
            onInfoClick={() => setView('info')}
            onCategorySelect={handleCategorySelect}
            onSearch={setSearch}
          />
        </div>

        <div className={`flex-1 w-full min-w-0 ${isWideView ? '' : 'max-w-3xl'}`}>
          {view === 'feed' ? <Feed category={category} search={search} /> :
            view === 'open-polls' ? <Feed category="all" search={search} pollStatus="open" /> :
            view === 'admin' ? <div className="py-4 lg:py-8 px-3 md:px-4 lg:px-8"><AdminPanel /></div> :
              view === 'create' ? <div className="py-4 lg:py-8 px-3 md:px-4 lg:px-8"><CreatePoll /></div> :
              view === 'manage' ? <div className="py-4 lg:py-8 px-3 md:px-4 lg:px-8"><ManagePolls /></div> :
              view === 'statistics' ? <Statistics /> :
                view === 'reports' ? <ErrorReports /> :
                  view === 'info' ? <div className="py-4 lg:py-8 px-3 md:px-4 lg:px-8"><Information /></div> :
                    <div className="py-0 lg:py-8 px-0 md:px-4 lg:px-8"><Leaderboard /></div>}
        </div>

        {rightPanelVisible && <RightPanel />}
      </div>

      <ChatModal isOpen={chatOpen} onClose={() => setChatOpen(false)} />

      {deepNews && (
        <NewsModal
          item={deepNews}
          isOpen={deepNewsOpen}
          onClose={closeDeepNews}
          onRefresh={() => fetchDeepNews(String(deepNews.id))}
        >
          {deepNews.poll && <Poll data={deepNews.poll} onPollChange={() => fetchDeepNews(String(deepNews.id))} />}
        </NewsModal>
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <LanguageProvider>
        <ToastProvider>
          <DialogProvider>
            <AppContent />
          </DialogProvider>
        </ToastProvider>
      </LanguageProvider>
    </AuthProvider>
  );
};

export default App;
