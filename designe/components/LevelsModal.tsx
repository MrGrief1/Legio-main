import React from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight } from 'lucide-react';
import { LEVELS, getLevel } from '../constants';
import { useAuth } from '../context/AuthContext';
import { useScrollLock } from '../hooks/useScrollLock';
import { useBackClose } from '../hooks/useBackClose';
import { Avatar } from './Avatar';
import { ProfileStatsGrid, ProfileUser, useProfileData } from './ProfileStats';

interface LevelsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LevelsModal: React.FC<LevelsModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const currentLevel = user ? getLevel(user.points || 0) : LEVELS[0];

  // Модалка называлась «Рейтинг», но показывала только лестницу уровней — про себя в ней не было
  // видно ничего: ни очков в общем зачёте, ни точности прогнозов, ни сколько ждёт результата.
  // Здесь те же плитки, что и в карточке победителя, только про текущего пользователя.
  const selfId = user ? Number(user.id) : null;
  const { user: profile, stats, loading } = useProfileData(selfId, isOpen);

  useScrollLock(isOpen);
  // Кнопка «назад» закрывает модалку, а не уводит с сайта.
  useBackClose(isOpen, onClose);

  if (!isOpen) return null;

  // Пока профиль не подгрузился, показываем то, что уже есть в сессии, — модалка не должна
  // открываться пустой.
  const displayUser: ProfileUser | null = profile || (user
    ? {
      id: Number(user.id),
      username: user.username,
      name: user.name || user.username,
      avatar: user.avatar,
      bio: user.bio,
      birthdate: user.birthdate,
      points: user.points || 0,
      role: user.role || 'user',
      created_at: '',
    }
    : null);

  const displayName = displayUser ? (displayUser.name || displayUser.username) : '';
  const points = displayUser?.points ?? 0;
  const nextLevel = currentLevel.id < LEVELS.length ? LEVELS[currentLevel.id] : null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" onClick={onClose}>
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/80" />

      {/* Modal Content */}
      <div
        className="relative bg-zinc-50 dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Мой рейтинг</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {displayUser && (
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-3 mb-4">
                <Avatar
                  src={displayUser.avatar}
                  alt={displayUser.username}
                  size={52}
                  fallbackText={displayName}
                />
                <div className="min-w-0">
                  <div className="font-bold text-zinc-900 dark:text-white truncate">{displayName}</div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400 truncate">@{displayUser.username}</div>
                </div>
                <span className="ml-auto shrink-0 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  {currentLevel.name}
                </span>
              </div>

              <ProfileStatsGrid user={displayUser} stats={stats} loading={loading} showPersonal={false} />
            </div>
          )}

          {/* Прогресс сразу под своими цифрами: сначала «где я», потом «куда дальше». */}
          {user && (
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex justify-between items-end mb-3 text-sm">
                <span className="text-zinc-500 font-medium">Ваш прогресс</span>
                <span className="text-zinc-900 dark:text-white font-bold tabular-nums">
                  {points.toLocaleString()} / {(nextLevel?.minPoints ?? currentLevel.minPoints).toLocaleString()}
                </span>
              </div>

              <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${nextLevel
                      ? Math.min(100, Math.max(0, ((points - currentLevel.minPoints) / (nextLevel.minPoints - currentLevel.minPoints)) * 100))
                      : 100}%`
                  }}
                />
              </div>

              {nextLevel && (
                <p className="mt-3 text-sm text-center text-zinc-400">
                  До уровня «{nextLevel.name}» осталось {(nextLevel.minPoints - points).toLocaleString()} очков
                </p>
              )}
            </div>
          )}

          <div className="px-6 pt-5 pb-2">
            <h3 className="text-[11px] font-bold text-zinc-500 dark:text-zinc-600 uppercase tracking-widest">
              Уровни
            </h3>
          </div>

          <div>
            {LEVELS.map((level) => {
              const isCurrent = currentLevel.id === level.id;
              const isPassed = currentLevel.id > level.id;

              return (
                <div
                  key={level.id}
                  className={`flex items-center px-6 py-3.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0 transition-colors ${isCurrent ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                    }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold mr-4 shrink-0 ${isCurrent
                    ? 'bg-blue-500 text-white'
                    : isPassed
                      ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                    }`}>
                    {level.id}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className={`text-base font-medium ${isCurrent ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-900 dark:text-white'}`}>
                      {level.name}
                    </div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400 tabular-nums">
                      {level.minPoints.toLocaleString()} очков
                    </div>
                  </div>

                  {isCurrent && <ChevronRight size={18} className="text-blue-500 shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
