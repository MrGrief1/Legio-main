import React from 'react';
import {
  Car,
  Landmark,
  HeartPulse,
  Home,
  Video,
  Bitcoin,
  Users,
  MessageSquare,
  ShieldAlert,
  Dumbbell,
  Plane,
  Leaf,
  TrendingUp,
  Search,
  Info,
  Newspaper
} from 'lucide-react';
import { Category, User, NewsItem } from './types';

// Category names by language
export const CATEGORY_NAMES = {
  ru: {
    auto: 'Авто',
    finance: 'Банковский сектор',
    housing: 'Жилье',
    health: 'Здоровье',
    cinema: 'Кино',
    crypto: 'Криптовалюта',
    society: 'Общество',
    politics: 'Политика',
    family: 'Семья',
    sport: 'Спорт',
    tourism: 'Туризм',
    ecology: 'Экология',
    economy: 'Экономика',
  },
  en: {
    auto: 'Auto',
    finance: 'Banking',
    housing: 'Housing',
    health: 'Health',
    cinema: 'Cinema',
    crypto: 'Cryptocurrency',
    society: 'Society',
    politics: 'Politics',
    family: 'Family',
    sport: 'Sport',
    tourism: 'Tourism',
    ecology: 'Ecology',
    economy: 'Economy',
  }
};

export const getCategoryName = (categoryId: string, language: 'ru' | 'en' = 'ru'): string => {
  return CATEGORY_NAMES[language][categoryId as keyof typeof CATEGORY_NAMES.ru] || categoryId;
};

export const CATEGORIES: Category[] = [
  { id: 'auto', name: 'Авто', icon: <Car size={18} /> },
  { id: 'finance', name: 'Банковский сектор', icon: <Landmark size={18} /> },
  { id: 'housing', name: 'Жилье', icon: <Home size={18} /> },
  { id: 'health', name: 'Здоровье', icon: <HeartPulse size={18} /> },
  { id: 'cinema', name: 'Кино', icon: <Video size={18} /> },
  { id: 'crypto', name: 'Криптовалюта', icon: <Bitcoin size={18} /> },
  { id: 'society', name: 'Общество', icon: <Users size={18} /> },
  { id: 'politics', name: 'Политика', icon: <ShieldAlert size={18} /> },
  { id: 'family', name: 'Семья', icon: <HeartPulse size={18} /> }, // Reusing heart for family
  { id: 'sport', name: 'Спорт', icon: <Dumbbell size={18} /> },
  { id: 'tourism', name: 'Туризм', icon: <Plane size={18} /> },
  { id: 'ecology', name: 'Экология', icon: <Leaf size={18} /> },
  { id: 'economy', name: 'Экономика', icon: <TrendingUp size={18} /> },
];

export const LEADERS: User[] = [
  { id: '1', name: 'Julia', username: 'julia', points: 74002, avatar: 'https://picsum.photos/seed/julia/50/50', rank: 1 },
  { id: '2', name: 'Andrey', username: 'andrey', points: 60753, avatar: 'https://picsum.photos/seed/andrey/50/50', rank: 2 },
  { id: '3', name: 'Супер Антон', username: 'anton', points: 45559, avatar: 'https://picsum.photos/seed/anton/50/50', rank: 3 },
];

export const NEWS: NewsItem[] = [
  {
    id: '1',
    title: 'В России предложили включить тему об опасности эскорта в «Разговоры о важном»',
    description: 'Председатель Национального родительского комитета Ирина Волынец выступила с предложением включить обсуждение опасности эскорт-бизнеса в школьный предмет «Разговоры о важном».',
    image: 'https://picsum.photos/seed/news1/800/400',
    tags: ['Общество', 'Семья'],
    date: '2 часа назад',
    poll: {
      id: 1,
      question: 'Включат обсуждение опасности эскорт-бизнеса в школьный предмет «Разговоры о важном» до 18.03.2026?',
      options: [
        { id: 1, text: "Да, потому что участились случаи, когда детей под предлогом работы затягивают в сферу", percent: 62 },
        { id: 2, text: "Нет, в школьный предмет точно не включат. Возможно, будут обсуждать на собраниях", percent: 38 }
      ]
    }
  },
  {
    id: '2',
    title: 'Биткоин достиг нового исторического максимума',
    description: 'Курс главной криптовалюты мира пробил отметку в $100,000 на фоне новостей о новых регуляциях в США.',
    image: 'https://picsum.photos/seed/news2/800/400',
    tags: ['Криптовалюта', 'Финансы'],
    date: '4 часа назад',
    poll: {
      id: 2,
      question: 'Сможет ли Биткоин закрепиться выше $100,000 до конца этого месяца?',
      options: [
        { id: 1, text: "Да, тренд очень сильный, институционалы продолжают покупать", percent: 84 },
        { id: 2, text: "Нет, ожидается коррекция цены до $90,000", percent: 16 }
      ]
    }
  }
];

export const PRIZE_WINNER: User = {
  id: 'winner',
  name: 'Анна',
  username: 'anna',
  points: 500,
  avatar: 'https://picsum.photos/seed/anna/100/100',
  prize: '+500 баллов и Приз от Легио!'
};

export const LEVELS = [
  { id: 1, name: 'Стартовый', minPoints: 0 },
  { id: 2, name: 'Бронзовый', minPoints: 1000 },
  { id: 3, name: 'Серебряный', minPoints: 3000 },
  { id: 4, name: 'Золотой', minPoints: 9000 },
  { id: 5, name: 'Платиновый', minPoints: 30000 },
  { id: 6, name: 'Алмазный', minPoints: 50000 },
];

export const getLevel = (points: number) => {
  return LEVELS.slice().reverse().find(l => points >= l.minPoints) || LEVELS[0];
};