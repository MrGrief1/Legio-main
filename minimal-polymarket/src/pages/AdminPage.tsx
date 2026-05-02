import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Activity,
  Banknote,
  BarChart3,
  CheckCircle2,
  Download,
  Eye,
  LayoutDashboard,
  LockKeyhole,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCog,
  UsersRound,
  XCircle,
} from 'lucide-react';
import {
  api,
  ApiError,
  type AdminOverview,
  type AdminUser,
  type Market,
  type MarketStatus,
} from '../lib/api';
import { useAuth } from '../lib/auth';

type AdminTab = 'overview' | 'users' | 'markets' | 'activity';
type UserFilter = 'all' | 'admins' | 'users';
type MarketFilter = 'all' | MarketStatus;

const statusOptions: { value: MarketStatus; label: string }[] = [
  { value: 'open', label: 'Открыт' },
  { value: 'paused', label: 'Пауза' },
  { value: 'resolved', label: 'Решён' },
  { value: 'canceled', label: 'Отменён' },
];

const tabs: { id: AdminTab; label: string }[] = [
  { id: 'overview', label: 'Обзор' },
  { id: 'users', label: 'Пользователи' },
  { id: 'markets', label: 'Рынки' },
  { id: 'activity', label: 'Активность' },
];

function formatPoints(value: number) {
  return `${Math.round(value).toLocaleString('ru-RU')} pts`;
}

