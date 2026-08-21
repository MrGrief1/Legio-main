import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Trophy, Target, Vote, CheckCircle2, XCircle, Hourglass, Heart, AlertTriangle,
    TrendingUp, Medal, Clock, Calendar, CalendarClock, Shield, History, Tag,
} from 'lucide-react';
import { useMountTransition } from '../hooks/useMountTransition';
import { useScrollLock } from '../hooks/useScrollLock';
import { useBackClose } from '../hooks/useBackClose';
import { useLanguage } from '../context/LanguageContext';
import { Avatar } from './Avatar';
import { getApiUrl } from '../config';
import { formatDateOnly, formatDateTime } from '../utils/date';
import { getLevel } from '../constants';

export interface AdminUserRow {
    id: number;
    username: string;
    name?: string;
    role: string;
    points: number;
    level?: number;
    avatar?: string;
    created_at?: string;
    last_seen?: string;
    votes_count?: number;
}

interface UserDetails extends AdminUserRow {
    displayName: string;
    bio?: string;
    birthdate?: string;
    stats: {
        votesTotal: number;
        votesCorrect: number;
        votesWrong: number;
        votesPending: number;
        votesResolved: number;
        accuracy: number | null;
        likesGiven: number;
        reportsSubmitted: number;
        messagesSent: number;
        monthlyPoints: number;
        monthlyWins: number;
        allTimeRank: number | null;
        monthlyRank: number | null;
        totalUsers: number;
        firstVoteAt: string | null;
        lastVoteAt: string | null;
    };
    topCategories: { id: string; label: string; count: number }[];
    pointsHistory: { id: number; points: number; date: string; comment: string }[];
}

interface UserDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: number | null;
    // Shown while the full record loads, so the modal never opens empty.
    fallback?: AdminUserRow | null;
    onRoleChange?: (userId: number, role: string) => void;
}

const roleBadgeClass = (role: string) => {
    if (role === 'admin') return 'bg-purple-100 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400 border-purple-200 dark:border-purple-500/20';
    if (role === 'creator') return 'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20';
    return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700';
};

