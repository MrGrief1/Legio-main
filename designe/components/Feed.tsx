import React, { useState, useEffect } from 'react';
import { NewsItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { NewsCard } from './FeedComponents';
import { API_URL } from '../config';

export const Feed: React.FC<{ category?: string; search?: string }> = ({ category = 'all', search = '' }) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const refreshFeed = () => {
    // Refresh without showing loader
    const headers: any = {};
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let url = `${API_URL}/feed?category=${category}`;
    if (search) {
      url += `&search=${encodeURIComponent(search)}`;
    }

    fetch(url, { headers })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setNews(data);
        } else {
          console.error('Data is not an array:', data);
          setNews([]);
        }
      })
      .catch(err => {
        console.error(err);
        setNews([]);
      });
  };

  useEffect(() => {
    setLoading(true);

    const headers: any = {};
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let url = `${API_URL}/feed?category=${category}`;
    if (search) {
      url += `&search=${encodeURIComponent(search)}`;
    }

    fetch(url, { headers })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setNews(data);
        } else {
          console.error('Data is not an array:', data);
          setNews([]);
        }
      })
      .catch(err => {
        console.error(err);
        setNews([]);
      })
      .finally(() => setLoading(false));

    // Track visit once per session
    const visited = sessionStorage.getItem('visited');
    if (!visited) {
      fetch(`${API_URL}/visit`, { method: 'POST' })
        .then(() => sessionStorage.setItem('visited', 'true'))
        .catch(console.error);
    }
  }, [category, search, user]);

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
      </div>
    </main>
  );
};
