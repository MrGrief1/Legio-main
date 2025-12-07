
import React, { useState, useEffect } from 'react';
import { AuthCard } from './AuthCard';
import { Trophy, Crown } from 'lucide-react';
import { User } from '../types';
import { useLanguage } from '../context/LanguageContext';

export const RightPanel: React.FC = () => {
  const { t } = useLanguage();
  const [leaders, setLeaders] = useState<User[]>([]);

  useEffect(() => {
    fetch('http://localhost:3001/api/leaders')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setLeaders(data);
        } else {
          console.error('Leaders data is not an array:', data);
          setLeaders([]);
        }
      })
      .catch(err => {
        console.error(err);
        setLeaders([]);
      });
  }, []);

  const winner = leaders.length > 0 ? leaders[0] : null;

  return (
    <aside className="hidden xl:block w-80 h-screen sticky top-0 pt-8 pb-6 pl-6 overflow-visible">

      {/* Auth Card */}
      <AuthCard className="mb-8" />

      {/* Promo Text */}
      <div className="mb-8 px-2">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-2">{t.rightPanel.checkIntuition}</h3>
        <p className="text-xs text-zinc-500 leading-relaxed">
          {t.rightPanel.promoText}
        </p>
      </div>

      {/* Prize Winner (Top 1 Leader) */}
      {winner && (
        <div className="mb-8">
          <h3 className="text-[11px] font-bold text-zinc-500 dark:text-zinc-600 uppercase tracking-widest mb-4 px-2">{t.rightPanel.topLeader}</h3>
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-4 flex items-center gap-4 shadow-sm dark:shadow-none">
            <div className="relative">
              <img src={winner.avatar} alt={winner.username} className="w-12 h-12 rounded-full ring-2 ring-zinc-200 dark:ring-zinc-800" />
              <div className="absolute -bottom-1 -right-1 bg-zinc-900 dark:bg-white text-white dark:text-black p-0.5 rounded-full shadow-sm">
                <Crown size={10} fill="currentColor" />
              </div>
            </div>
            <div>
              <div className="font-bold text-zinc-900 dark:text-white text-sm">{winner.name || winner.username}</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1.5">
                <Trophy size={12} className="text-yellow-500" /> {winner.points} {t.points}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div>
        <h3 className="text-[11px] font-bold text-zinc-500 dark:text-zinc-600 uppercase tracking-widest mb-4 px-2">{t.rightPanel.topPredictors}</h3>
        <div className="space-y-1">
          {Array.isArray(leaders) && leaders.length > 0 ? (
            leaders.slice(0, 3).map((user) => (
              <div key={user.id} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors group cursor-pointer">
                <div className="w-6 text-center font-mono text-sm text-zinc-400 dark:text-zinc-600 font-bold">
                  {user.rank}
                </div>
                <img src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} alt={user.username} className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                    {user.name || user.username}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {user.points.toLocaleString()} {t.points}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 text-xs text-zinc-500">
              {leaders === null ? t.rightPanel.loadError : t.rightPanel.noLeaders}
            </div>
          )}
          {leaders.length === 0 && <div className="px-4 text-xs text-zinc-500">{t.rightPanel.noLeaders}</div>}
        </div>
      </div>

    </aside>
  );
};
