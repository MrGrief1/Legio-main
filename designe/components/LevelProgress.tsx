import React from 'react';
import { Trophy } from 'lucide-react';
import { LEVELS, getLevel } from '../constants';
import { useAuth } from '../context/AuthContext';
import { LevelsModal } from './LevelsModal';

// Виджет «Прогресс»: текущий уровень, набранные баллы и полоса до следующего уровня.
//
// Раньше он был свёрстан прямо в Sidebar. Теперь это отдельный компонент, потому что показывается
// в двух местах сразу: в правой панели под карточкой профиля (там, где его и ищут — рядом с собой)
// и в мобильном меню, где правой панели просто нет. Один компонент на оба места гарантирует, что
// цифры и шкала считаются одинаково.

interface LevelProgressProps {
  className?: string;
}

export const LevelProgress: React.FC<LevelProgressProps> = ({ className = '' }) => {
  const { user } = useAuth();
  const [isLevelsModalOpen, setIsLevelsModalOpen] = React.useState(false);

  if (!user) return null;

  const points = user.points || 0;
  const level = getLevel(points);
  // Следующий уровень — по позиции в LEVELS, а не по id: у последнего уровня следующего нет,
  // и тогда шкала считается до удвоенного порога, чтобы не делить на ноль и не упираться в 100%.
  const nextLevel = LEVELS[level.id];
  const ceiling = nextLevel?.minPoints ?? level.minPoints * 2;
  const span = Math.max(1, ceiling - level.minPoints);
  const progress = Math.min(100, Math.max(0, ((points - level.minPoints) / span) * 100));

  return (
    <>
      <div
        // Та же белая поверхность, что и у карточки профиля над ней (AuthCard): в колонке
        // они стоят вплотную, и серая плашка читалась как чужеродный блок, а не как продолжение
        // профиля. Ховер светлее фона, а не темнее, — на белом серый пересвет выглядел провалом.
        className={`bg-white dark:bg-[#121212] border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors ${className}`}
        onClick={() => setIsLevelsModalOpen(true)}
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Trophy size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Прогресс</div>
              <div className="text-sm font-bold text-zinc-900 dark:text-white truncate">{level.name}</div>
            </div>
          </div>
          <div className="text-sm font-mono font-medium text-zinc-500 shrink-0">
            {points.toLocaleString()}
          </div>
        </div>

        <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            // transition-[width], not transition-all: only the width animates, and `all` over a
            // full second made this bar the last thing to vanish when the mobile menu closed.
            className="h-full bg-blue-500 rounded-full transition-[width] duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Сколько осталось до следующего уровня. Голая шкала показывает «сколько пройдено», но не
            отвечает на вопрос, ради которого на неё и смотрят. У последнего уровня следующего нет —
            там подпись не нужна. */}
        {nextLevel && (
          <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            До «{nextLevel.name}» — {(ceiling - points).toLocaleString()}
          </div>
        )}
      </div>

      <LevelsModal isOpen={isLevelsModalOpen} onClose={() => setIsLevelsModalOpen(false)} />
    </>
  );
};
