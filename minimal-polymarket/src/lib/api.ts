export const AUTH_TOKEN_KEY = 'legio-auth-token';

export type Outcome = 'YES' | 'NO';

export type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type MarketOutcome = {
  name: string;
  outcome: Outcome;
  percent: number;
  priceCents: number;
  pool: number;
};

export type MarketHistoryPoint = {
  time: string;
  yesPercent: number;
  noPercent?: number;
};

export type MarketTrade = {
  id: string;
  userId: string;
  userName: string;
  outcome: Outcome;
  amount: number;
  priceCents: number;
  shares: number;
  createdAt: string;
};

export type Market = {
  id: string;
  title: string;
  description: string;
  category: string;
  closeDate: string;
  status: 'open' | 'resolved';
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  yesPool: number;
  noPool: number;
  volume: number;
  tradeCount: number;
  yesPrice: number;
  noPrice: number;
  yesPercent: number;
  noPercent: number;
  outcomes: MarketOutcome[];
  recentTrades: MarketTrade[];
  history: MarketHistoryPoint[];
};

type AuthResponse = {
  user: User;
  token: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function getStoredToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(AUTH_TOKEN_KEY) || '';
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getStoredToken();

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new ApiError(body?.error || 'Запрос не удался.', response.status);
  }

  return body as T;
}

export const api = {
  async register(input: { name: string; email: string; password: string }) {
    return apiRequest<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async login(input: { email: string; password: string }) {
    return apiRequest<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async me() {
    return apiRequest<{ user: User }>('/api/auth/me');
  },

  async listMarkets() {
    return apiRequest<{ markets: Market[] }>('/api/markets');
  },

  async getMarket(id: string) {
    return apiRequest<{ market: Market }>(`/api/markets/${id}`);
  },

  async createMarket(input: {
    title: string;
    description: string;
    category: string;
    closeDate: string;
  }) {
    return apiRequest<{ market: Market }>('/api/markets', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async vote(marketId: string, input: { outcome: Outcome; amount: number }) {
    return apiRequest<{ market: Market }>(`/api/markets/${marketId}/votes`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};
