import React, { useCallback, useEffect, useState } from 'react';
import { getApiUrl } from '../config';
import { Trophy, Crown, CalendarClock, Gift, Users } from 'lucide-react';
import { User } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { Avatar } from './Avatar';
import { CountdownTimer } from './CountdownTimer';
import { UserProfileModal } from './UserProfileModal';

type LeaderboardTab = 'month' | 'all';

// Genitive for the Russian heading ("Ивент июля"), nominative for English.
const MONTHS_GENITIVE_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface MonthlyLeader extends User {
    monthlyPoints: number;
    totalPoints: number;
    monthlyWins: number;
    displayName: string;
}

interface MonthlyResponse {
    monthIndex: number;
    year: number;
    isCurrentMonth: boolean;
    periodEnd: string;
    serverTime: string;
    // Flat reward for the winner, independent of their score.
    prizePoints: number;
    participants: number;
    winner: MonthlyLeader | null;
    leaders: MonthlyLeader[];
}

type AllTimeLeader = User & { monthlyPoints?: number };

// Shared row styling: gold / silver / bronze for the podium, neutral for the rest.
const rowClass = (index: number) => {
    if (index === 0) {
        return 'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-500/10 dark:to-orange-500/10 border-yellow-200 dark:border-yellow-500/20 shadow-lg shadow-yellow-500/5';
    }
    if (index === 1) {
        return 'bg-gradient-to-r from-zinc-50 to-slate-50 dark:from-zinc-800/40 dark:to-slate-800/40 border-zinc-200 dark:border-zinc-700';
    }
    if (index === 2) {
        return 'bg-gradient-to-r from-orange-50 to-rose-50 dark:from-orange-900/10 dark:to-red-900/10 border-orange-200 dark:border-orange-800/30';
    }
    return 'bg-white/50 dark:bg-zinc-900/30 border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50';
};

const badgeClass = (index: number) => {
    if (index === 0) return 'bg-yellow-500 text-white ring-4 ring-yellow-100 dark:ring-yellow-900/30';
    if (index === 1) return 'bg-zinc-400 text-white';
    if (index === 2) return 'bg-amber-700 text-white';
    return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400';
};

