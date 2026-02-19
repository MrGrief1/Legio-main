import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NewsItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { NewsCard } from './FeedComponents';
import { API_URL } from '../config';

export const Feed: React.FC<{ category?: string; search?: string }> = ({ category = 'all', search = '' }) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const { user } = useAuth();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const PAGE_SIZE = 12;

  const fetchFeedPage = useCallback((pageToLoad: number, append: boolean) => {
    const headers: any = {};
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let url = `${API_URL}/feed?category=${category}&page=${pageToLoad}&limit=${PAGE_SIZE}`;
    if (search) {
      url += `&search=${encodeURIComponent(search)}`;
    }

    fetch(url, { headers })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) {
          console.error('Data is not an array:', data);
          setHasMore(false);
          if (!append) setNews([]);
          return;
        }

        setNews((prev) => {
          if (!append) return data;
          const existingIds = new Set(prev.map((item) => item.id));
          const onlyNew = data.filter((item) => !existingIds.has(item.id));
          return [...prev, ...onlyNew];
        });
        setHasMore(data.length === PAGE_SIZE);
      })
      .catch(err => {
        console.error(err);
        setHasMore(false);
        if (!append) setNews([]);
      });
  }, [category, search]);

  const refreshFeed = useCallback(() => {
    setPage(1);
    setHasMore(true);
    fetchFeedPage(1, false);
  }, [fetchFeedPage]);

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    setLoading(true);
    fetchFeedPage(1, false).finally(() => setLoading(false));

    // Track visit once per session
    const visited = sessionStorage.getItem('visited');
    if (!visited) {
      fetch(`${API_URL}/visit`, { method: 'POST' })
        .then(() => sessionStorage.setItem('visited', 'true'))
        .catch(console.error);
    }
  }, [category, search, user, fetchFeedPage]);

  useEffect(() => {
    if (!loadMoreRef.current || loading || loadingMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;

        const nextPage = page + 1;
        setLoadingMore(true);
        fetchFeedPage(nextPage, true)
          .then(() => setPage(nextPage))
          .finally(() => setLoadingMore(false));
      },
      { rootMargin: '300px 0px' }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [page, hasMore, loading, loadingMore, fetchFeedPage]);

  return (
    <main className="flex-1 min-w-0 py-4 lg:py-8 px-4 lg:px-8 max-w-3xl mx-auto w-full">
      {/* Hero Banner Removed as requested */}

      <div className="mb-6 px-2">
        <h2 className="text-xl font-medium text-zinc-900 dark:text-white">
          {category === 'all' ? 'Новости проекта' : category === 'favorites' ? 'Избранное' : 'Новости категории'}
        </h2>
      </div>

      {/* Feed Items */}
      <div className="space-y-8 pb-20">
        {Array.isArray(news) && news.length > 0 ? (
          news.map((item) => (
            <NewsCard key={item.id} item={item} onRefresh={refreshFeed} />
          ))
        ) : (
          <div className="text-center text-zinc-500 dark:text-zinc-400 py-10">
            {loading ? 'Загрузка...' : 'В этой категории пока нет новостей или произошла ошибка загрузки'}
          </div>
        )}
        {news.length === 0 && !loading && (
          <div className="text-center text-zinc-500 dark:text-zinc-400 py-10">
            В этой категории пока нет новостей
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
