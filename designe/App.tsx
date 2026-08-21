
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useBackClose, pushBackStep } from './hooks/useBackClose';
import { Menu, X, Search } from 'lucide-react';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { DialogProvider } from './context/DialogContext';
import { NotificationProvider } from './context/NotificationContext';

const AppContent: React.FC = () => {
  const { t } = useLanguage();
  // Тема живёт в ThemeProvider: она настраивается в модалке настроек, здесь она нужна только для
  // фоновой подсветки ниже.
  const { theme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [view, setView] = useState<'feed' | 'open-polls' | 'admin' | 'create' | 'manage' | 'leaderboard' | 'statistics' | 'reports' | 'info'>('feed');
  const [category, setCategory] = useState('all');
  // `search` is what the inputs show; `appliedSearch` is what the feed actually queries. Keeping
  // them apart is what makes the debounce below possible without the field feeling laggy.
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [deepNews, setDeepNews] = useState<NewsItem | null>(null);
  const [deepNewsOpen, setDeepNewsOpen] = useState(false);
  // Какую публикацию правим. null — мастер работает как «создать опрос».
  const [editingNewsId, setEditingNewsId] = useState<number | null>(null);

  // Lock body scroll when mobile menu is open
  useScrollLock(mobileMenuOpen);

  // При открытом меню «назад» закрывает меню, а не уходит с сайта.
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  useBackClose(mobileMenuOpen, closeMobileMenu);

  // Снимок текущего раздела для шагов «назад». Держим в ref, потому что goTo вызывается из
  // обработчиков и ему нужны значения на момент нажатия, а не на момент создания колбэка.
  const navSnapshotRef = useRef({ view, category, editingNewsId });
  useEffect(() => {
    navSnapshotRef.current = { view, category, editingNewsId };
  });

  // Переход по разделам — такой же шаг назад, как открытие модалки: «назад» возвращает туда,
  // откуда пришли, вместе с категорией и открытой правкой.
  const pushNavStep = useCallback(() => {
    const from = navSnapshotRef.current;
    pushBackStep(() => {
      setView(from.view);
      setCategory(from.category);
      setEditingNewsId(from.editingNewsId);
      setMobileMenuOpen(false);
    });
  }, []);

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
    const params = new URLSearchParams(window.location.search);
    const newsId = params.get('news');
    if (!newsId) return;

    // Параметр убираем сразу, до открытия модалки: свой шаг «назад» она добавит уже поверх чистого
    // адреса, и возврат из неё не оставит ссылку, по которой пост открылся бы снова.
    params.delete('news');
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );

    fetchDeepNews(newsId);
  }, [fetchDeepNews]);

  const closeDeepNews = () => setDeepNewsOpen(false);

  // Typing used to fire one feed request per keystroke: laggy, and ten characters was ten requests
  // against a 100-per-15-minutes limit, so a few searches could lock the user out with 429s.
  // The query now settles for 350 ms before it is sent.
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    // Clearing is applied at once — waiting to restore the full feed just feels broken.
    if (value === '') setAppliedSearch('');
  }, []);

  // Navigating anywhere drops the query. Without this, tapping "Последние новости" left the old
  // search applied: the section header said "latest news" while the list stayed filtered (usually
  // to nothing), with no visible reason and no obvious way out.
  const clearSearch = useCallback(() => {
    setSearch('');
    setAppliedSearch('');
    setMobileSearchOpen(false);
  }, []);

  useEffect(() => {
    if (search === appliedSearch) return;
    if (search === '') return; // already handled synchronously above

    const timer = setTimeout(() => setAppliedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search, appliedSearch]);

  // Searching from anywhere should land the user on the feed, where results are rendered — and
  // close the burger menu, which would otherwise cover them.
  useEffect(() => {
    if (!appliedSearch) return;
    setView('feed');
    setMobileMenuOpen(false);
  }, [appliedSearch]);

  // Focus the field when the mobile search row opens, so the keyboard comes up without a second tap.
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!mobileSearchOpen) return;
    const timer = setTimeout(() => mobileSearchInputRef.current?.focus(), 250);
    return () => clearTimeout(timer);
  }, [mobileSearchOpen]);

  const handleCategorySelect = (catId: string) => {
    const from = navSnapshotRef.current;
    if (from.view !== 'feed' || from.category !== catId) pushNavStep();
    setCategory(catId);
    setView('feed');
    setMobileMenuOpen(false);
    clearSearch();
  };

  // Every nav destination resets the query, so a stale search can never survive a navigation and
  // silently filter whatever the user lands on next.
  const goTo = useCallback((next: typeof view, nextCategory?: string) => {
    const from = navSnapshotRef.current;
    // Повторный клик по текущему разделу шагом назад не считается — иначе «назад» жалось бы
    // вхолостую по разу на каждое такое нажатие.
    const isSameSpot = next === from.view && (nextCategory === undefined || nextCategory === from.category);
    if (!isSameSpot) pushNavStep();

    setView(next);
    if (nextCategory !== undefined) setCategory(nextCategory);
    setMobileMenuOpen(false);
    clearSearch();
    // Любой переход по меню закрывает правку: иначе «Создать опрос» открывался бы с чужим
    // материалом внутри, и новая публикация молча уходила бы поверх старой.
    setEditingNewsId(null);
  }, [clearSearch, pushNavStep]);

  // Открыть мастер на правке конкретной публикации — из карточки в ленте или из списка опросов.
  const startEditing = useCallback((newsId: number) => {
    goTo('create');
    setEditingNewsId(newsId);
    setDeepNewsOpen(false);
  }, [goTo]);

  // Новый раздел открывается с его начала. Прокрутка — свойство страницы, а не раздела, поэтому
  // при переходе она оставалась там, где человек её оставил: мастер правки — длинная страница с
  // кнопками «Сохранить» и «Отмена» внизу, и после выхода из правки короткий список опросов
  // оказывался выше экрана, а человек смотрел в пустоту и думал, что страница не загрузилась.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [view, category]);

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

      {/* The mobile search row is fixed under the header, so the content has to make room for it —
          otherwise it sits on top of the section heading. Matches the row's own 300ms transition. */}
      <div className={`relative z-10 max-w-[1440px] mx-auto flex flex-col md:flex-row md:justify-center md:pt-0 transition-[padding] duration-300 ${mobileSearchOpen ? 'pt-[8.5rem]' : 'pt-16'
        }`}>

        {/* Mobile Header */}
        <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-black/80 backdrop-blur-lg border-b border-zinc-200 dark:border-white/5 z-40 flex items-center justify-between px-4 transition-colors duration-300">
          <div className="flex items-center gap-3" onClick={() => goTo('feed', 'all')}>            <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M36 19C36 28.5 28 36 19 36C16.5 36 14 35.5 12 34.5L4 37L6.5 29C4.5 26.5 4 23 4 19C4 10 11 3 20 3C29 3 36 10 36 19Z" stroke="currentColor" strokeWidth="3" className="text-black dark:text-white" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="11" y="18" width="4" height="8" rx="1" className="fill-black dark:fill-white" />
            <rect x="18" y="11" width="4" height="15" rx="1" fill="#06b6d4" />
            <rect x="25" y="15" width="4" height="11" rx="1" className="fill-black dark:fill-white" />
          </svg>
            <span className="font-serif italic text-2xl font-bold leading-normal pb-0.5">Legio</span>
          </div>
          <div className="flex items-center">
            {/* Search lived only inside the burger menu, and that menu is a full-screen overlay —
                so typing a query covered the very results it produced. On mobile it belongs in the
                header, next to the burger. */}
            <button
              onClick={() => setMobileSearchOpen((open) => !open)}
              aria-label={t.search}
              aria-expanded={mobileSearchOpen}
              className={`p-2 rounded-full transition-colors ${mobileSearchOpen || search
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'}`}
            >
              <Search />
            </button>
            <button onClick={() => setMobileMenuOpen(true)} aria-label="Menu" className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors">
              <Menu />
            </button>
          </div>
        </div>

        {/* Mobile search row — slides out under the header and stays visible over the results. */}
        <div
          className={`md:hidden fixed top-16 left-0 right-0 z-30 bg-white/80 dark:bg-black/80 backdrop-blur-lg border-b border-zinc-200 dark:border-white/5 overflow-hidden transition-[max-height,opacity] duration-300 ${mobileSearchOpen ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'
            }`}
        >
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <input
                ref={mobileSearchInputRef}
                type="search"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={t.sidebar.searchPlaceholder}
                enterKeyHint="search"
                className="w-full pl-10 pr-4 py-2.5 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-transparent focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/20 outline-none text-sm text-zinc-900 dark:text-white placeholder-zinc-400 transition-all"
              />
            </div>
            {search && (
              <button
                onClick={() => handleSearchChange('')}
                aria-label={t.cancel}
                className="p-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Redesigned Mobile Menu Overlay (Full Screen) */}
        <div
          // `visibility` is in the transition list on purpose. Transitioning opacity alone made the
          // menu fade IN but snap OUT: `invisible` takes effect immediately, so the element vanished
          // before the fade could play. Including visibility defers the hide to the end of the
          // duration, which is what makes closing mirror opening. It stays in the class list (rather
          // than being dropped for `pointer-events-none` alone) so the closed menu is genuinely
          // hidden — not an invisible layer that still holds focusable links.
          className={`fixed inset-0 z-50 bg-zinc-50 dark:bg-black overflow-y-auto transition-[opacity,visibility] duration-300 ease-out md:hidden ${mobileMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
            }`}
        >
          <div className="min-h-full flex flex-col p-4 pb-12">
            {/* Menu Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3" onClick={() => goTo('feed', 'all')}>
                <svg width="36" height="36" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M36 19C36 28.5 28 36 19 36C16.5 36 14 35.5 12 34.5L4 37L6.5 29C4.5 26.5 4 23 4 19C4 10 11 3 20 3C29 3 36 10 36 19Z" stroke="currentColor" strokeWidth="3" className="text-black dark:text-white" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="11" y="18" width="4" height="8" rx="1" className="fill-black dark:fill-white" />
                  <rect x="18" y="11" width="4" height="15" rx="1" fill="#06b6d4" />
                  <rect x="25" y="15" width="4" height="11" rx="1" className="fill-black dark:fill-white" />
                </svg>
                <span className="font-serif italic text-3xl font-bold text-black dark:text-white leading-normal pb-0.5">Legio</span>
              </div>
              <div className="flex items-center gap-2">
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
              className="!pt-0 !px-0 !h-auto overflow-visible"
              showHeader={false}
              activeKey={activeNavKey}
              accountVisibility="never"
              onAdminClick={() => goTo('admin')}
              onCreatePollClick={() => goTo('create')}
              onManagePollsClick={() => goTo('manage')}
              onFeedClick={() => goTo('feed', 'all')}
              onOpenPollsClick={() => goTo('open-polls')}
              onLeaderboardClick={() => goTo('leaderboard')}
              onStatisticsClick={() => goTo('statistics')}
              onErrorReportsClick={() => goTo('reports')}
              onChatsClick={() => { setChatOpen(true); setMobileMenuOpen(false); }}
              onInfoClick={() => goTo('info')}
              onCategorySelect={handleCategorySelect}
              onSearch={handleSearchChange}
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
            activeKey={activeNavKey}
            accountVisibility={rightPanelVisible ? 'auto' : 'always'}
            onAdminClick={() => goTo('admin')}
            onCreatePollClick={() => goTo('create')}
            onManagePollsClick={() => goTo('manage')}
            onFeedClick={() => goTo('feed', 'all')}
            onOpenPollsClick={() => goTo('open-polls')}
            onLeaderboardClick={() => goTo('leaderboard')}
            onStatisticsClick={() => goTo('statistics')}
            onErrorReportsClick={() => goTo('reports')}
            onChatsClick={() => setChatOpen(true)}
            onInfoClick={() => goTo('info')}
            onCategorySelect={handleCategorySelect}
            onSearch={handleSearchChange}
          />
        </div>

        <div className={`flex-1 w-full min-w-0 ${isWideView ? '' : 'max-w-3xl'}`}>
          {view === 'feed' ? <Feed category={category} search={appliedSearch} onEditNews={startEditing} /> :
            view === 'open-polls' ? <Feed category="all" search={appliedSearch} pollStatus="open" onEditNews={startEditing} /> :
            view === 'admin' ? <div className="py-4 lg:py-8 px-3 md:px-4 lg:px-8"><AdminPanel /></div> :
              view === 'create' ? (
                <div className="py-4 lg:py-8 px-3 md:px-4 lg:px-8">
                  {/* key сбрасывает состояние мастера при переходе между «создать» и «править»,
                      и между разными правками: иначе в форме остаются поля прошлой публикации. */}
                  <CreatePoll
                    key={editingNewsId ?? 'new'}
                    editingNewsId={editingNewsId}
                    onFinished={() => goTo('manage')}
                    onCancelEdit={() => goTo('manage')}
                  />
                </div>
              ) :
              view === 'manage' ? <div className="py-4 lg:py-8 px-3 md:px-4 lg:px-8"><ManagePolls onEditNews={startEditing} /></div> :
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
      {/* Тема применяется к <html>, поэтому провайдер стоит выше всего дерева. Первый кадр уже
          покрашен public/theme-init.js — здесь тема становится управляемой из настроек. */}
      <ThemeProvider>
        <LanguageProvider>
          <ToastProvider>
            <DialogProvider>
              {/* Inside Auth (needs the session), Language (localised copy) and Toast (its fallback
                  presentation), so it can use all three. */}
              <NotificationProvider>
                <AppContent />
              </NotificationProvider>
            </DialogProvider>
          </ToastProvider>
        </LanguageProvider>
      </ThemeProvider>
    </AuthProvider>
  );
};

export default App;
