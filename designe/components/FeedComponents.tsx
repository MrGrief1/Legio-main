import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Button } from './UI';
import { Heart, Share2, AlertTriangle, Circle, CheckCircle2, Loader2, Check, Trash2, Clock, Link as LinkIcon, Users, X, User as UserIcon, Pencil, Flag } from 'lucide-react';
import { PollData, PollOption, NewsItem, User } from '../types';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { NewsModal } from './NewsModal';
import { ReportModal } from './ReportModal';
import { UserProfileModal } from './UserProfileModal';
import { Avatar } from './Avatar';
import { getApiUrl } from '../config';
import { useScrollLock } from '../hooks/useScrollLock';
import { useBackClose } from '../hooks/useBackClose';
import { formatNewsDate, formatDateOnly, formatDateTime } from '../utils/date';

// Format a YYYY-MM-DD poll end date to DD.MM.YYYY; fall back to the raw string.
const formatPollDate = (value: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
};


// How many voter chips to show inline before collapsing the rest behind a "+N" button.
const VISIBLE_VOTERS = 3;

// Кто видит авторство опроса. Зеркалит серверный гейт: админ и создатель — да, читатель — нет.
const canSeeEditorialMeta = (user: { role?: string } | null | undefined): boolean =>
  !!user && (user.role === 'admin' || user.role === 'creator');

// Тайминги «наливания» шкалы результатов: длительность самой заливки и шаг задержки,
// с которым варианты стартуют друг за другом, чтобы результат читался сверху вниз.
const POLL_FILL_DURATION = 900;
const POLL_FILL_STEP = 90;

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Докручивает число до цели вместо мгновенной подстановки: работает и на рост (свой голос),
// и на убывание (доля варианта падает, когда общее число голосов выросло).
const useCountUp = (target: number, active: boolean, delay = 0): number => {
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);

  useEffect(() => {
    if (!active) {
      valueRef.current = 0;
      setValue(0);
      return;
    }

    if (prefersReducedMotion()) {
      valueRef.current = target;
      setValue(target);
      return;
    }

    const from = valueRef.current;
    if (from === target) return;

    let frame = 0;
    let start: number | null = null;

    const step = (now: number) => {
      if (start === null) start = now;
      const progress = Math.min(1, (now - start) / POLL_FILL_DURATION);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (target - from) * eased);
      valueRef.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame(step);
    }, delay);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [target, active, delay]);

  return value;
};

// Отдельный компонент, потому что хук нельзя вызвать внутри map по вариантам.
const AnimatedPercent: React.FC<{ value: number; active: boolean; delay: number }> = ({ value, active, delay }) => {
  const shown = useCountUp(value, active, delay);
  return <>{shown}%</>;
};

