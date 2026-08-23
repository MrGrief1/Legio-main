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
  // Закрыт без победителя: верного варианта нет и не будет, баллы не начислялись.
  // Голос в таком опросе не считается ни верным, ни ошибочным.
  is_void?: boolean;
  correct_option_id?: number | null;
  ends_at?: string | null;
  // Считает сервер по своей дате: срок голосования вышел, но верный вариант ещё не проставлен.
  // Клиент не пересчитывает это сам — у читателя часы могут расходиться с серверными.
  voting_closed?: boolean;
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