import React, { useEffect, useRef, useState } from 'react';
import { Share2, Check } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

// Сколько подсказка висит после нажатия. Меньше секунды взгляд не успевает поймать,
// дольше двух — она начинает выглядеть как забытый элемент интерфейса.
const TIP_VISIBLE_MS = 1800;
// Длительность ухода. Как у тостов: элемент ещё в разметке, пока доигрывает анимация.
const TIP_EXIT_MS = 220;

type TipState = 'copied' | 'failed';

// Подсказка инвертирует фон страницы: тёмная на светлой теме, светлая на тёмной. На тёмной теме
// карточка сама почти чёрная, и тёмная плашка на ней сливается.
const TIP_TONE: Record<TipState, string> = {
  copied: 'bg-zinc-900 text-white shadow-black/25 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-black/60',
  failed: 'bg-red-500 text-white shadow-red-500/30',
};

// Пружинка: иконки и подсказка выезжают с лёгким перелётом, а уходят ровно.
const SPRING = 'ease-[cubic-bezier(0.34,1.56,0.64,1)]';

interface ShareButtonProps {
  /** Ссылка, которая уйдёт в буфер обмена. */
  url: string;
  /** Дополнительные классы кнопки — размеры и отступы задаёт место, где она стоит. */
  className?: string;
}

/**
 * Кнопка «поделиться»: копирует ссылку и показывает подтверждение прямо над собой.
 *
 * Раньше подтверждение показывалось модалкой (в новостной модалке) или подменой innerHTML кнопки
 * в обход React (в ленте). Здесь и то и другое заменено обычным состоянием: подсказка всплывает
 * у самой кнопки, так что взгляд не уходит от места нажатия.
 *
 * Подсказка прижата правым краем к правому краю кнопки: карточка ленты обрезает содержимое
 * (overflow-hidden), а кнопки стоят у правого края — центрированная подсказка обрезалась бы.
 */
export const ShareButton: React.FC<ShareButtonProps> = ({ url, className = '' }) => {
  const { t } = useLanguage();
  const [tip, setTip] = useState<TipState | null>(null);
  // Подсказка уже уходит, но ещё в разметке: без этой фазы она пропадала бы рывком.
  const [leaving, setLeaving] = useState(false);
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
  };

  // Повторное нажатие продлевает подсказку, а не запускает вторую поверх первой.
  const showTip = (state: TipState) => {
    clearTimers();
    setTip(state);
    setLeaving(false);
    timersRef.current = [
      window.setTimeout(() => setLeaving(true), TIP_VISIBLE_MS),
      window.setTimeout(() => {
        setTip(null);
        setLeaving(false);
      }, TIP_VISIBLE_MS + TIP_EXIT_MS),
    ];
  };

  useEffect(() => clearTimers, []);

  const handleClick = (e: React.MouseEvent) => {
    // Кнопка живёт внутри кликабельной карточки новости — иначе нажатие откроет модалку.
    e.stopPropagation();

    // Вне защищённого контекста navigator.clipboard просто отсутствует, и обращение к нему
    // бросает синхронно, мимо .catch(). Проверка оставляет кнопку рабочей: покажет отказ.
    if (!navigator.clipboard?.writeText) {
      showTip('failed');
      return;
    }

    navigator.clipboard.writeText(url)
      .then(() => showTip('copied'))
      .catch((err) => {
        console.error('Failed to copy:', err);
        showTip('failed');
      });
  };

  // Галочка держится только пока подсказка не начала уходить: иконка и плашка гаснут вместе.
  const showCheck = tip === 'copied' && !leaving;

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        title={t.share.title}
        aria-label={t.share.title}
        className={`p-2 rounded-full transition-all duration-200 group/btn ${showCheck
          ? 'text-green-500 bg-green-50 dark:bg-green-900/20'
          : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'
          } ${className}`}
      >
        {/* Иконки лежат друг на друге и перетекают одна в другую — подмена одной на другую
            в обе стороны выглядела бы рывком. */}
        <span className="relative block h-5 w-5">
          <Share2
            size={20}
            className={`absolute inset-0 transition-all duration-200 ${SPRING} ${showCheck
              ? 'opacity-0 scale-50'
              : 'opacity-100 scale-100 group-hover/btn:scale-110'}`}
          />
          <Check
            size={20}
            className={`absolute inset-0 transition-all duration-200 ${SPRING} ${showCheck
              ? 'opacity-100 scale-100'
              : 'opacity-0 scale-50'}`}
          />
        </span>
      </button>

      {tip && (
        <div
          role="status"
          className={`absolute bottom-full right-0 mb-2 pointer-events-none select-none z-20 ${leaving ? 'share-tip-leaving' : 'share-tip'
            }`}
        >
          <div className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-lg ${TIP_TONE[tip]}`}>
            {tip === 'copied' ? t.share.copied : t.share.failed}
          </div>
          {/* Хвостик смотрит ровно в центр кнопки: 36px кнопка → 18px от правого края, минус половина хвостика. */}
          <div className={`absolute top-full right-[14px] -mt-1 h-2 w-2 rotate-45 ${TIP_TONE[tip]}`} />
        </div>
      )}
    </div>
  );
};