function formatCompact(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    notation: value >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return 'нет данных';

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function statusLabel(status: MarketStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

function statusClassName(status: MarketStatus) {
  if (status === 'open') return 'border-[#22c55e]/30 bg-[#22c55e]/10 text-pm-green';
  if (status === 'paused') return 'border-[#f59e0b]/30 bg-[#f59e0b]/10 text-[#f5b84b]';
  if (status === 'resolved') return 'border-pm-blue/30 bg-pm-blue/10 text-pm-blue';

  return 'border-[#ef4444]/30 bg-[#ef4444]/10 text-pm-red';
}

function withUsers(overview: AdminOverview, users: AdminUser[]): AdminOverview {
  return {
    ...overview,
    users,
    stats: {
      ...overview.stats,
      userCount: users.length,
      adminCount: users.filter((user) => user.isAdmin).length,
      totalBalances: users.reduce((sum, user) => sum + user.balance, 0),
    },
  };
}

function withMarkets(overview: AdminOverview, markets: Market[]): AdminOverview {
  const totalVolume = markets.reduce((sum, market) => sum + market.volume, 0);
  const totalLiquidity = markets.reduce((sum, market) => sum + market.liquidity, 0);

  return {
    ...overview,
    markets,
    stats: {
      ...overview.stats,
      marketCount: markets.length,
      openMarketCount: markets.filter((market) => market.status === 'open').length,
      pausedMarketCount: markets.filter((market) => market.status === 'paused').length,
      resolvedMarketCount: markets.filter((market) => market.status === 'resolved').length,
      canceledMarketCount: markets.filter((market) => market.status === 'canceled').length,
      tradeCount: markets.reduce((sum, market) => sum + market.tradeCount, 0),
      totalVolume,
      averageLiquidity: markets.length ? totalLiquidity / markets.length : 0,
      latestMarketAt: markets[0]?.createdAt ?? null,
    },
  };
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-pm-border bg-pm-bg/35 px-4 py-6 text-center">
      <h3 className="text-base font-bold text-pm-text-strong">{title}</h3>
      <p className="mt-1 text-sm font-semibold text-pm-text-muted">{text}</p>
    </div>
  );
}

export function AdminPage() {
  const { user, isLoading } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [userQuery, setUserQuery] = useState('');
  const [marketQuery, setMarketQuery] = useState('');
  const [userFilter, setUserFilter] = useState<UserFilter>('all');
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all');
  const [balanceDrafts, setBalanceDrafts] = useState<Record<string, string>>({});
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [error, setError] = useState('');

  const refreshOverview = useCallback(async () => {
    if (!user?.isAdmin) return;

    setIsOverviewLoading(true);
    setError('');

    try {
      const nextOverview = await api.getAdminOverview();
      setOverview(nextOverview);
      setBalanceDrafts(Object.fromEntries(nextOverview.users.map((item) => [item.id, String(Math.round(item.balance))])));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Не удалось загрузить админ-панель.');
    } finally {
      setIsOverviewLoading(false);
    }
  }, [user?.isAdmin]);

  useEffect(() => {
    void refreshOverview();
  }, [refreshOverview]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = userQuery.trim().toLowerCase();

    return (overview?.users ?? []).filter((item) => {
      const matchesQuery = !normalizedQuery
        || item.name.toLowerCase().includes(normalizedQuery)
        || item.email.toLowerCase().includes(normalizedQuery);
      const matchesFilter = userFilter === 'all'
        || (userFilter === 'admins' && item.isAdmin)
        || (userFilter === 'users' && !item.isAdmin);

      return matchesQuery && matchesFilter;
    });
  }, [overview?.users, userFilter, userQuery]);

  const filteredMarkets = useMemo(() => {
    const normalizedQuery = marketQuery.trim().toLowerCase();

    return (overview?.markets ?? []).filter((market) => {
      const matchesQuery = !normalizedQuery
        || market.title.toLowerCase().includes(normalizedQuery)
        || market.category.toLowerCase().includes(normalizedQuery)
        || market.createdBy?.name.toLowerCase().includes(normalizedQuery);
      const matchesFilter = marketFilter === 'all' || market.status === marketFilter;

      return matchesQuery && matchesFilter;
    });
  }, [marketFilter, marketQuery, overview?.markets]);

  const setAdminRole = async (target: AdminUser, nextIsAdmin: boolean) => {
    setActionMessage('');

    try {
      const response = await api.setUserAdmin(target.id, nextIsAdmin);
      setOverview((current) => {
        if (!current) return current;
        return withUsers(current, current.users.map((item) => (item.id === response.user.id ? response.user : item)));
      });
      setActionMessage(nextIsAdmin ? 'Админ назначен.' : 'Права администратора сняты.');
    } catch (requestError) {
      setActionMessage(requestError instanceof ApiError ? requestError.message : 'Не удалось изменить роль.');
    }
  };

  const saveBalance = async (event: FormEvent<HTMLFormElement>, target: AdminUser) => {
    event.preventDefault();
    setActionMessage('');
    const balance = Number(balanceDrafts[target.id]);

    try {
      const response = await api.updateUserBalance(target.id, balance);
      setOverview((current) => {
        if (!current) return current;
        return withUsers(current, current.users.map((item) => (item.id === response.user.id ? response.user : item)));
      });
      setBalanceDrafts((drafts) => ({ ...drafts, [target.id]: String(Math.round(response.user.balance)) }));
      setActionMessage('Баланс обновлён.');
    } catch (requestError) {
      setActionMessage(requestError instanceof ApiError ? requestError.message : 'Не удалось обновить баланс.');
    }
  };

  const updateMarketStatus = async (market: Market, status: MarketStatus) => {
    setActionMessage('');

    try {
      const response = await api.updateMarketStatus(market.id, status);
      setOverview((current) => {
        if (!current) return current;
        return withMarkets(current, current.markets.map((item) => (item.id === response.market.id ? response.market : item)));
      });
      setActionMessage('Статус рынка обновлён.');
    } catch (requestError) {
      setActionMessage(requestError instanceof ApiError ? requestError.message : 'Не удалось обновить рынок.');
    }
  };

  const deleteMarket = async (market: Market) => {
    if (!window.confirm(`Удалить рынок "${market.title}"?`)) return;

    setActionMessage('');

    try {
      await api.deleteMarket(market.id);
      setOverview((current) => {
        if (!current) return current;
        return withMarkets(current, current.markets.filter((item) => item.id !== market.id));
      });
      setActionMessage('Рынок удалён.');
    } catch (requestError) {
      setActionMessage(requestError instanceof ApiError ? requestError.message : 'Не удалось удалить рынок.');
    }
  };

  const exportSnapshot = () => {
    if (!overview) return;

    const blob = new Blob([JSON.stringify(overview, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `legio-admin-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.URL.revokeObjectURL(url);
    setActionMessage('Снимок админки экспортирован.');
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <div className="h-[620px] animate-pulse rounded-2xl border border-pm-border bg-pm-surface" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-89px)] max-w-[760px] items-center px-4 py-10 sm:px-6">
        <div className="w-full rounded-2xl border border-pm-border bg-pm-surface p-6 shadow-[0_18px_48px_var(--color-pm-card-shadow-strong)]">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-pm-surface-hover text-pm-blue">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-pm-text-strong">Нужен вход</h1>
          <p className="mt-2 text-sm leading-6 text-pm-text-muted">Админ-панель открывается только после входа в аккаунт.</p>
          <Link to="/login" className="mt-6 inline-flex h-11 items-center rounded-lg bg-pm-blue px-5 text-sm font-bold text-white">
            Войти
          </Link>
        </div>
      </div>
    );
  }

  if (!user.isAdmin) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-89px)] max-w-[760px] items-center px-4 py-10 sm:px-6">
        <div className="w-full rounded-2xl border border-pm-border bg-pm-surface p-6 shadow-[0_18px_48px_var(--color-pm-card-shadow-strong)]">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-pm-surface-hover text-pm-blue">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-pm-text-strong">Нет прав администратора</h1>
          <p className="mt-2 text-sm leading-6 text-pm-text-muted">
            Первый зарегистрированный пользователь получает админку автоматически. Другой админ может выдать тебе права.
          </p>
          <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-lg border border-pm-border px-5 text-sm font-bold text-pm-text-strong">
            На главную
          </Link>
        </div>
      </div>
    );
  }

  const stats = overview?.stats;
  const statCards = [
    { label: 'Пользователи', value: formatCompact(stats?.userCount ?? 0), icon: UsersRound, tone: 'text-pm-blue' },
    { label: 'Админы', value: formatCompact(stats?.adminCount ?? 0), icon: ShieldCheck, tone: 'text-pm-green' },
    { label: 'Рынки', value: formatCompact(stats?.marketCount ?? 0), icon: BarChart3, tone: 'text-pm-blue' },
    { label: 'Открыты', value: formatCompact(stats?.openMarketCount ?? 0), icon: CheckCircle2, tone: 'text-pm-green' },
    { label: 'Сделки', value: formatCompact(stats?.tradeCount ?? 0), icon: Activity, tone: 'text-pm-blue' },
    { label: 'Оборот', value: formatPoints(stats?.totalVolume ?? 0), icon: Banknote, tone: 'text-pm-green' },
    { label: 'Балансы', value: formatPoints(stats?.totalBalances ?? 0), icon: UserCog, tone: 'text-pm-blue' },
    { label: 'Ликвидность', value: formatPoints(stats?.averageLiquidity ?? 0), icon: SlidersHorizontal, tone: 'text-pm-green' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="mx-auto max-w-[1400px] px-3 py-4 sm:px-6 sm:py-5"
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-pm-border bg-pm-surface text-pm-blue">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">Legio Control</p>
            <h1 className="text-xl font-bold text-pm-text-strong sm:text-2xl">Админ-панель</h1>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => void refreshOverview()}
            disabled={isOverviewLoading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-pm-border bg-pm-surface px-3 text-sm font-bold text-pm-text-strong transition-colors hover:bg-pm-surface-hover disabled:opacity-60 sm:px-4"
          >
            <RefreshCw className={isOverviewLoading ? 'h-4 w-4 animate-spin text-pm-blue' : 'h-4 w-4 text-pm-blue'} />
            Обновить
          </button>
          <button
            type="button"
            onClick={exportSnapshot}
            disabled={!overview}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-pm-border bg-pm-surface px-3 text-sm font-bold text-pm-text-strong transition-colors hover:bg-pm-surface-hover disabled:opacity-60 sm:px-4"
          >
            <Download className="h-4 w-4 text-pm-blue" />
            Экспорт
          </button>
          <Link
            to="/create"
            className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-pm-blue px-4 text-sm font-bold text-white transition-colors hover:bg-blue-700 sm:col-span-1"
          >
            <PlusCircle className="h-4 w-4" />
            Новый рынок
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-3 text-sm font-semibold text-pm-red">
          {error}
        </div>
      )}

      {actionMessage && (
        <div
          className={
            actionMessage.includes('Не ') || actionMessage.includes('Нельзя') || actionMessage.includes('нельзя')
              ? 'mb-4 rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-3 text-sm font-semibold text-pm-red'
              : 'mb-4 flex items-center gap-2 rounded-xl border border-[#22c55e]/30 bg-[#22c55e]/10 px-4 py-3 text-sm font-semibold text-pm-green'
          }
        >
          {!actionMessage.includes('Не ') && !actionMessage.includes('Нельзя') && !actionMessage.includes('нельзя') && (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {actionMessage}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 xl:grid-cols-8">
        {statCards.map((card) => {
          const Icon = card.icon;

          return (
            <div key={card.label} className="rounded-xl border border-pm-border bg-pm-surface p-2.5 shadow-[0_1px_2px_var(--color-pm-card-shadow)] sm:p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">{card.label}</span>
                <Icon className={`h-4 w-4 shrink-0 ${card.tone}`} />
              </div>
              <div className="truncate text-xl font-bold text-pm-text-strong">{card.value}</div>
            </div>
          );
        })}
      </div>

      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto border-b border-pm-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={
              activeTab === tab.id
                ? 'shrink-0 border-b-2 border-pm-blue px-3 py-3 text-sm font-bold text-pm-text-strong'
                : 'shrink-0 px-3 py-3 text-sm font-bold text-pm-text-muted transition-colors hover:text-pm-text-strong'
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(activeTab === 'overview' || activeTab === 'users') && (
        <section className="mb-5 rounded-2xl border border-pm-border bg-pm-surface shadow-[0_18px_44px_var(--color-pm-card-shadow-strong)]">
          <div className="flex flex-col gap-3 border-b border-pm-border p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-pm-text-strong">Пользователи и роли</h2>
              <p className="mt-1 text-sm font-semibold text-pm-text-muted">{filteredUsers.length} из {overview?.users.length ?? 0}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,280px)_150px]">
              <div className="flex h-10 min-w-0 items-center rounded-lg border border-pm-border bg-pm-bg/45 px-3">
                <Search className="mr-2 h-4 w-4 shrink-0 text-pm-text-muted" />
                <input
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                  placeholder="Поиск пользователя"
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-pm-text-strong outline-none placeholder:text-pm-text-muted"
                />
              </div>
              <select
                value={userFilter}
                onChange={(event) => setUserFilter(event.target.value as UserFilter)}
                className="h-10 rounded-lg border border-pm-border bg-pm-bg/45 px-3 text-sm font-bold text-pm-text-strong outline-none"
              >
                <option value="all">Все</option>
                <option value="admins">Админы</option>
                <option value="users">Обычные</option>
              </select>
            </div>
          </div>

          <div className="divide-y divide-pm-border">
            {filteredUsers.length > 0 ? filteredUsers.map((item) => (
              <div key={item.id} className="grid grid-cols-1 gap-3 p-3 sm:p-4 xl:grid-cols-[minmax(0,1.4fr)_220px_240px_220px] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-bold text-pm-text-strong">{item.name}</h3>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${item.isAdmin ? 'border-[#22c55e]/30 bg-[#22c55e]/10 text-pm-green' : 'border-pm-border bg-pm-bg/35 text-pm-text-muted'}`}>
                      {item.isAdmin ? 'Админ' : 'Пользователь'}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold text-pm-text-muted">{item.email}</p>
                  <p className="mt-1 text-xs font-semibold text-pm-text-muted">Создан {formatDate(item.createdAt)}</p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center xl:text-left">
                  <div className="rounded-lg bg-pm-bg/25 px-2 py-2 xl:bg-transparent xl:p-0">
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">Рынки</div>
                    <div className="mt-1 text-sm font-bold text-pm-text-strong">{item.marketCount}</div>
                  </div>
                  <div className="rounded-lg bg-pm-bg/25 px-2 py-2 xl:bg-transparent xl:p-0">
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">Сделки</div>
                    <div className="mt-1 text-sm font-bold text-pm-text-strong">{item.tradeCount}</div>
                  </div>
                  <div className="rounded-lg bg-pm-bg/25 px-2 py-2 xl:bg-transparent xl:p-0">
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">Позиции</div>
                    <div className="mt-1 text-sm font-bold text-pm-text-strong">{item.positionCount}</div>
                  </div>
                </div>

                <form onSubmit={(event) => void saveBalance(event, item)} className="flex items-center gap-2">
                  <input
                    value={balanceDrafts[item.id] ?? String(Math.round(item.balance))}
                    onChange={(event) => setBalanceDrafts((drafts) => ({ ...drafts, [item.id]: event.target.value }))}
                    type="number"
                    min="0"
                    max="1000000"
                    className="h-10 min-w-0 flex-1 rounded-lg border border-pm-border bg-pm-bg/45 px-3 text-sm font-bold text-pm-text-strong outline-none focus:border-pm-blue"
                  />
                  <button type="submit" className="h-10 rounded-lg bg-pm-blue px-3 text-sm font-bold text-white transition-colors hover:bg-blue-700">
                    Баланс
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => void setAdminRole(item, !item.isAdmin)}
                  disabled={item.id === user.id && item.isAdmin}
                  className={
                    item.isAdmin
                      ? 'inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 text-sm font-bold text-pm-red transition-colors hover:bg-[#ef4444]/15 disabled:cursor-not-allowed disabled:opacity-50 xl:w-auto'
                      : 'inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 text-sm font-bold text-pm-green transition-colors hover:bg-[#22c55e]/15 xl:w-auto'
                  }
                >
                  {item.isAdmin ? <XCircle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  {item.isAdmin ? 'Снять админа' : 'Назначить админом'}
                </button>
              </div>
            )) : (
              <div className="p-4">
                <EmptyState title="Пользователи не найдены" text="Измени поиск или фильтр роли." />
              </div>
            )}
          </div>
        </section>
      )}

      {(activeTab === 'overview' || activeTab === 'markets') && (
        <section className="mb-5 rounded-2xl border border-pm-border bg-pm-surface shadow-[0_18px_44px_var(--color-pm-card-shadow-strong)]">
          <div className="flex flex-col gap-3 border-b border-pm-border p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-pm-text-strong">Модерация рынков</h2>
              <p className="mt-1 text-sm font-semibold text-pm-text-muted">{filteredMarkets.length} из {overview?.markets.length ?? 0}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,320px)_170px]">
              <div className="flex h-10 min-w-0 items-center rounded-lg border border-pm-border bg-pm-bg/45 px-3">
                <Search className="mr-2 h-4 w-4 shrink-0 text-pm-text-muted" />
                <input
                  value={marketQuery}
                  onChange={(event) => setMarketQuery(event.target.value)}
                  placeholder="Поиск рынка"
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-pm-text-strong outline-none placeholder:text-pm-text-muted"
                />
              </div>
              <select
                value={marketFilter}
                onChange={(event) => setMarketFilter(event.target.value as MarketFilter)}
                className="h-10 rounded-lg border border-pm-border bg-pm-bg/45 px-3 text-sm font-bold text-pm-text-strong outline-none"
              >
                <option value="all">Все статусы</option>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="divide-y divide-pm-border">
            {filteredMarkets.length > 0 ? filteredMarkets.map((market) => (
              <div key={market.id} className="grid grid-cols-1 gap-3 p-3 sm:p-4 xl:grid-cols-[minmax(0,1.6fr)_250px_210px_120px] xl:items-center">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${statusClassName(market.status)}`}>
                      {statusLabel(market.status)}
                    </span>
                    <span className="rounded-full border border-pm-border bg-pm-bg/35 px-2 py-0.5 text-xs font-bold text-pm-text-muted">
                      {market.category}
                    </span>
                  </div>
                  <Link to={`/market/${market.id}`} className="line-clamp-2 text-base font-bold leading-snug text-pm-text-strong transition-colors hover:text-pm-blue">
                    {market.title}
                  </Link>
                  <p className="mt-1 text-xs font-semibold text-pm-text-muted">
                    {market.createdBy?.name ?? 'Без автора'} • до {formatDate(market.closeDate)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">Да</div>
                    <div className="mt-1 font-bold text-pm-green">{market.yesPercent}%</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">Нет</div>
                    <div className="mt-1 font-bold text-pm-red">{market.noPercent}%</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">Объём</div>
                    <div className="mt-1 font-bold text-pm-text-strong">{formatCompact(market.volume)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">Сделки</div>
                    <div className="mt-1 font-bold text-pm-text-strong">{market.tradeCount}</div>
                  </div>
                </div>

                <select
                  value={market.status}
                  onChange={(event) => void updateMarketStatus(market, event.target.value as MarketStatus)}
                  className="h-10 w-full rounded-lg border border-pm-border bg-pm-bg/45 px-3 text-sm font-bold text-pm-text-strong outline-none focus:border-pm-blue"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-2 xl:flex xl:items-center xl:justify-end">
                  <Link
                    to={`/market/${market.id}`}
                    aria-label="Открыть рынок"
                    className="flex h-10 items-center justify-center rounded-lg border border-pm-border bg-pm-bg/35 text-pm-text transition-colors hover:bg-pm-surface-hover hover:text-pm-text-strong xl:w-10"
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => void deleteMarket(market)}
                    aria-label="Удалить рынок"
                    className="flex h-10 items-center justify-center rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 text-pm-red transition-colors hover:bg-[#ef4444]/15 xl:w-10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )) : (
              <div className="p-4">
                <EmptyState title="Рынки не найдены" text="Измени поиск, статус или создай новый рынок." />
              </div>
            )}
          </div>
        </section>
      )}

      {(activeTab === 'overview' || activeTab === 'activity') && (
        <section className="rounded-2xl border border-pm-border bg-pm-surface shadow-[0_18px_44px_var(--color-pm-card-shadow-strong)]">
          <div className="flex flex-col gap-3 border-b border-pm-border p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-4">
            <div>
              <h2 className="text-lg font-bold text-pm-text-strong">Последняя активность</h2>
              <p className="mt-1 text-sm font-semibold text-pm-text-muted">Последние {overview?.recentTrades.length ?? 0} сделок</p>
            </div>
            <div className="text-sm font-semibold text-pm-text-muted">
              Новый пользователь: {formatDate(stats?.latestUserAt)}
            </div>
          </div>

          <div className="divide-y divide-pm-border">
            {(overview?.recentTrades.length ?? 0) > 0 ? overview?.recentTrades.map((trade) => (
              <div key={trade.id} className="grid grid-cols-1 gap-2 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_180px_160px] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-bold text-pm-text-strong">{trade.userName}</span>
                    <span className="font-semibold text-pm-text-muted">{trade.side === 'BUY' ? 'купил' : 'продал'}</span>
                    <span className={trade.outcome === 'YES' ? 'font-bold text-pm-green' : 'font-bold text-pm-red'}>
                      {trade.outcome === 'YES' ? 'Да' : 'Нет'}
                    </span>
                  </div>
                  <Link to={`/market/${trade.marketId}`} className="mt-1 line-clamp-1 text-sm font-semibold text-pm-text-muted transition-colors hover:text-pm-blue">
                    {trade.marketTitle}
                  </Link>
                </div>
                <div className="text-sm font-bold text-pm-text-strong">
                  {formatPoints(trade.amount)} по {trade.priceCents}¢
                </div>
                <div className="text-sm font-semibold text-pm-text-muted">{formatDate(trade.createdAt)}</div>
              </div>
            )) : (
              <div className="p-4">
                <EmptyState title="Сделок пока нет" text="Лента заполнится после первых покупок или продаж." />
              </div>
            )}
          </div>
        </section>
      )}
    </motion.div>
  );
}
