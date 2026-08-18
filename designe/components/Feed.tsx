import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NewsItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { NewsCard } from './FeedComponents';
import { API_URL } from '../config';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

// 'open' shows only posts whose poll is still unresolved — the "Незавершённые опросы" tab.
export type FeedPollStatus = 'all' | 'open';

export const Feed: React.FC<{ category?: string; search?: string; pollStatus?: FeedPollStatus }> = ({ category = 'all', search = '', pollStatus = 'all' }) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [rateLimited, setRateLimited] = useState(false);
  const [page, setPage] = useState(1);
  const { user } = useAuth();
  const { t } = useLanguage();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const PAGE_SIZE = 12;

  // 'replace' — a fresh load (category/search changed).
  // 'append'  — the next page, arriving under what is already there.
  // 'merge'   — a background re-read of page 1: newer posts belong on top, and nothing already
  //             loaded may be dropped or reordered, or the page would jump under the reader.
  type FetchMode = 'replace' | 'append' | 'merge';

  const fetchFeedPage = useCallback((pageToLoad: number, mode: FetchMode) => {
    const headers: any = {};
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let url = `${API_URL}/feed?category=${category}&page=${pageToLoad}&limit=${PAGE_SIZE}`;
    if (search) {
      url += `&search=${encodeURIComponent(search)}`;
    }
    if (pollStatus !== 'all') {
      url += `&pollStatus=${pollStatus}`;
    }

    return fetch(url, { headers })
      .then(res => {
        // 429 is the one failure worth naming: the feed is fine, the client is being throttled, and
        // saying "no news in this category" for it sends the user hunting for a problem that isn't
        // there.
        if (res.status === 429) {
          const error: any = new Error('rate limited');
          error.rateLimited = true;
          throw error;
        }
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((data) => {
        setRateLimited(false);

        if (!Array.isArray(data)) {
          console.error('Data is not an array:', data);
          if (mode === 'replace') {
            setNews([]);
            setHasMore(false);
          }
          return;
        }

        setNews((prev) => {
          if (mode === 'replace') return data;

          const existingIds = new Set(prev.map((item) => item.id));
          const onlyNew = data.filter((item) => !existingIds.has(item.id));
          if (onlyNew.length === 0) return prev;

          // The feed is newest-first, so anything page 1 has that we don't is newer than
          // everything on screen.
          return mode === 'merge' ? [...onlyNew, ...prev] : [...prev, ...onlyNew];
        });

        // Only a real pagination read can tell us whether more pages exist; a background merge
        // must not flip the flag and stop infinite scroll.
        if (mode !== 'merge') {
          setHasMore(data.length === PAGE_SIZE);
        }
      })
      .catch(err => {
        console.error(err);
        if (err?.rateLimited) setRateLimited(true);
        // A background refresh that fails must leave the loaded feed alone.
        if (mode === 'replace' && !err?.rateLimited) {
          setNews([]);
          setHasMore(false);
        }
      });
  }, [category, search, pollStatus]);

  // Голос, разбор опроса или удаление меняют ровно одну карточку. Раньше на это перечитывалась
  // вся лента с первой страницы: список схлопывался с сотни карточек до двенадцати, и читателя,
  // проголосовавшего где-то внизу «Незавершённых опросов», выбрасывало наверх — каждый раз в одно
  // и то же место. Здесь перечитывается только сама новость и подменяется на своём месте, поэтому
  // ни подгруженные страницы, ни позиция прокрутки не теряются.
  const refreshItem = useCallback((newsId: number) => {
    const headers: any = {};
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`${API_URL}/news/${newsId}`, { headers })
      .then((res) => {
        // Новость удалили — карточке в ленте больше не место.
        if (res.status === 404) {
          setNews((prev) => prev.filter((item) => item.id !== newsId));
          return null;
        }
        if (!res.ok) throw new Error('Failed to refresh news item');
        return res.json();
      })
      .then((updated: NewsItem | null) => {
        if (!updated) return;

        setNews((prev) => {
          // Вкладка «Незавершённые опросы» показывает только неразобранные: как только у опроса
          // появился правильный ответ, карточка перестаёт подходить под фильтр.
          if (pollStatus === 'open' && Number(updated.poll?.is_resolved || 0) === 1) {
            return prev.filter((item) => item.id !== newsId);
          }
          return prev.map((item) => (item.id === newsId ? updated : item));
        });
      })
      .catch((err) => {
        console.error(err);
      });
  }, [pollStatus]);

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    setLoading(true);
    fetchFeedPage(1, 'replace').finally(() => setLoading(false));

    // Track visit once per session
    const visited = sessionStorage.getItem('visited');
    if (!visited) {
      fetch(`${API_URL}/visit`, { method: 'POST' })
        .then(() => sessionStorage.setItem('visited', 'true'))
        .catch(console.error);
    }
    // user?.id, not `user`: the account object is replaced on every background refresh, and
    // depending on it made this effect re-run and 'replace' the whole feed — resetting pagination
    // and yanking a reader who had scrolled back to the top. Only a change of *who* is signed in
    // matters here, because that changes the per-user fields (is_liked, the vote they cast).
  }, [category, search, pollStatus, user?.id, fetchFeedPage]);

  // Bring in posts published while the tab sat open. Only the first page is re-read, and 'merge'
  // keeps already-loaded pages intact, so this never disturbs scroll position.
  useAutoRefresh(() => fetchFeedPage(1, 'merge'));

  useEffect(() => {
    if (!loadMoreRef.current || loading || loadingMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;

        const nextPage = page + 1;
        setLoadingMore(true);
        fetchFeedPage(nextPage, 'append')
          .then(() => setPage(nextPage))
          .finally(() => setLoadingMore(false));
      },
      { rootMargin: '300px 0px' }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [page, hasMore, loading, loadingMore, fetchFeedPage]);

  const isOpenPolls = pollStatus === 'open';

  return (
    <main className="flex-1 min-w-0 py-4 lg:py-8 px-3 sm:px-4 lg:px-8 max-w-3xl mx-auto w-full">
      {/* Hero Banner Removed as requested */}

      <div className="mb-6 px-2">
        <h2 className="text-xl font-medium text-zinc-900 dark:text-white">
          {isOpenPolls ? 'Незавершённые опросы'
            : category === 'all' ? t.sidebar.latestNews
              : category === 'favorites' ? 'Избранное'
                : 'Новости категории'}
        </h2>
        {isOpenPolls ? (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Опросы без результата — успейте проголосовать, пока они открыты.
          </p>
        ) : category === 'all' && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Все новости по дате публикации — самые свежие сверху.
          </p>
        )}
      </div>

      {/* Feed Items */}
      <div className="space-y-8 pb-20">
        {Array.isArray(news) && news.length > 0 ? (
          news.map((item) => (
            <NewsCard key={item.id} item={item} onRefresh={refreshItem} />
          ))
        ) : (
          /* One empty state, and it says which situation it is. Two stacked messages used to render
             here, and both talked about "this category" even when the list was empty because a
             search matched nothing — which reads as a broken feed rather than no results. */
          <div className="text-center text-zinc-500 dark:text-zinc-400 py-14 px-4">
            {loading ? 'Загрузка...' : rateLimited ? (
              <>
                <p className="text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Слишком много запросов
                </p>
                <p className="text-sm">Сервер временно ограничил обращения. Подождите минуту и обновите страницу.</p>
              </>
            ) : search ? (
              <>
                <p className="text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  По запросу «{search}» ничего не найдено
                </p>
                <p className="text-sm">Поиск идёт по заголовку, тексту и тегам. Попробуйте другое слово.</p>
              </>
            ) : isOpenPolls ? 'Открытых опросов пока нет' : 'В этой категории пока нет новостей'}
          </div>
        )}
        {news.length > 0 && hasMore && (
          <div ref={loadMoreRef} className="py-6 text-center text-zinc-500 dark:text-zinc-400">
            {loadingMore ? 'Подгружаем еще...' : 'Прокрутите ниже для загрузки'}
          </div>
        )}
      </div>
    </main>
  );
};
