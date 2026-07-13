
import React, { useState, useEffect } from 'react';
import { AuthCard } from './AuthCard';
import { Avatar } from './Avatar';
import { Trophy, Crown } from 'lucide-react';
import { User } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { API_URL } from '../config';

// Months in the case each language needs: Russian genitive ("Призёр января"),
// English nominative ("January winner").
const MONTHS_GENITIVE_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Monthly prize awarded to the current leader (matches the old version's block).
const MONTHLY_PRIZE_POINTS = 500;

export const RightPanel: React.FC = () => {
  const { t, language } = useLanguage();
  const [leaders, setLeaders] = useState<User[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/leaders`)
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

  const monthIndex = new Date().getMonth();
  const prizeHeading = language === 'ru'
    ? `${t.rightPanel.prizeWinner} ${MONTHS_GENITIVE_RU[monthIndex]}`
    : `${MONTHS_EN[monthIndex]} ${t.rightPanel.prizeWinner}`;

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

      {/* Monthly Prize Winner (current leader) */}
      {winner && (
        <div className="mb-8">
          <h3 className="text-[11px] font-bold text-zinc-500 dark:text-zinc-600 uppercase tracking-widest mb-4 px-2">{prizeHeading}</h3>
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-4 shadow-sm dark:shadow-none">
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <Avatar src={winner.avatar} alt={winner.username} size={44} className="ring-2 ring-zinc-200 dark:ring-zinc-800" fallbackText={winner.name || winner.username} />
                <div className="absolute -bottom-1 -right-1 bg-zinc-900 dark:bg-white text-white dark:text-black p-0.5 rounded-full shadow-sm">
                  <Crown size={10} fill="currentColor" />
                </div>
              </div>
              <div className="flex-1 min-w-0 font-bold text-zinc-900 dark:text-white text-sm truncate">
                {winner.name || winner.username}
              </div>
              <Trophy size={26} className="text-sky-400 shrink-0" />
            </div>
            <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              <span className="text-green-500 font-bold">+{MONTHLY_PRIZE_POINTS}</span> {t.rightPanel.prizePoints}{' '}
              <span className="text-sky-500 dark:text-sky-400 font-semibold">{t.rightPanel.prizeGift}</span>
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
                <Avatar src={user.avatar} alt={user.username} size={36} className="w-9 h-9" fallbackText={user.name || user.username} />
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
