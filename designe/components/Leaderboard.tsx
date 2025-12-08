import React, { useState, useEffect } from 'react';
import { getApiUrl } from '../config';
import { Trophy, Crown } from 'lucide-react';
import { User } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { Avatar } from './Avatar';

export const Leaderboard: React.FC = () => {
    const { t } = useLanguage();
    const [leaders, setLeaders] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(getApiUrl('/api/leaders'))
            .then(res => res.json())
            .then(data => setLeaders(data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="bg-white/80 dark:bg-[#121212]/80 backdrop-blur-xl rounded-2xl lg:rounded-[32px] p-4 lg:p-8 border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden w-full">
            <h2 className="text-2xl font-bold mb-6 lg:mb-8 dark:text-white flex items-center gap-3 px-2">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-500/10 rounded-xl">
                    <Trophy className="text-yellow-600 dark:text-yellow-500 w-6 h-6" />
                </div>
                {t.leaderboard.title}
            </h2>

            <div className="space-y-3">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <p>{t.leaderboard.loading}</p>
                    </div>
                ) : leaders.map((user, index) => (
                    <div
                        key={user.id}
                        className={`relative group flex items-center gap-3 lg:gap-4 p-3 lg:p-4 rounded-2xl transition-all duration-300 border ${index === 0
                            ? 'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-500/10 dark:to-orange-500/10 border-yellow-200 dark:border-yellow-500/20 shadow-lg shadow-yellow-500/5'
                            : index === 1
                                ? 'bg-gradient-to-r from-zinc-50 to-slate-50 dark:from-zinc-800/40 dark:to-slate-800/40 border-zinc-200 dark:border-zinc-700'
                                : index === 2
                                    ? 'bg-gradient-to-r from-orange-50 to-rose-50 dark:from-orange-900/10 dark:to-red-900/10 border-orange-200 dark:border-orange-800/30'
                                    : 'bg-white/50 dark:bg-zinc-900/30 border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                            }`}
                    >
                        {/* Rank Badge */}
                        <div className={`
                            flex-shrink-0 w-8 h-8 lg:w-10 lg:h-10 flex items-center justify-center rounded-full font-bold text-sm lg:text-base shadow-sm
                            ${index === 0 ? 'bg-yellow-500 text-white ring-4 ring-yellow-100 dark:ring-yellow-900/30' :
                                index === 1 ? 'bg-zinc-400 text-white' :
                                    index === 2 ? 'bg-amber-700 text-white' :
                                        'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'}
                        `}>
                            {index === 0 ? <Crown size={16} fill="currentColor" /> : index + 1}
                        </div>

                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                            <Avatar
                                src={user.avatar}
                                alt={user.name || user.username}
                                size={index < 3 ? 48 : 40}
                                className={`rounded-full bg-zinc-200 dark:bg-zinc-800 object-cover ring-2 ring-white dark:ring-zinc-900`}
                                fallbackText={user.name || user.username}
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
                                <span className={`font-bold text-sm lg:text-lg truncate ${index === 0 ? 'text-yellow-700 dark:text-yellow-500' : 'text-zinc-900 dark:text-white'
                                    }`}>
                                    {user.name || user.username}
                                </span>
                                {index === 0 && <Crown size={14} className="text-yellow-500 flex-shrink-0 hidden lg:block" />}
                            </div>
                            <div className="text-xs text-zinc-500 truncate font-medium">
                                @{user.username}
                            </div>
                        </div>

                        {/* Points */}
                        <div className="text-right flex-shrink-0 pl-2 border-l border-zinc-100 dark:border-zinc-800">
                            <div className="font-bold text-blue-600 dark:text-blue-400 text-sm lg:text-lg tabular-nums">
                                {user.points.toLocaleString()}
                            </div>
                            <div className="text-[10px] lg:text-xs text-zinc-400 font-medium uppercase tracking-wider">{t.leaderboard.pointsLabel}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
