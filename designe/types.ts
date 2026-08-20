import React from 'react';

export interface Category {
  id: string;
  name: string;
  icon: React.ReactNode;
}

export interface User {
  id: string;
  username: string;
  name?: string;
  avatar: string;
  points: number;
  rank?: number;
  prize?: string;
  role?: 'admin' | 'creator' | 'user';
  bio?: string;
  birthdate?: string;
}

export interface PollOption {
  id: number;
  text: string;
  percent: number;
  vote_count?: number;
  total_votes?: number;
  voters?: User[];
}

// Кто создал новость (а с ней и опрос) либо кто опрос завершил. Сервер отдаёт эти поля только
// админам и создателю — у обычного читателя ключа в ответе просто нет.
export interface PollAuthor {
  id: number;
  username: string;
  name: string;
}

export interface PollData {
  id: number;
  question: string;
  options: PollOption[];
  is_resolved?: number;
  correct_option_id?: number | null;
  ends_at?: string | null;
  user_voted_option_id?: number | null;
  author?: PollAuthor | null;
  created_at?: string | null;
  resolved_at?: string | null;
  resolved_by?: PollAuthor | null;
}

export interface NewsItem {
  id: string | number;
  title: string;
  description: string;
  image: string;
  tags: string[];
  date: string;
  source?: string;
  category?: string;
  poll?: PollData | null;
  isLiked?: boolean;
  author?: PollAuthor | null;
}