export const Leaderboard: React.FC = () => {
    const { t, language } = useLanguage();
    const [tab, setTab] = useState<LeaderboardTab>('month');
    const [leaders, setLeaders] = useState<AllTimeLeader[]>([]);
    const [monthly, setMonthly] = useState<MonthlyResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

    // `silent` keeps the table on screen during a background refresh — only the first load shows
    // the spinner, so a poll never makes the page flash empty.
    const load = useCallback((silent = false) => {
        if (!silent) setLoading(true);

        return Promise.all([
            fetch(getApiUrl('/api/leaders')).then(res => (res.ok ? res.json() : null)),
            fetch(getApiUrl('/api/leaders/monthly')).then(res => (res.ok ? res.json() : null)),
        ])
            .then(([allTime, monthlyData]) => {
                if (Array.isArray(allTime)) setLeaders(allTime);
                if (monthlyData && Array.isArray(monthlyData.leaders)) setMonthly(monthlyData);
            })
            .catch(err => {
                console.error(err);
                // A failed refresh leaves the previous standings in place rather than wiping them.
            })
            .finally(() => {
                if (!silent) setLoading(false);
            });
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Standings move whenever a poll is resolved elsewhere, so re-read them periodically and the
    // moment the tab comes back into focus.
    useEffect(() => {
        const refresh = () => load(true);
        const onVisible = () => {
            if (document.visibilityState === 'visible') refresh();
        };

        const interval = setInterval(refresh, 60_000);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [load]);

    const monthIndex = monthly?.monthIndex ?? new Date().getMonth();
    const eventHeading = language === 'ru'
        ? `${t.leaderboard.monthlyTitle} — ${MONTHS_GENITIVE_RU[monthIndex]}`
        : `${MONTHS_EN[monthIndex]} — ${t.leaderboard.monthlyTitle}`;

    const rows: Array<{
        id: number | string;
        displayName: string;
        username: string;
        avatar: string;
        primary: number;
        secondary?: number;
        wins?: number;
    }> = tab === 'month'
            ? (monthly?.leaders || []).map(user => ({
                id: user.id,
                displayName: user.displayName || user.name || user.username,
                username: user.username,
                avatar: user.avatar,
                primary: user.monthlyPoints,
                secondary: user.totalPoints,
                wins: user.monthlyWins,
            }))
            : leaders.map(user => ({
                id: user.id,
                displayName: user.name || user.username,
                username: user.username,
                avatar: user.avatar,
                primary: user.points,
                secondary: user.monthlyPoints,
            }));

    const tabButtonClass = (isActive: boolean) => [
        'flex-1 py-2 px-3 text-sm font-semibold rounded-full transition-colors',
        isActive
            ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
            : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200',
    ].join(' ');

    return (
        <div className="bg-white/80 dark:bg-[#121212]/80 backdrop-blur-xl rounded-2xl lg:rounded-[32px] p-4 lg:p-8 border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden w-full">
            <h2 className="text-2xl font-bold mb-6 dark:text-white flex items-center gap-3 px-2">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-500/10 rounded-xl">
                    <Trophy className="text-yellow-600 dark:text-yellow-500 w-6 h-6" />
                </div>
                {t.leaderboard.title}
            </h2>

            {/* Monthly event card: current winner + countdown to the next one. Its own table lives
                below, under the "За месяц" tab. */}
            {monthly && (
                <div className="mb-6 rounded-[24px] border border-yellow-200 dark:border-yellow-500/20 bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 dark:from-yellow-500/10 dark:via-amber-500/5 dark:to-orange-500/10 p-4 lg:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-2 min-w-0">
                            <Gift size={18} className="text-yellow-600 dark:text-yellow-500 shrink-0" />
                            <h3 className="font-bold text-zinc-900 dark:text-white truncate">{eventHeading}</h3>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                            <Users size={14} />
                            <span>{monthly.participants} {t.leaderboard.participants}</span>
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
                        {/* Current winner */}
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-500 mb-2">
                                {t.leaderboard.currentWinner}
                            </p>
                            {monthly.winner ? (
                                <button
                                    onClick={() => setSelectedUserId(Number(monthly.winner!.id))}
                                    className="flex items-center gap-3 w-full text-left group"
                                >
                                    <div className="relative shrink-0">
                                        <Avatar
                                            src={monthly.winner.avatar}
                                            alt={monthly.winner.displayName}
                                            size={48}
                                            className="rounded-full ring-2 ring-yellow-300 dark:ring-yellow-500/40"
                                            fallbackText={monthly.winner.displayName}
                                        />
                                        <div className="absolute -bottom-1 -right-1 bg-yellow-500 text-white p-1 rounded-full shadow-sm">
                                            <Crown size={10} fill="currentColor" />
                                        </div>
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-bold text-zinc-900 dark:text-white truncate group-hover:text-yellow-700 dark:group-hover:text-yellow-500 transition-colors">
                                            {monthly.winner.displayName}
                                        </div>
                                        {/* The reward is the flat prize; the score below is only why
                                            this person is in front. */}
                                        <div className="text-sm font-semibold text-yellow-700 dark:text-yellow-500 tabular-nums">
                                            +{(monthly.prizePoints || 0).toLocaleString()} {t.leaderboard.pointsLabel}
                                        </div>
                                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                                            {monthly.winner.monthlyPoints.toLocaleString()} {t.leaderboard.monthlyPointsLabel}
                                        </div>
                                    </div>
                                </button>
                            ) : (
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">{t.leaderboard.noMonthlyLeaders}</p>
                            )}
                        </div>

                        {/* Countdown to the moment the winner is locked in */}
                        <div className="lg:border-l lg:border-yellow-200 dark:lg:border-yellow-500/20 lg:pl-6">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-500 mb-2">
                                <CalendarClock size={13} />
                                <span>{t.leaderboard.newWinnerIn}</span>
                            </div>
                            {monthly.isCurrentMonth ? (
                                <CountdownTimer
                                    deadline={monthly.periodEnd}
                                    serverTime={monthly.serverTime}
                                    // The month just rolled over — refetch so the prize is settled
                                    // and the fresh event starts from zero.
                                    onExpire={() => load(true)}
                                />
                            ) : (
                                <p className="text-sm font-semibold text-zinc-500">{t.leaderboard.eventClosed}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs: the monthly event table and the all-time table are two separate rankings. */}
            <div className="flex p-1 mb-2 bg-zinc-100 dark:bg-zinc-800/80 rounded-full">
                <button onClick={() => setTab('month')} className={tabButtonClass(tab === 'month')}>
                    {t.leaderboard.monthlyTab}
                </button>
                <button onClick={() => setTab('all')} className={tabButtonClass(tab === 'all')}>
                    {t.leaderboard.allTimeTab}
                </button>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5 px-2">
                {tab === 'month' ? t.leaderboard.monthlySubtitle : t.leaderboard.allTimeSubtitle}
            </p>

            <div className="space-y-3">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <p>{t.leaderboard.loading}</p>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="text-center py-16 text-zinc-500 dark:text-zinc-400 text-sm">
                        {tab === 'month' ? t.leaderboard.noMonthlyLeaders : t.rightPanel.noLeaders}
                    </div>
                ) : rows.map((row, index) => (
                    <button
                        key={`${tab}-${row.id}`}
                        onClick={() => setSelectedUserId(Number(row.id))}
                        className={`relative group flex items-center gap-3 lg:gap-4 p-3 lg:p-4 rounded-2xl transition-all duration-300 border w-full text-left ${rowClass(index)}`}
                    >
                        {/* Rank Badge */}
                        <div className={`flex-shrink-0 w-8 h-8 lg:w-10 lg:h-10 flex items-center justify-center rounded-full font-bold text-sm lg:text-base shadow-sm ${badgeClass(index)}`}>
                            {index === 0 ? <Crown size={16} fill="currentColor" /> : index + 1}
                        </div>

                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                            <Avatar
                                src={row.avatar}
                                alt={row.displayName}
                                size={index < 3 ? 48 : 40}
                                className="rounded-full bg-zinc-200 dark:bg-zinc-800 object-cover ring-2 ring-white dark:ring-zinc-900"
                                fallbackText={row.displayName}
                            />
                            {index < 3 && (
                                <div className="absolute -bottom-1 -right-1 flex items-center justify-center w-5 h-5 bg-white dark:bg-zinc-900 rounded-full shadow-sm text-[10px]">
                                    {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                                </div>
                            )}
                        </div>

                        {/* User Info */}
                        <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <span className={`font-bold text-sm lg:text-lg truncate ${index === 0 ? 'text-yellow-700 dark:text-yellow-500' : 'text-zinc-900 dark:text-white'}`}>
                                    {row.displayName}
                                </span>
                                {index === 0 && <Crown size={14} className="text-yellow-500 flex-shrink-0 hidden lg:block" />}
                            </div>
                            <div className="text-xs text-zinc-500 truncate font-medium">
                                @{row.username}
                                {tab === 'month' && row.wins ? ` · ${row.wins} ${t.leaderboard.winsLabel}` : ''}
                            </div>
                        </div>

                        {/* Points — the primary number is whatever the active tab ranks on. */}
                        <div className="text-right flex-shrink-0 pl-2 border-l border-zinc-100 dark:border-zinc-800">
                            <div className="font-bold text-blue-600 dark:text-blue-400 text-sm lg:text-lg tabular-nums">
                                {row.primary.toLocaleString()}
                            </div>
                            <div className="text-[10px] lg:text-xs text-zinc-400 font-medium uppercase tracking-wider">
                                {tab === 'month' ? t.leaderboard.monthlyPointsLabel : t.leaderboard.pointsLabel}
                            </div>
                            {row.secondary !== undefined && (
                                <div className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums mt-0.5">
                                    {row.secondary.toLocaleString()} {tab === 'month' ? t.leaderboard.totalPointsLabel : t.leaderboard.monthlyPointsLabel}
                                </div>
                            )}
                        </div>
                    </button>
                ))}
            </div>

            <UserProfileModal
                isOpen={selectedUserId !== null}
                onClose={() => setSelectedUserId(null)}
                userId={selectedUserId}
            />
        </div>
    );
};
