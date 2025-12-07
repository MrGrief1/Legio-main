import React, { useState, useEffect } from 'react';
import { Trophy, Crown } from 'lucide-react';
import { User } from '../types';
import { useLanguage } from '../context/LanguageContext';

export const Leaderboard: React.FC = () => {
    const { t } = useLanguage();
    const [leaders, setLeaders] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:3001/api/leaders')
            .then(res => res.json())
            .then(data => setLeaders(data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="bg-white dark:bg-[#121212] rounded-[32px] p-6 lg:p-8 border border-zinc-200 dark:border-zinc-800">
            <h2 className="text-2xl font-bold mb-8 dark:text-white flex items-center gap-3">
                <Trophy className="text-yellow-500" />
                {t.leaderboard.title}
            </h2>

            <div className="space-y-2">
                {loading ? (
                    <div className="text-center py-10 text-zinc-500">{t.leaderboard.loading}</div>
                ) : leaders.map((user, index) => (
                    <div key={user.id} className={`flex items-center gap-4 p-4 rounded-2xl transition-all border ${index === 0
                            ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-500/10 dark:border-yellow-500/20'
                            : 'bg-zinc-50 border-transparent hover:border-zinc-200 dark:bg-zinc-900/50 dark:border-zinc-800'
                        }`}>
                        <div className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${index === 0 ? 'bg-yellow-500 text-white' :
                                index === 1 ? 'bg-zinc-400 text-white' :
                                    index === 2 ? 'bg-amber-700 text-white' :
                                        'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
                            }`}>
                            {index + 1}
                        </div>

                        <img src={user.avatar} alt={user.name || user.username} className="w-12 h-12 rounded-full bg-zinc-200 dark:bg-zinc-800 object-cover" />

                        <div className="flex-1">
                            <div className="font-bold text-lg dark:text-white flex items-center gap-2">
                                {user.name || user.username}
                                {index === 0 && <Crown size={16} className="text-yellow-500" />}
                            </div>
                            {user.name && user.name !== user.username && (
                                <div className="text-xs text-zinc-500">@{user.username}</div>
                            )}
                        </div>

                        <div className="text-right">
                            <div className="font-bold text-blue-600 dark:text-blue-400 text-lg">
                                {user.points.toLocaleString()}
                            </div>
                            <div className="text-xs text-zinc-500">{t.leaderboard.pointsLabel}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
