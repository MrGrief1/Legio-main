export const AUTH_TOKEN_KEY = 'legio-auth-token';

export type Outcome = 'YES' | 'NO';
export type TradeSide = 'BUY' | 'SELL';

export type User = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  balance: number;
  createdAt: string;
};

export type MarketOutcome = {
  name: string;
  outcome: string;
  color?: string;
  percent: number;
  priceCents: number;
  pool: number;
};

export type MarketHistoryPoint = {
  time: string;
  yesPercent: number;
  noPercent?: number;
  values?: Record<string, number>;
};

export type MarketTrade = {
  id: string;
  userId: string;
  userName: string;
  outcome: string;
  side: TradeSide;
  amount: number;
  priceCents: number;
  shares: number;
  createdAt: string;
};

export type MarketViewerPosition = {
  shares: number;
  avgPriceCents: number;
};

export type Market = {
  id: string;
  title: string;
  description: string;
  category: string;
  resolutionSource: string;
  resolutionRules: string;
  startDate: string;
  closeDate: string;
  status: MarketStatus;
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
  liquidity: number;
  initialProbability: number;
  tickSize: number;
  minOrderSize: number;
  feeBps: number;
  marketType?: 'binary' | 'multi';
  winningOutcome: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  quotes: Record<string, { bid: number; ask: number }>;
  outcomes: MarketOutcome[];
  recentTrades: MarketTrade[];
  history: MarketHistoryPoint[];
  viewer: {
    balance: number;
    positions: Record<string, MarketViewerPosition>;
  } | null;
};

export type MarketStatus = 'open' | 'paused' | 'resolved' | 'canceled';

export type TradeQuote = {
  marketId: string;
  outcome: string;
  side: TradeSide;
  shares: number;
  cost: number;
  fee: number;
  avgPriceCents: number;
  currentPriceCents: number;
  priceImpactCents: number;
  yesPriceAfterCents: number;
  noPriceAfterCents: number;
  toWin: number;
  returnPercent: number;
};

export type AdminUser = User & {
  marketCount: number;
  tradeCount: number;
  positionCount: number;
};

export type AdminRecentTrade = {
  id: string;
  marketId: string;
  marketTitle: string;
  userId: string;
  userName: string;
  outcome: string;
  side: TradeSide;
  amount: number;
  priceCents: number;
  shares: number;
  createdAt: string;
};

export type AdminOverview = {
  stats: {
    userCount: number;
    adminCount: number;
    marketCount: number;
    openMarketCount: number;
    pausedMarketCount: number;
    resolvedMarketCount: number;
    canceledMarketCount: number;
    tradeCount: number;
    totalVolume: number;
    totalBalances: number;
    averageLiquidity: number;
    latestUserAt: string | null;
    latestMarketAt: string | null;
  };
  users: AdminUser[];
  markets: Market[];
  recentTrades: AdminRecentTrade[];
};

type AuthResponse = {
  user: User;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'same-origin',
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

  async login(input: { email: string; password: string; rememberMe?: boolean }) {
    return apiRequest<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async me() {
    return apiRequest<{ user: User }>('/api/auth/me');
  },

  async logout() {
    return apiRequest<void>('/api/auth/logout', {
      method: 'POST',
    });
  },

  async getAdminOverview() {
    return apiRequest<AdminOverview>('/api/admin/overview');
  },

  async setUserAdmin(userId: string, isAdmin: boolean) {
    return apiRequest<{ user: AdminUser }>(`/api/admin/users/${userId}/admin`, {
      method: 'PATCH',
      body: JSON.stringify({ isAdmin }),
    });
  },

  async updateUserBalance(userId: string, balance: number) {
    return apiRequest<{ user: AdminUser }>(`/api/admin/users/${userId}/balance`, {
      method: 'PATCH',
      body: JSON.stringify({ balance }),
    });
  },

  async updateMarketStatus(marketId: string, status: MarketStatus) {
    return apiRequest<{ market: Market }>(`/api/admin/markets/${marketId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async resolveMarket(marketId: string, winningOutcome: string, note?: string) {
    return apiRequest<{ market: Market }>(`/api/admin/markets/${marketId}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify({ winningOutcome, note }),
    });
  },

  async cancelMarket(marketId: string, note?: string) {
    return apiRequest<{ market: Market }>(`/api/admin/markets/${marketId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  },

  async deleteMarket(marketId: string) {
    return apiRequest<void>(`/api/admin/markets/${marketId}`, {
      method: 'DELETE',
    });
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
    resolutionSource: string;
    resolutionRules: string;
    startDate?: string;
    closeDate: string;
    liquidity: number;
    initialProbability: number;
    tickSize: number;
    minOrderSize: number;
  }) {
    return apiRequest<{ market: Market }>('/api/markets', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async trade(marketId: string, input: { outcome: string; side: TradeSide; amount: number; maxPriceCents?: number; minPriceCents?: number }) {
    return apiRequest<{ market: Market }>(`/api/markets/${marketId}/trades`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async quote(marketId: string, input: { outcome: string; side: TradeSide; amount: number }) {
    return apiRequest<{ quote: TradeQuote }>(`/api/markets/${marketId}/quote`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async vote(marketId: string, input: { outcome: Outcome; amount: number }) {
    return apiRequest<{ market: Market }>(`/api/markets/${marketId}/trades`, {
      method: 'POST',
      body: JSON.stringify({ ...input, side: 'BUY' }),
    });
  },
};
