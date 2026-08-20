import React, { useEffect, useState } from 'react';
import { Calendar, Clock, CheckCircle2, Hourglass, Target, TrendingUp, Trophy, Vote } from 'lucide-react';
import { getApiUrl } from '../config';
import { formatDateOnly } from '../utils/date';

// Карточка профиля («очки, точность, верных прогнозов…») жила только в модалке чужого профиля.
// Про себя те же цифры не было видно нигде: в «Рейтинге» показывались одни уровни. Плитки и
// загрузка статистики вынесены сюда, чтобы обе модалки показывали ровно один и тот же набор.

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

export interface ProfileStats {
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

// Читает профиль вместе со статистикой. `enabled` нужен, чтобы модалка не ходила на сервер,
// пока она закрыта, и чтобы при смене героя чужие цифры не оставались на экране.
export const useProfileData = (targetId: number | null, enabled: boolean, initial?: ProfileUser | null) => {
    const [user, setUser] = useState<ProfileUser | null>(initial || null);
    const [stats, setStats] = useState<ProfileStats | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setUser(initial || null);
    }, [initial]);

    useEffect(() => {
        if (!enabled || !targetId) return;

        setStats(null);
        setLoading(true);

        const token = localStorage.getItem('token');
        let cancelled = false;

        fetch(getApiUrl(`/api/users/${targetId}/profile`), {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
            .then((res) => {
                if (!res.ok) throw new Error('Failed to fetch profile');
                return res.json();
            })
            .then((data) => {
                if (cancelled || !data || !data.id) return;
                setUser(data);
                setStats(data.stats || null);
            })
            .catch(() => {
                // Оставляем то, что уже передал вызывающий: пустой экран хуже устаревших цифр.
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [enabled, targetId]);

    return { user, stats, loading };
};

export const StatTile: React.FC<{
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

interface ProfileStatsGridProps {
    user: ProfileUser | null;
    stats: ProfileStats | null;
    loading: boolean;
    // Дата рождения и дата регистрации нужны в полном профиле; в «Рейтинге» они лишние.
    showPersonal?: boolean;
}

export const ProfileStatsGrid: React.FC<ProfileStatsGridProps> = ({ user, stats, loading, showPersonal = true }) => {
    const dash = loading ? '…' : '0';

    return (
        <div className="grid grid-cols-2 gap-3">
            <StatTile
                icon={<Trophy size={18} />}
                label={stats?.allTimeRank ? `Очки · #${stats.allTimeRank} в рейтинге` : 'Очки'}
                value={(user?.points || 0).toLocaleString()}
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
                value={stats ? stats.votesTotal.toLocaleString() : dash}
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
                value={stats ? `${stats.votesCorrect} / ${stats.votesResolved}` : dash}
                tone="bg-emerald-500/10 text-emerald-500"
            />
            <StatTile
                icon={<Hourglass size={18} />}
                label="Ждут результата"
                value={stats ? stats.votesPending.toLocaleString() : dash}
                tone="bg-amber-500/10 text-amber-500"
            />

            {showPersonal && (
                <>
                    <StatTile
                        icon={<Calendar size={18} />}
                        label="Дата рождения"
                        value={formatDateOnly(user?.birthdate, 'Не указана')}
                        tone="bg-pink-500/10 text-pink-500"
                    />
                    <StatTile
                        icon={<Clock size={18} />}
                        label="Регистрация"
                        value={formatDateOnly(user?.created_at, 'Неизвестно')}
                    />
                </>
            )}
        </div>
    );
};