const Stat: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: React.ReactNode;
    tone?: string;
    hint?: string;
}> = ({ icon, label, value, tone = 'bg-zinc-500/10 text-zinc-500', hint }) => (
    <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
        <div className="flex items-start gap-2 mb-1.5">
            <div className={`p-1.5 rounded-lg shrink-0 ${tone}`}>{icon}</div>
            {/* Labels wrap rather than truncate — "Точность прогнозов" must stay readable in a
                four-across grid. min-w-0 keeps the flex child from overflowing the tile. */}
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-snug min-w-0 pt-0.5">{label}</p>
        </div>
        <p className="text-lg font-bold text-zinc-900 dark:text-white tabular-nums leading-tight break-words">{value}</p>
        {hint && <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 break-words">{hint}</p>}
    </div>
);

export const UserDetailsModal: React.FC<UserDetailsModalProps> = ({
    isOpen,
    onClose,
    userId,
    fallback,
    onRoleChange,
}) => {
    const hasTransitionedIn = useMountTransition(isOpen, 300);
    useScrollLock(isOpen);
    // Кнопка «назад» закрывает модалку, а не уводит с сайта.
    useBackClose(isOpen, onClose);
    const { t } = useLanguage();
    const [details, setDetails] = useState<UserDetails | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!isOpen || !userId) return;

        // Clear first: opening a second user must never flash the previous one's numbers.
        setDetails(null);
        setError(false);
        setLoading(true);

        fetch(getApiUrl(`/api/admin/users/${userId}`), {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        })
            .then((res) => {
                if (!res.ok) throw new Error('Failed to load user details');
                return res.json();
            })
            .then((data) => setDetails(data))
            .catch(() => setError(true))
            .finally(() => setLoading(false));
    }, [isOpen, userId]);

    if (!isOpen && !hasTransitionedIn) return null;
    if (!userId) return null;

    const shown = details || fallback;
    const displayName = details?.displayName || shown?.name || shown?.username || '';
    const stats = details?.stats;
    const levelName = shown ? getLevel(shown.points || 0).name : '';

    return createPortal(
        <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-3 lg:p-4 transition-all duration-300 ${isOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'}`}>
            <div
                className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            />

            <div
                className={`relative bg-white dark:bg-[#121212] w-full max-w-2xl max-h-[92vh] flex flex-col rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
            >
                {/* Header */}
                <div className="relative shrink-0 bg-gradient-to-r from-blue-500 to-purple-600 px-5 lg:px-6 pt-5 pb-5">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors backdrop-blur-md"
                        aria-label={t.cancel}
                    >
                        <X size={18} />
                    </button>

                    <div className="flex items-center gap-4 pr-12">
                        {/* The wrapper owns the size (and it is responsive), so the avatar fills it
                            rather than declaring its own px — an 80px avatar inside this 64px box
                            overflowed and got cropped off-centre by overflow-hidden. */}
                        <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-full border-4 border-white/80 dark:border-white/20 overflow-hidden shadow-lg bg-white/20 shrink-0">
                            <Avatar
                                src={shown?.avatar || ''}
                                alt={displayName}
                                size={72}
                                fill
                                className="object-cover"
                                fallbackText={displayName}
                            />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg lg:text-2xl font-bold text-white truncate">{displayName}</h2>
                            <p className="text-sm text-white/80 truncate">@{shown?.username}</p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/20 text-white backdrop-blur-sm">
                                    {shown?.role}
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/20 text-white backdrop-blur-sm">
                                    {levelName}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 lg:px-6 py-5 space-y-6">
                    {loading && !details && (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-500">
                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-sm">{t.admin.loadingDetails}</p>
                        </div>
                    )}

                    {error && (
                        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                            <AlertTriangle size={16} className="shrink-0" />
                            {t.admin.detailsFailed}
                        </div>
                    )}

                    {details && (
                        <>
                            {details.bio && (
                                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
                                    <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-1">{t.admin.bio}</p>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-300 italic">"{details.bio}"</p>
                                </div>
                            )}

                            {/* Overview */}
                            <section>
                                <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-3">{t.admin.overview}</h3>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                                    <Stat
                                        icon={<Trophy size={14} />}
                                        label={t.points}
                                        value={(details.points || 0).toLocaleString()}
                                        tone="bg-yellow-500/10 text-yellow-500"
                                        hint={stats?.allTimeRank ? `#${stats.allTimeRank} ${t.admin.outOf} ${stats.totalUsers}` : undefined}
                                    />
                                    <Stat
                                        icon={<TrendingUp size={14} />}
                                        label={t.admin.monthlyPoints}
                                        value={`+${(stats?.monthlyPoints || 0).toLocaleString()}`}
                                        tone="bg-green-500/10 text-green-500"
                                        hint={stats?.monthlyRank ? `#${stats.monthlyRank} ${t.leaderboard.monthlyTab.toLowerCase()}` : undefined}
                                    />
                                    <Stat
                                        icon={<Target size={14} />}
                                        label={t.admin.accuracy}
                                        value={stats?.accuracy !== null && stats?.accuracy !== undefined ? `${stats.accuracy}%` : '—'}
                                        tone="bg-purple-500/10 text-purple-500"
                                        hint={stats ? `${stats.votesCorrect} / ${stats.votesResolved}` : undefined}
                                    />
                                    <Stat
                                        icon={<Medal size={14} />}
                                        label={t.admin.level}
                                        value={details.level || getLevel(details.points || 0).id}
                                        tone="bg-blue-500/10 text-blue-500"
                                        hint={levelName}
                                    />
                                </div>
                            </section>

                            {/* Activity */}
                            <section>
                                <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-3">{t.admin.activity}</h3>
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                                    <Stat icon={<Vote size={14} />} label={t.admin.votesTotal} value={stats?.votesTotal ?? 0} tone="bg-blue-500/10 text-blue-500" />
                                    <Stat icon={<CheckCircle2 size={14} />} label={t.admin.correctVotes} value={stats?.votesCorrect ?? 0} tone="bg-emerald-500/10 text-emerald-500" />
                                    <Stat icon={<XCircle size={14} />} label={t.admin.wrongVotes} value={stats?.votesWrong ?? 0} tone="bg-red-500/10 text-red-500" />
                                    <Stat icon={<Hourglass size={14} />} label={t.admin.pendingVotes} value={stats?.votesPending ?? 0} tone="bg-amber-500/10 text-amber-500" />
                                    <Stat icon={<Heart size={14} />} label={t.admin.likesGiven} value={stats?.likesGiven ?? 0} tone="bg-pink-500/10 text-pink-500" />
                                    <Stat icon={<AlertTriangle size={14} />} label={t.admin.reportsSubmitted} value={stats?.reportsSubmitted ?? 0} tone="bg-orange-500/10 text-orange-500" />
                                </div>
                            </section>

                            {/* Dates */}
                            <section className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <Stat icon={<Clock size={14} />} label={t.admin.registered} value={formatDateTime(details.created_at, '—')} />
                                <Stat icon={<CalendarClock size={14} />} label={t.admin.lastSeen} value={formatDateTime(details.last_seen, t.admin.never)} />
                                <Stat icon={<Vote size={14} />} label={t.admin.firstVote} value={formatDateTime(stats?.firstVoteAt, t.admin.noVotesYet)} />
                                <Stat icon={<Vote size={14} />} label={t.admin.lastVote} value={formatDateTime(stats?.lastVoteAt, t.admin.noVotesYet)} />
                                <Stat icon={<Calendar size={14} />} label={t.admin.birthdate} value={formatDateOnly(details.birthdate, t.admin.notSet)} tone="bg-pink-500/10 text-pink-500" />
                                <Stat icon={<Shield size={14} />} label={t.admin.role} value={<span className="uppercase">{details.role}</span>} tone="bg-purple-500/10 text-purple-500" />
                            </section>

                            {/* Favorite categories */}
                            {details.topCategories.length > 0 && (
                                <section>
                                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-3 flex items-center gap-1.5">
                                        <Tag size={12} /> {t.admin.favoriteCategories}
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        {details.topCategories.map((category) => (
                                            <span
                                                key={category.id}
                                                className="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700"
                                            >
                                                {category.label}
                                                <span className="ml-1.5 text-zinc-400 tabular-nums">{category.count}</span>
                                            </span>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Points ledger */}
                            <section>
                                <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-3 flex items-center gap-1.5">
                                    <History size={12} /> {t.admin.pointsLedger}
                                </h3>
                                {details.pointsHistory.length === 0 ? (
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400 py-3">{t.admin.noPointsHistory}</p>
                                ) : (
                                    <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
                                        {details.pointsHistory.map((entry) => (
                                            <div key={entry.id} className="flex items-start gap-3 p-3 bg-zinc-50/50 dark:bg-zinc-900/30">
                                                <span className={`shrink-0 px-2 py-0.5 rounded-lg text-xs font-bold tabular-nums ${entry.points >= 0
                                                    ? 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400'
                                                    : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'
                                                    }`}>
                                                    {entry.points >= 0 ? '+' : ''}{entry.points}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm text-zinc-700 dark:text-zinc-300 break-words">{entry.comment}</p>
                                                    <p className="text-[11px] text-zinc-400 mt-0.5">{formatDateTime(entry.date)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </>
                    )}
                </div>

                {/* Footer: role control, so an admin can act on what the stats just showed. */}
                {onRoleChange && shown && (
                    <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 px-5 lg:px-6 py-4 flex items-center justify-between gap-3 bg-zinc-50 dark:bg-zinc-900/50">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-zinc-500 shrink-0">{t.admin.changeRoleLabel}</span>
                            <span className={`px-2 py-1 rounded-md text-xs font-medium border ${roleBadgeClass(shown.role)}`}>
                                {shown.role}
                            </span>
                        </div>
                        <select
                            value={shown.role}
                            onChange={(e) => onRoleChange(shown.id, e.target.value)}
                            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm dark:text-white cursor-pointer focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="user">User</option>
                            <option value="creator">Creator</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};
