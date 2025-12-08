
import React, { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Feed } from './components/Feed';
import { RightPanel } from './components/RightPanel';
import { AuthCard } from './components/AuthCard';
import { AdminPanel } from './components/AdminPanel';
import { Leaderboard } from './components/Leaderboard';
import { Statistics } from './components/Statistics';
import { ErrorReports } from './components/ErrorReports';
import { Information } from './components/Information';
import { ChatModal } from './components/ChatModal';
import { Menu, X, Moon, Sun } from 'lucide-react';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { ToastProvider } from './context/ToastContext';
import { DialogProvider } from './context/DialogContext';

const AppContent: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [view, setView] = useState<'feed' | 'admin' | 'leaderboard' | 'statistics' | 'reports' | 'info'>('feed');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [chatOpen, setChatOpen] = useState(false);

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
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; }
  }, [mobileMenuOpen]);

  const handleCategorySelect = (catId: string) => {
    setCategory(catId);
    setView('feed');
    setMobileMenuOpen(false);
  };

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

      <div className="relative z-10 max-w-[1440px] mx-auto flex flex-col lg:flex-row lg:justify-center pt-16 lg:pt-0">

        {/* Mobile Header */}
        <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-black/80 backdrop-blur-lg border-b border-zinc-200 dark:border-white/5 z-40 flex items-center justify-between px-4 transition-colors duration-300">
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
          className={`fixed inset-0 z-50 bg-zinc-50 dark:bg-black overflow-y-auto transition-opacity duration-300 lg:hidden ${mobileMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
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
              onAdminClick={() => { setView('admin'); setMobileMenuOpen(false) }}
              onFeedClick={() => { setView('feed'); setCategory('all'); setMobileMenuOpen(false); }}
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

        {/* Desktop Sidebar */}
        <div className="hidden lg:block w-72 h-screen sticky top-0 overflow-visible">
          <Sidebar
            theme={theme}
            toggleTheme={toggleTheme}
            onAdminClick={() => setView('admin')}
            onFeedClick={() => { setView('feed'); setCategory('all'); }}
            onLeaderboardClick={() => setView('leaderboard')}
            onStatisticsClick={() => setView('statistics')}
            onErrorReportsClick={() => setView('reports')}
            onChatsClick={() => setChatOpen(true)}
            onInfoClick={() => setView('info')}
            onCategorySelect={handleCategorySelect}
            onSearch={setSearch}
          />
        </div>

        <div className="flex-1 max-w-3xl w-full min-w-0">
          {view === 'feed' ? <Feed category={category} search={search} /> :
            view === 'admin' ? <div className="py-4 lg:py-8 px-2 lg:px-8"><AdminPanel /></div> :
              view === 'statistics' ? <Statistics /> :
                view === 'reports' ? <ErrorReports /> :
                  view === 'info' ? <div className="py-4 lg:py-8 px-2 lg:px-8"><Information /></div> :
                    <div className="py-0 lg:py-8 px-0 lg:px-8"><Leaderboard /></div>}
        </div>

        <RightPanel />
      </div>

      <ChatModal isOpen={chatOpen} onClose={() => setChatOpen(false)} />
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
