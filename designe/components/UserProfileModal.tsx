import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, Trophy, Target, Clock, Vote, CheckCircle2, Hourglass, TrendingUp } from 'lucide-react';
import { useMountTransition } from '../hooks/useMountTransition';
import { useScrollLock } from '../hooks/useScrollLock';
import { Avatar } from './Avatar';
import { getApiUrl } from '../config';
import { formatDateOnly } from '../utils/date';
import { getLevel } from '../constants';

export interface ProfileUser {
    id: number;
    username: string;
    name: string;
    avatar: string;
    bio?: string;
    birthdate?: string;
    points: number;
    level?: number;
    role: string;
    created_at: string;
}

interface ProfileStats {
    votesTotal: number;
    votesResolved: number;
    votesCorrect: number;
    votesWrong: number;
    votesPending: number;
    accuracy: number | null;
    monthlyPoints: number;
    allTimeRank: number | null;
    monthlyRank: number | null;
}

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    // Either hand over a row you already have (the feed's voter chips do) or just an id and let
    // the modal fetch it (the leaderboard does).
    user?: ProfileUser | null;
    userId?: number | null;
}

const StatTile: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: React.ReactNode;
    tone?: string;
    className?: string;
}> = ({ icon, label, value, tone = 'bg-zinc-500/10 text-zinc-500', className = '' }) => (
    <div className={`p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex items-center gap-3 ${className}`}>
        <div className={`p-2 rounded-xl shrink-0 ${tone}`}>{icon}</div>
        <div className="min-w-0">
            <p className="text-xs text-zinc-500 truncate">{label}</p>
            <p className="font-bold text-zinc-900 dark:text-white truncate">{value}</p>
        </div>
    </div>
);

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, user, userId }) => {
    const hasTransitionedIn = useMountTransition(isOpen, 300);
    useScrollLock(isOpen);
    const [freshUser, setFreshUser] = useState<ProfileUser | null>(user || null);
    const [stats, setStats] = useState<ProfileStats | null>(null);
    const [loading, setLoading] = useState(false);

    const targetId = userId ?? user?.id ?? null;

    useEffect(() => {
        setFreshUser(user || null);
    }, [user]);

    useEffect(() => {
        if (!isOpen || !targetId) return;

        // A new target means the previous person's numbers must not linger on screen.
        setStats(null);
        setLoading(true);

        const token = localStorage.getItem('token');
        fetch(getApiUrl(`/api/users/${targetId}/profile`), {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
            .then((res) => {
                if (!res.ok) throw new Error('Failed to fetch profile');
                return res.json();
            })
            .then((data) => {
                if (data && data.id) {
                    setFreshUser(data);
                    setStats(data.stats || null);
                }
            })
            .catch(() => {
                // Keep whatever the caller passed in when the refresh fails.
            })
            .finally(() => setLoading(false));
    }, [isOpen, targetId]);

    const displayUser = freshUser || user;

    if (!displayUser) return null;
    if (!hasTransitionedIn && !isOpen) return null;

    const displayName = displayUser.name || displayUser.username;
    const levelName = getLevel(displayUser.points || 0).name;

    return createPortal(
        <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${isOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'}`}>
            <div
                className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ease-out ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            />

            <div
                className={`relative bg-white dark:bg-[#121212] w-full max-w-md max-h-[90vh] overflow-y-auto rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-2xl will-change-transform transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
            >

                {/* Header / Cover */}
                <div className="h-32 bg-gradient-to-r from-blue-500 to-purple-600 relative">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors backdrop-blur-md"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Avatar & Basic Info */}
                <div className="px-6 pb-6 -mt-12 relative">
                    <div className="flex flex-col items-center">
                        <div className="w-24 h-24 rounded-full border-4 border-white dark:border-[#121212] overflow-hidden shadow-lg bg-zinc-100 dark:bg-zinc-800">
                            <Avatar src={displayUser.avatar} alt={displayUser.username} size={96} className="w-full h-full object-cover" fallbackText={displayName} />
                        </div>

                        <h2 className="mt-3 text-xl font-bold text-zinc-900 dark:text-white text-center">
                            {displayName}
                        </h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">@{displayUser.username}</p>

                        <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                {levelName}
                            </span>
                            {displayUser.role !== 'user' && (
                                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${displayUser.role === 'admin'
                                    ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                                    : 'bg-purple-500/10 text-purple-500 border border-purple-500/20'
                                    }`}>
                                    {displayUser.role}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Stats / Details */}
                    <div className="mt-6 space-y-3">
                        {displayUser.bio && (
                            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                                <p className="text-sm text-zinc-600 dark:text-zinc-300 italic text-center">
                                    "{displayUser.bio}"
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <StatTile
                                icon={<Trophy size={18} />}
                                label={stats?.allTimeRank ? `Очки · #${stats.allTimeRank} в рейтинге` : 'Очки'}
                                value={(displayUser.points || 0).toLocaleString()}
                                tone="bg-yellow-500/10 text-yellow-500"
                            />
                            <StatTile
                                icon={<TrendingUp size={18} />}
                                label={stats?.monthlyRank ? `За месяц · #${stats.monthlyRank}` : 'За месяц'}
                                value={stats ? `+${stats.monthlyPoints.toLocaleString()}` : (loading ? '…' : '+0')}
                                tone="bg-green-500/10 text-green-500"
                            />
                            <StatTile
                                icon={<Vote size={18} />}
                                label="Прогнозов"
                                value={stats ? stats.votesTotal.toLocaleString() : (loading ? '…' : '0')}
                                tone="bg-blue-500/10 text-blue-500"
                            />
                            <StatTile
                                icon={<Target size={18} />}
                                label="Точность"
                                value={stats?.accuracy !== null && stats?.accuracy !== undefined ? `${stats.accuracy}%` : (loading ? '…' : '—')}
                                tone="bg-purple-500/10 text-purple-500"
                            />
                            <StatTile
                                icon={<CheckCircle2 size={18} />}
                                label="Верных прогнозов"
                                value={stats ? `${stats.votesCorrect} / ${stats.votesResolved}` : (loading ? '…' : '0')}
                                tone="bg-emerald-500/10 text-emerald-500"
                            />
                            <StatTile
                                icon={<Hourglass size={18} />}
                                label="Ждут результата"
                                value={stats ? stats.votesPending.toLocaleString() : (loading ? '…' : '0')}
                                tone="bg-amber-500/10 text-amber-500"
                            />
                            <StatTile
                                icon={<Calendar size={18} />}
                                label="Дата рождения"
                                value={formatDateOnly(displayUser.birthdate, 'Не указана')}
                                tone="bg-pink-500/10 text-pink-500"
                            />
                            <StatTile
                                icon={<Clock size={18} />}
                                label="Регистрация"
                                value={formatDateOnly(displayUser.created_at, 'Неизвестно')}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