// Full list of everyone who picked a given option — opened from the "+N" button.
const VotersModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  optionText: string;
  voters: User[];
  onSelectUser: (user: User) => void;
}> = ({ isOpen, onClose, optionText, voters, onSelectUser }) => {
  useScrollLock(isOpen);
  // Кнопка «назад» закрывает модалку, а не уводит с сайта.
  useBackClose(isOpen, onClose);
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        className="bg-white dark:bg-[#181818] rounded-[24px] w-full max-w-sm max-h-[70vh] flex flex-col border border-zinc-200 dark:border-zinc-800 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 p-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">Проголосовали · {voters.length}</div>
            <div className="font-semibold text-sm text-zinc-900 dark:text-white truncate">{optionText}</div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-2">
          {voters.map((voter) => (
            <button
              key={voter.id}
              onClick={() => onSelectUser(voter)}
              className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
            >
              <Avatar src={voter.avatar} alt={voter.username} size={36} fallbackText={voter.name || voter.username} />
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">{voter.name || voter.username}</div>
                <div className="text-xs text-zinc-500 truncate">@{voter.username}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

interface PollProps {
  data: PollData;
  // Fired whenever this poll changes server-side — a vote landing or the poll being resolved — so
  // the surrounding feed can re-read itself instead of the page being reloaded.
  onPollChange?: () => void;
}

export const Poll: React.FC<PollProps> = React.memo(({ data, onPollChange }) => {
  const { user } = useAuth();
  const { showAlert, showConfirm } = useDialog();
  const [selectedOption, setSelectedOption] = useState<number | null>(data.user_voted_option_id || null);
  const [hasVoted, setHasVoted] = useState(!!data.user_voted_option_id);
  const [isVoting, setIsVoting] = useState(false);
  const [pollData, setPollData] = useState<PollData>(data);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showVoters, setShowVoters] = useState(false);
  const [votersModalOption, setVotersModalOption] = useState<PollOption | null>(null);
  // Шкалы стартуют со scaleX(0) и уезжают к своей доле только на следующем кадре — иначе
  // браузеру не от чего анимировать и заливка просто появляется целиком.
  const [revealed, setRevealed] = useState(false);
  // Ступенчатый старт нужен только на первом показе; дальше (перезагрузка ленты, чужие голоса)
  // шкалы должны переезжать к новым долям сразу, без накопленной задержки.
  const [stagger, setStagger] = useState(true);

  useEffect(() => {
    setPollData(data);
    setSelectedOption(data.user_voted_option_id || null);
    setHasVoted(!!data.user_voted_option_id);
  }, [data]);

  // Голосование закрылось по сроку, но результат ещё не объявлен: выбор больше не принимается,
  // а проценты уже можно показать — иначе читатель, не успевший проголосовать, видит опрос,
  // в котором нечего нажать и нечего посмотреть.
  const votingClosedByDeadline = !!pollData.voting_closed && !pollData.is_resolved;
  // Аннулированный: закрыт, но победителя нет. Расклад голосов показываем — он и есть всё, что
  // от такого опроса осталось.
  const isVoid = !!pollData.is_void;
  const canVote = !hasVoted && !pollData.is_resolved && !votingClosedByDeadline;
  const showResults = hasVoted || !!pollData.is_resolved || votingClosedByDeadline;

  useEffect(() => {
    if (!showResults) {
      setRevealed(false);
      setStagger(true);
      return;
    }

    if (prefersReducedMotion()) {
      setRevealed(true);
      setStagger(false);
      return;
    }

    // Двойной rAF: одиночный успевает отработать до первой отрисовки, и переход снова теряется.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setRevealed(true));
    });

    // Подстраховка: если кадры почему-то не приходят, шкала не должна остаться пустой. На скрытой
    // вкладке ничего не делаем — там rAF просто ждёт возврата пользователя и анимация отыграет ему.
    const fallback = window.setTimeout(() => {
      if (document.visibilityState === 'visible') setRevealed(true);
    }, 300);

    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      window.clearTimeout(fallback);
    };
  }, [showResults]);

  useEffect(() => {
    if (!revealed || !stagger) return;
    const timer = window.setTimeout(
      () => setStagger(false),
      POLL_FILL_DURATION + pollData.options.length * POLL_FILL_STEP
    );
    return () => window.clearTimeout(timer);
  }, [revealed, stagger, pollData.options.length]);

  const handleVote = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (selectedOption === null || !user) return;
    setIsVoting(true);

    try {
      const res = await fetch(getApiUrl(`/api/polls/${data.id}/vote`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ optionId: selectedOption })
      });

      if (!res.ok) throw new Error('Vote failed');

      setHasVoted(true);

      // Проценты пересчитываются локально по той же формуле, что и на сервере: свой вариант растёт,
      // остальные проседают (общее число голосов стало больше) — шкалы едут сразу к верным долям,
      // не дожидаясь перезагрузки ленты. Если бэкенд ещё не отдаёт счётчики — оставляем как есть.
      const hasCounts = pollData.options.every(
        opt => typeof opt.vote_count === 'number' && typeof opt.total_votes === 'number'
      );

      if (hasCounts) {
        const updatedOptions = pollData.options.map(opt => {
          const voteCount = (opt.vote_count as number) + (opt.id === selectedOption ? 1 : 0);
          const totalVotes = (opt.total_votes as number) + 1;
          return {
            ...opt,
            vote_count: voteCount,
            total_votes: totalVotes,
            percent: totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0,
          };
        });
        setPollData({ ...pollData, options: updatedOptions });
      }

      if (onPollChange) {
        setTimeout(() => onPollChange(), 500);
      }

    } catch (error) {
      console.error(error);
      showAlert('Failed to vote. Make sure you are logged in and havent voted yet.');
    } finally {
      setIsVoting(false);
    }
  };

  // Завершение опроса необратимо и начисляет баллы, а кнопка для него стоит под каждым вариантом
  // вплотную к «Голосовать» — и читалась редакцией как «выбрать этот вариант», то есть как способ
  // проголосовать. Так за август закрылись десять опросов со сроками вплоть до 2027 года, причём
  // каждый раз «верным» оказывался вариант, за который не голосовал никто, — то есть тот, который
  // нажимавший считал своим прогнозом. Поэтому до конца срока кнопка выглядит иначе и открывает
  // подтверждение с датой: закрыть идущий опрос по-прежнему можно, но не одним промахом мышью.
  // Пустая строка в ends_at (наследие переноса из WordPress) — это «срока нет», а не «срок пуст».
  // Признак «срок вышел» берём с сервера (voting_closed), а не считаем по часам читателя: иначе
  // на отставших часах интерфейс попросит подтверждение досрочного завершения у опроса, который
  // сервер уже считает закрытым, — и наоборот.
  const deadline = String(pollData.ends_at || '').trim();
  const votingClosed = !deadline || !!pollData.voting_closed;
  // Аннулированный опрос редакция может закрыть по-настоящему, если исход всё-таки стал
  // известен — сервер такой переход разрешает. Обычный завершённый переигрывать нельзя.
  const canResolve = !!user
    && (user.role === 'admin' || user.role === 'creator')
    && (!pollData.is_resolved || isVoid);

  const handleResolve = async (optionId: number) => {
    // Пока срок не вышел, это досрочное завершение: спрашиваем отдельно и называем дату, до
    // которой идёт голосование, — иначе «вы уверены?» ничем не отличается от обычного закрытия
    // просроченного опроса. Флаг `early` сервер требует явно: без него он такой запрос отклонит.
    // У аннулированного опроса голосование уже закрыто, обрывать нечего — подтверждение
    // досрочности здесь бессмысленно, и сервер его не требует.
    const early = !votingClosed && !isVoid;
    const confirmed = await showConfirm(early
      ? `Голосование идёт до ${formatPollDate(deadline)}. Завершить опрос досрочно? Баллы начислятся сразу, отменить нельзя.`
      : isVoid
        ? "Опрос был закрыт без результата. Объявить этот вариант верным и начислить баллы? Отменить нельзя."
        : "Вы уверены, что это правильный ответ? Это действие нельзя отменить.");
    if (!confirmed) return;

    try {
      const res = await fetch(getApiUrl(`/api/polls/${data.id}/resolve`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ correctOptionId: optionId, early })
      });

      if (res.ok) {
        showAlert("Опрос завершен!");
        onPollChange?.();
      } else {
        // Причина отказа (чужой опрос, уже завершён, срок) приходит текстом от сервера — молчать
        // о ней нельзя: кнопка просто не срабатывала бы, и это читалось бы как поломка.
        const err = await res.json().catch(() => ({} as { message?: string }));
        showAlert(err.message || "Не удалось завершить опрос.");
      }
    } catch (e) {
      console.error(e);
      showAlert("Не удалось завершить опрос.");
    }
  };

  // Who voted for what is admin-only: creators can resolve polls but must not see the names
  // behind the votes. The server also withholds `option.voters` from everyone else.
  const canSeeVoters = !!user && user.role === 'admin';

  // Служебная строка редакции: кто завёл опрос, когда и кто его закрыл. Сервер отдаёт эти поля
  // только админам и создателю, поэтому наличие ключа `author` — и есть признак, что показывать
  // строку можно; у читателя её просто нет.
  const showEditorialMeta = canSeeEditorialMeta(user)
    && (pollData.author !== undefined || pollData.created_at !== undefined || !!pollData.resolved_by);

  return (
    <div
      className={`bg-zinc-50 dark:bg-zinc-900/50 rounded-[20px] p-4 lg:p-5 mb-4 border ${pollData.is_resolved && !isVoid ? 'border-green-500/20 dark:border-green-500/20' : 'border-zinc-100 dark:border-zinc-800'}`}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <h4 className="font-semibold text-zinc-900 dark:text-white text-[15px] mb-2 leading-snug">
        {pollData.question}
        {pollData.is_resolved === 1 && !isVoid && <span className="ml-2 text-xs text-green-500 font-bold uppercase border border-green-500 rounded px-1">Завершен</span>}
        {/* Серый, а не зелёный: «без результата» — это не успех и не ошибка, а отсутствие исхода. */}
        {isVoid && <span className="ml-2 text-xs text-zinc-500 font-bold uppercase border border-zinc-400 dark:border-zinc-600 rounded px-1">Без результата</span>}
        {/* Пометка про срок: опрос с закрытым голосованием внешне ничем не отличался от идущего —
            варианты на месте, «Завершен» ещё нет. Читатель понимал, что голосовать нельзя, только
            дойдя до неактивной кнопки внизу карточки. */}
        {votingClosedByDeadline && <span className="ml-2 text-xs text-amber-600 dark:text-amber-500 font-bold uppercase border border-amber-500 rounded px-1">Приём голосов закрыт</span>}
      </h4>

      {pollData.ends_at && !pollData.is_resolved ? (
        // Срок голосования — то, по чему читатель решает, успевает он или нет, и то, по чему
        // редакция ищет опросы к завершению. Раньше он терялся серой мелочью наравне со всем
        // остальным, поэтому сама дата теперь заметно плотнее подписи.
        <div className={`flex items-center gap-1.5 text-xs mb-3 ${votingClosedByDeadline ? 'text-amber-700 dark:text-amber-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
          <Clock size={14} className="shrink-0" />
          <span>
            {votingClosedByDeadline ? (
              <>
                Голосование закрылось{' '}
                <span className="font-bold text-sm tabular-nums">{formatPollDate(pollData.ends_at)}</span>
                {' '}— результат объявят позже
              </>
            ) : (
              <>
                Голосование до{' '}
                <span className="font-bold text-sm text-zinc-800 dark:text-zinc-100 tabular-nums">
                  {formatPollDate(pollData.ends_at)}
                </span>
              </>
            )}
          </span>
        </div>
      ) : (
        <div className="mb-2" />
      )}

      {showEditorialMeta && (
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400 dark:text-zinc-500 mb-3 pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <span className={`flex items-center gap-1.5 ${pollData.author ? '' : 'italic'}`}>
            <UserIcon size={12} className="shrink-0" />
            {pollData.author ? (pollData.author.name || pollData.author.username) : 'Автор не указан'}
          </span>
          {pollData.created_at && <span>Создан {formatDateOnly(pollData.created_at)}</span>}
          {pollData.is_resolved === 1 && (
            <span className={isVoid ? 'text-zinc-500' : 'text-green-600 dark:text-green-500'}>
              {isVoid ? 'Закрыт без результата' : 'Завершён'} {formatDateTime(pollData.resolved_at, '—')}
              {pollData.resolved_by && ` · ${pollData.resolved_by.name || pollData.resolved_by.username}`}
            </span>
          )}
        </div>
      )}

      <div className="space-y-2 mb-4">
        {pollData.options.map((option, index) => {
          const isCorrect = pollData.is_resolved === 1 && pollData.correct_option_id === option.id;
          const revealDelay = stagger ? index * POLL_FILL_STEP : 0;

          return (
            <div key={option.id} className="space-y-2">
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (canVote) {
                    setSelectedOption(option.id);
                  }
                }}
                className={`relative group/option cursor-pointer rounded-xl transition-all duration-300 overflow-hidden ${canVote ? 'hover:bg-zinc-100 dark:hover:bg-zinc-800/50' : 'cursor-default'
                  } ${isCorrect ? 'ring-2 ring-green-500' : ''}`}
              >
                {/* Заливка всегда в DOM: пока результатов нет, она стоит на scaleX(0) и прозрачна,
                    поэтому переход отрабатывает и при первом показе, и при смене долей. */}
                <div
                  className={`absolute inset-0 origin-left will-change-transform transition-[transform,opacity] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${isCorrect
                    ? 'bg-gradient-to-r from-green-500/10 to-green-500/30'
                    : 'bg-gradient-to-r from-blue-100/40 to-blue-200/70 dark:from-blue-900/20 dark:to-blue-800/40'
                    }`}
                  style={{
                    transform: `scaleX(${showResults && revealed ? option.percent / 100 : 0})`,
                    opacity: showResults ? 1 : 0,
                    transitionDuration: `${POLL_FILL_DURATION}ms`,
                    transitionDelay: `${revealDelay}ms`,
                  }}
                />

                {/* Одиночный блик по строке, за которую отдан голос — подтверждение выбора. */}
                {showResults && revealed && selectedOption === option.id && (
                  <div
                    className="pointer-events-none absolute inset-0 poll-sheen"
                    style={{ animationDelay: `${revealDelay}ms` }}
                  />
                )}

                <div className="relative z-10 flex items-start gap-3 px-3 py-2.5">
                  <div className={`mt-0.5 shrink-0 transition-colors duration-200 ${selectedOption === option.id
                    ? 'text-blue-500 scale-110'
                    : !canVote
                      ? 'text-zinc-300 dark:text-zinc-600'
                      : 'text-zinc-400 group-hover/option:text-blue-500'
                    }`}>
                    {isCorrect ? (
                      <CheckCircle2 size={20} className="text-green-500" />
                    ) : selectedOption === option.id ? (
                      <div className="relative">
                        <div className="absolute inset-0 bg-blue-500 blur-sm opacity-20 rounded-full" />
                        <CheckCircle2 size={20} className="fill-blue-500 text-white dark:text-black" />
                      </div>
                    ) : (
                      <Circle size={20} />
                    )}
                  </div>

                  {/* min-w-0 обязателен: без него длинный вариант распирает строку по своей
                      минимальной ширине, и проценты справа схлопываются до обрезка («1» вместо
                      «100%»). Кнопка «Выбрать» вынесена под текст — на узком экране рядом с ним
                      она сдавливала вариант до двух слов в строке и налезала на него. */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <span className={`min-w-0 break-words text-sm leading-relaxed transition-colors duration-200 ${selectedOption === option.id || isCorrect
                        ? 'text-zinc-900 dark:text-white font-medium'
                        : 'text-zinc-600 dark:text-zinc-300 group-hover/option:text-zinc-900 dark:group-hover/option:text-zinc-200'
                        }`}>
                        {option.text}
                      </span>

                      {showResults && option.percent > 0 && (
                        <div
                          className="shrink-0 text-sm leading-relaxed font-bold tabular-nums whitespace-nowrap text-blue-600 dark:text-blue-400 transition-all duration-500 ease-out motion-reduce:transition-none"
                          style={{
                            opacity: revealed ? 1 : 0,
                            transform: revealed ? 'translateX(0)' : 'translateX(8px)',
                            transitionDelay: `${revealDelay}ms`,
                          }}
                        >
                          <AnimatedPercent value={option.percent} active={revealed} delay={revealDelay} />
                        </div>
                      )}
                    </div>

                    {canResolve && (
                      // Подпись называет последствие, а не действие: «Выбрать» стояло рядом с
                      // «Голосовать» и читалось как выбор своего варианта, а нажатие закрывало опрос.
                      // До конца срока кнопка ещё и другого цвета — жёлтая рядом с зелёной
                      // «Голосовать» сама по себе говорит, что это не голос.
                      // Флажок вместо галочки: галочка в этой карточке уже занята — ей помечены
                      // выбранный и верный варианты, и на кнопке она читалась бы как «отметить».
                      <button
                        onClick={(e) => { e.stopPropagation(); handleResolve(option.id); }}
                        title={votingClosed
                          ? 'Завершить опрос: этот вариант станет верным ответом'
                          : `Завершить опрос досрочно: голосование идёт до ${formatPollDate(deadline)}`}
                        className={`group/resolve mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1
                          text-[11px] font-semibold leading-none tracking-tight
                          transition-all duration-200 ease-out active:scale-[0.97] motion-reduce:transition-none
                          focus:outline-none focus-visible:ring-2 ${votingClosed
                          ? 'border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500 hover:border-green-500 hover:text-white hover:shadow-sm hover:shadow-green-500/30 focus-visible:ring-green-500/40'
                          : 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500 hover:border-amber-500 hover:text-white hover:shadow-sm hover:shadow-amber-500/30 focus-visible:ring-amber-500/40'
                          }`}
                      >
                        <Flag size={11} className="shrink-0 opacity-60 transition-opacity duration-200 group-hover/resolve:opacity-100" />
                        <span>{votingClosed ? 'Это верный ответ — завершить' : 'Это верный ответ — завершить досрочно'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {showVoters && canSeeVoters && option.voters && option.voters.length > 0 && (
                <div className="pl-10 pr-2 py-2 flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-top-2">
                  {option.voters.slice(0, VISIBLE_VOTERS).map((voter) => (
                    <div
                      key={voter.id}
                      className="flex items-center gap-2 bg-white dark:bg-zinc-800 px-2 py-1 rounded-full border border-zinc-100 dark:border-zinc-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedUser(voter);
                      }}
                    >
                      <Avatar
                        src={voter.avatar}
                        alt={voter.username}
                        size={20}
                        fallbackText={voter.name || voter.username}
                      />
                      <span className="text-xs text-zinc-600 dark:text-zinc-300 font-medium max-w-[100px] truncate">
                        {voter.name || voter.username}
                      </span>
                    </div>
                  ))}
                  {option.voters.length > VISIBLE_VOTERS && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setVotersModalOption(option);
                      }}
                      className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-500 hover:text-white text-zinc-600 dark:text-zinc-300 px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-700 text-xs font-semibold transition-colors"
                    >
                      <Users size={12} />
                      +{option.voters.length - VISIBLE_VOTERS}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex justify-between items-center min-h-[2.25rem]">
        {canSeeVoters && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowVoters(!showVoters); }}
            className="text-xs text-zinc-400 hover:text-blue-500 transition-colors flex items-center gap-1"
          >
            {showVoters ? 'Скрыть голоса' : 'Показать голоса'}
          </button>
        )}

        <div className="flex-1 flex justify-end">
          {canVote ? (
            <Button
              onClick={handleVote}
              disabled={selectedOption === null || isVoting || !user}
              className={`transition-all duration-300 ${selectedOption !== null && user
                ? '!bg-[#38bdf8] hover:!bg-[#0ea5e9] !text-black !font-semibold shadow-lg shadow-blue-500/20 scale-100'
                : '!bg-zinc-200 dark:!bg-zinc-800 !text-zinc-400 cursor-not-allowed scale-95 opacity-70'
                } !px-8 !py-2 !text-sm rounded-full w-full sm:w-auto`}
            >
              {isVoting ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                !user ? 'Войдите чтобы голосовать' : 'Голосовать'
              )}
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-sm font-medium animate-in fade-in duration-500">
              {hasVoted && <span className="w-2 h-2 rounded-full bg-green-500" />}
              {isVoid
                ? 'Результат не был объявлен'
                : hasVoted
                  ? 'Ваш голос учтен'
                  : votingClosedByDeadline
                    ? 'Голосование закрыто — ждём результат'
                    : 'Голосование завершено'}
            </div>
          )}
        </div>
      </div>

      <VotersModal
        isOpen={!!votersModalOption}
        onClose={() => setVotersModalOption(null)}
        optionText={votersModalOption?.text || ''}
        voters={votersModalOption?.voters || []}
        onSelectUser={(voter) => {
          setVotersModalOption(null);
          setSelectedUser(voter);
        }}
      />

      <UserProfileModal
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        user={selectedUser}
      />
    </div>
  );
});

export const NewsCard: React.FC<{
  item: NewsItem;
  onRefresh?: (newsId: number) => void;
  onEdit?: (newsId: number) => void;
}> = React.memo(({ item, onRefresh, onEdit }) => {
  // Лента перечитывает по этому сигналу одну карточку, а не весь список, поэтому ей нужен id.
  // Колбэк собирается здесь и один раз: если отдавать вниз новую стрелку на каждый рендер,
  // React.memo на Poll перестанет работать.
  const notifyChanged = useCallback(() => onRefresh?.(Number(item.id)), [onRefresh, item.id]);
  const [isLiked, setIsLiked] = useState(item.isLiked || false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  // Часть перенесённых из WordPress новостей ссылается на картинки, которых больше нет. Раньше
  // такая карточка всё равно резервировала под изображение блок в треть экрана — и лента
  // выглядела как полотно пустых белых полей. Не загрузилась — блока просто нет.
  const [imageBroken, setImageBroken] = useState(false);
  const { user } = useAuth();
  const { showAlert, showConfirm } = useDialog();

  // Новая ссылка на картинку заслуживает новой попытки её загрузить.
  useEffect(() => {
    setImageBroken(false);
  }, [item.image]);

  const hasImage = !!item.image && !imageBroken;

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await showConfirm('Вы уверены, что хотите удалить эту новость?');
    if (!confirmed) return;

    try {
      const res = await fetch(getApiUrl(`/api/news/${item.id}`), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        notifyChanged();
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleLike = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (likeLoading) return;
    const token = localStorage.getItem('token');
    if (!token) {
      showAlert('Please login to like posts');
      return;
    }

    setLikeLoading(true);
    const previousState = isLiked;
    setIsLiked(!isLiked);

    try {
      const res = await fetch(getApiUrl(`/api/news/${item.id}/like`), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        setIsLiked(previousState);
      }
    } catch (e) {
      console.error(e);
      setIsLiked(previousState);
    } finally {
      setLikeLoading(false);
    }
  };

  return (
    <>
      <div className="bg-transparent">
        <div
          className="bg-white dark:bg-[#121212] rounded-[32px] border border-zinc-200 dark:border-zinc-800/50 overflow-hidden hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-500 group cursor-pointer animate-in fade-in slide-in-from-bottom-4"
          onClick={() => setIsModalOpen(true)}
        >
          {/* Пропорция, а не фиксированная высота: на широком мониторе карточка растягивается,
              и жёсткие 224 пикселя превращали изображение в узкую полосу почти 3:1.
              Потолок задан в vh и подобран так, чтобы на ноутбучном экране (13", ~850 CSS px
              высоты) он ещё не срабатывал и картинка оставалась честными 16:10, а на низких
              экранах — подрезал её, чтобы карточка с вариантами ответа влезала целиком.

              На телефоне пропорция другая: колонка там узкая, и при 16:10 картинка занимает
              около четверти высоты экрана — вдвое меньшую долю, чем на ноутбуке, отчего и
              выглядит приплюснутой полосой. 4:3 возвращает ей вес в кадре. */}
          {hasImage && (
            <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] max-h-[52vh] overflow-hidden">
              <img
                src={item.image}
                alt={item.title}
                onError={() => setImageBroken(true)}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/5 dark:bg-black/20" />
              <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white via-white/80 to-transparent dark:from-[#121212] dark:via-[#121212]/90 dark:to-transparent" />

              <div className="absolute bottom-3 left-5 flex flex-wrap gap-2 z-10">
                {item.tags.map((tag, i) => (
                  <span key={i} className="px-3.5 py-1 bg-zinc-100/95 dark:bg-zinc-900/95 rounded-full text-xs font-medium text-zinc-900 dark:text-zinc-200 border border-white/40 dark:border-white/10 shadow-sm">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className={`px-5 pb-5 lg:px-6 lg:pb-6 ${hasImage ? 'pt-2' : 'pt-5'}`}>
            {/* Без картинки теги теряют своё место поверх неё — здесь они становятся обычной строкой,
                а карточка не превращается в пустой прямоугольник с одним заголовком. */}
            {!hasImage && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {item.tags.map((tag, i) => (
                  <span key={i} className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-full text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mb-1.5 text-xs font-medium text-zinc-400 dark:text-zinc-500">
              {formatNewsDate(item.date) && (
                <span className="flex items-center gap-1.5">
                  <Clock size={12} className="shrink-0" />
                  {formatNewsDate(item.date)}
                </span>
              )}
              {/* Авторство видно только редакции — читателю оно ни к чему. */}
              {canSeeEditorialMeta(user) && (
                <span className={`flex items-center gap-1.5 ${item.author ? '' : 'italic'}`}>
                  <UserIcon size={12} className="shrink-0" />
                  {item.author ? (item.author.name || item.author.username) : 'Автор не указан'}
                </span>
              )}
            </div>
            <h3 className="text-lg lg:text-xl font-bold text-zinc-900 dark:text-white mb-2 leading-tight hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
              {item.title}
            </h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed mb-4 line-clamp-2">
              {item.description}
            </p>

            {item.source && (
              <a
                href={item.source}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 mb-4 -mt-1 max-w-full truncate"
              >
                <LinkIcon size={13} className="shrink-0" />
                <span className="truncate">Источник</span>
              </a>
            )}

            {item.poll && (
              <div
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
              >
                <Poll data={item.poll} onPollChange={notifyChanged} />
              </div>
            )}

            <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
              <button
                onClick={handleLike}
                disabled={likeLoading}
                className={`p-2 rounded-full transition-colors duration-200 group/btn relative ${isLiked
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-500'
                  : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-red-500'
                  }`}
              >
                <Heart size={20} className={`${isLiked ? 'fill-current' : ''}`} />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const url = `${window.location.origin}/?news=${item.id}`;
                  const button = e.currentTarget as HTMLButtonElement;
                  const originalHTML = button.innerHTML;

                  navigator.clipboard.writeText(url).then(() => {
                    button.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                    button.classList.add('!text-green-500', '!bg-green-50', 'dark:!bg-green-900/20');

                    setTimeout(() => {
                      button.innerHTML = originalHTML;
                      button.classList.remove('!text-green-500', '!bg-green-50', 'dark:!bg-green-900/20');
                    }, 1500);
                  }).catch(err => {
                    console.error('Failed to copy:', err);
                    showAlert('Не удалось скопировать ссылку');
                  });
                }}
                className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full group/btn"
              >
                <Share2 size={20} className="group-hover/btn:scale-110 transition-transform" />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!user) {
                    showAlert('Пожалуйста, войдите, чтобы сообщить об ошибке');
                    return;
                  }
                  setIsReportModalOpen(true);
                }}
                className="p-2 text-zinc-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/10 rounded-full transition-all group/btn"
              >
                <AlertTriangle size={20} className="group-hover/btn:scale-110 transition-transform" />
              </button>

              {user && (user.role === 'admin' || user.role === 'creator') && (
                <>
                  {/* Опечатку в опубликованном опросе раньше можно было исправить только удалением
                      всей новости вместе с голосами — теперь правка открывается отсюда. */}
                  {onEdit && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(Number(item.id)); }}
                      title="Редактировать"
                      aria-label="Редактировать"
                      className="p-2 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-all group/btn"
                    >
                      <Pencil size={20} className="group-hover/btn:scale-110 transition-transform" />
                    </button>
                  )}
                  <button
                    onClick={handleDelete}
                    className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all group/btn"
                  >
                    <Trash2 size={20} className="group-hover/btn:scale-110 transition-transform" />
                  </button>
                </>
              )}
            </div>

          </div>
        </div >
      </div >

      <NewsModal item={item} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onRefresh={notifyChanged}>
        {item.poll && <Poll data={item.poll} onPollChange={notifyChanged} />}
      </NewsModal>

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        newsId={item.id}
        newsTitle={item.title}
      />
    </>
  );
});
