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
  voters?: User[];
}

export interface PollData {
  id: number;
  question: string;
  options: PollOption[];
  is_resolved?: number;
  correct_option_id?: number | null;
}

export interface NewsItem {
  id: string | number;
  title: string;
  description: string;
  image: string;
  tags: string[];
  date: string;
  poll?: PollData | null;
  isLiked?: boolean;
}