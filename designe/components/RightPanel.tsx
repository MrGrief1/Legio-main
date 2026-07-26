
import React, { useCallback, useEffect, useState } from 'react';
import { AuthCard } from './AuthCard';
import { Avatar } from './Avatar';
import { Trophy, Crown, CalendarClock } from 'lucide-react';
import { User } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { API_URL } from '../config';
import { CountdownTimer } from './CountdownTimer';
import { UserProfileModal } from './UserProfileModal';

// Months in the case each language needs: Russian genitive ("Призёр января"),
// English nominative ("January winner").
const MONTHS_GENITIVE_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface MonthlyWinner {
    id: number;
    username: string;
    name?: string;
    displayName: string;
    avatar: string;
    monthlyPoints: number;
    monthlyWins: number;
}

interface MonthlyResponse {
    monthIndex: number;
    isCurrentMonth: boolean;
    periodEnd: string;
    serverTime: string;
    winner: MonthlyWinner | null;
}

export const RightPanel: React.FC = () => {
  const { t, language } = useLanguage();
  const [leaders, setLeaders] = useState<User[]>([]);
  const [monthly, setMonthly] = useState<MonthlyResponse | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const load = useCallback(() => {
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

    // The prize block is scored on the monthly event, not the all-time table: the person with the
    // biggest all-time total is usually not the one who earned the most this month.
    fetch(`${API_URL}/leaders/monthly`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch monthly leaders');
        return res.json();
      })
      .then(data => setMonthly(data && typeof data === 'object' ? data : null))
      .catch(err => {
        console.error(err);
        setMonthly(null);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const winner = monthly?.winner || null;

  const monthIndex = monthly?.monthIndex ?? new Date().getMonth();
  const prizeHeading = language === 'ru'
    ? `${t.rightPanel.prizeWinner} ${MONTHS_GENITIVE_RU[monthIndex]}`
    : `${MONTHS_EN[monthIndex]} ${t.rightPanel.prizeWinner}`;

  return (
    <aside className="hidden xl:block w-80 shrink-0 h-screen sticky top-0 pt-8 pb-6 pl-6 overflow-y-auto">

      {/* Auth Card */}
      <AuthCard className="mb-8" />

      {/* Promo Text */}
      <div className="mb-8 px-2">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-2">{t.rightPanel.checkIntuition}</h3>
        <p className="text-xs text-zinc-500 leading-relaxed">
          {t.rightPanel.promoText}
        </p>
      </div>

      {/* Monthly Prize Winner — whoever leads the current month's event, plus the countdown to
          the moment the title is locked in and a new event opens. */}
      {monthly && (
        <div className="mb-8">
          <h3 className="text-[11px] font-bold text-zinc-500 dark:text-zinc-600 uppercase tracking-widest mb-4 px-2">{prizeHeading}</h3>
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-4 shadow-sm dark:shadow-none">
            {winner ? (
              <>
                <button
                  onClick={() => setSelectedUserId(Number(winner.id))}
                  className="flex items-center gap-3 w-full text-left group"
                >
                  <div className="relative shrink-0">
                    <Avatar src={winner.avatar} alt={winner.username} size={44} className="ring-2 ring-zinc-200 dark:ring-zinc-800" fallbackText={winner.displayName} />
                    <div className="absolute -bottom-1 -right-1 bg-zinc-900 dark:bg-white text-white dark:text-black p-0.5 rounded-full shadow-sm">
                      <Crown size={10} fill="currentColor" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 font-bold text-zinc-900 dark:text-white text-sm truncate group-hover:text-sky-500 transition-colors">
                    {winner.displayName}
                  </div>
                  <Trophy size={26} className="text-sky-400 shrink-0" />
                </button>
                <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  <span className="text-green-500 font-bold">+{winner.monthlyPoints.toLocaleString()}</span> {t.rightPanel.monthlyLeader}{' '}
                  <span className="text-sky-500 dark:text-sky-400 font-semibold">{t.rightPanel.prizeGift}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {t.rightPanel.noMonthlyLeader}
              </p>
            )}

            {monthly.isCurrentMonth && (
              <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <CalendarClock size={13} className="shrink-0" />
                <CountdownTimer
                  deadline={monthly.periodEnd}
                  serverTime={monthly.serverTime}
                  onExpire={load}
                  compact
                  className="text-zinc-900 dark:text-white"
                />
                <span className="truncate">{t.rightPanel.untilNewWinner}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div>
        <h3 className="text-[11px] font-bold text-zinc-500 dark:text-zinc-600 uppercase tracking-widest mb-4 px-2">{t.rightPanel.topPredictors}</h3>
        <div className="space-y-1">
          {Array.isArray(leaders) && leaders.length > 0 ? (
            leaders.slice(0, 3).map((user) => (
              <button
                key={user.id}
                onClick={() => setSelectedUserId(Number(user.id))}
                className="flex items-center gap-4 p-3 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors group cursor-pointer w-full text-left"
              >
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
              </button>
            ))
          ) : (
            <div className="px-4 text-xs text-zinc-500">
              {t.rightPanel.noLeaders}
            </div>
          )}
        </div>
      </div>

      <UserProfileModal
        isOpen={selectedUserId !== null}
        onClose={() => setSelectedUserId(null)}
        userId={selectedUserId}
      />

    </aside>
  );
};
