import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trophy, X, Sparkles } from 'lucide-react';
import { useMountTransition } from '../hooks/useMountTransition';
import { useScrollLock } from '../hooks/useScrollLock';
import { useLanguage } from '../context/LanguageContext';

export interface PrizeNotification {
    id: number;
    type: string;
    title: string;
    body?: string;
    points: number;
    createdAt: string;
    meta?: { month?: string; monthlyPoints?: number } | null;
}

interface PrizeModalProps {
    notification: PrizeNotification | null;
    onClose: () => void;
}

const MONTHS_NOMINATIVE_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Fixed positions rather than random ones: Math.random() during render produces a different layout
// on every re-render, which makes the confetti twitch instead of falling.
const CONFETTI = [
    { left: '8%', delay: 0, duration: 2600, color: '#eab308', size: 8 },
    { left: '18%', delay: 260, duration: 3000, color: '#38bdf8', size: 6 },
    { left: '29%', delay: 90, duration: 2400, color: '#f472b6', size: 9 },
    { left: '41%', delay: 420, duration: 2800, color: '#34d399', size: 7 },
    { left: '52%', delay: 150, duration: 3100, color: '#eab308', size: 6 },
    { left: '63%', delay: 520, duration: 2500, color: '#a78bfa', size: 8 },
    { left: '74%', delay: 60, duration: 2900, color: '#38bdf8', size: 7 },
    { left: '84%', delay: 340, duration: 2700, color: '#fb923c', size: 9 },
    { left: '93%', delay: 200, duration: 3200, color: '#f472b6', size: 6 },
];

export const PrizeModal: React.FC<PrizeModalProps> = ({ notification, onClose }) => {
    const isOpen = !!notification;
    const hasTransitionedIn = useMountTransition(isOpen, 300);
    useScrollLock(isOpen);
    const { language } = useLanguage();

    // Counts the prize up instead of just printing it — the number is the point of the whole dialog.
    const [shownPoints, setShownPoints] = useState(0);
    const target = notification?.points || 0;

    useEffect(() => {
        if (!isOpen || target <= 0) {
            setShownPoints(0);
            return;
        }

        // Start from the final figure, not from zero. requestAnimationFrame does not run in a tab
        // that isn't painting, so an animation seeded at 0 could leave the dialog reading "+0" —
        // showing the wrong prize amount is far worse than skipping the count-up. The first frame
        // (~16ms) resets it to 0 and animates up from there when rAF is actually running.
        setShownPoints(target);

        // Respect a user who has asked for less motion.
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return;
        }

        const DURATION = 900;
        let start = 0;
        let frame = 0;

        const tick = (now: number) => {
            if (!start) start = now;
            const progress = Math.min(1, (now - start) / DURATION);
            // Ease-out so it decelerates into the final value.
            setShownPoints(Math.round(target * (1 - Math.pow(1 - progress, 3))));
            if (progress < 1) frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);

        // Safety net. rAF can stop being called part-way through (a tab that stops painting), which
        // would freeze the counter on whatever intermediate figure it last computed — the dialog
        // would then state the wrong prize. A timer independent of the animation guarantees the real
        // number is what ends up on screen: the count-up is decoration, the amount is data.
        const settle = setTimeout(() => setShownPoints(target), DURATION + 150);

        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(settle);
        };
    }, [isOpen, target]);

    const monthLabel = useMemo(() => {
        const key = notification?.meta?.month;
        if (!key) return '';
        const [year, month] = key.split('-').map(Number);
        if (!year || !month) return '';
        const names = language === 'ru' ? MONTHS_NOMINATIVE_RU : MONTHS_EN;
        return `${names[month - 1]} ${year}`;
    }, [notification?.meta?.month, language]);

    if (!notification) return null;
    if (!isOpen && !hasTransitionedIn) return null;

    const locale = language === 'ru' ? 'ru-RU' : 'en-US';

    return createPortal(
        <div className={`fixed inset-0 z-[100000] flex items-center justify-center p-4 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
            <style>{`
                @keyframes legio-confetti-fall {
                    0%   { transform: translateY(-20px) rotate(0deg); opacity: 0; }
                    12%  { opacity: 1; }
                    100% { transform: translateY(260px) rotate(540deg); opacity: 0; }
                }
                @keyframes legio-prize-glow {
                    0%, 100% { transform: scale(1); opacity: 0.55; }
                    50%      { transform: scale(1.12); opacity: 0.9; }
                }
            `}</style>

            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

            <div
                className={`relative w-full max-w-sm rounded-[32px] overflow-hidden border border-yellow-300/40 dark:border-yellow-500/25 bg-white dark:bg-[#141414] shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'}`}
            >
                <button
                    onClick={onClose}
                    aria-label="Закрыть"
                    className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 text-zinc-700 dark:text-white transition-colors"
                >
                    <X size={18} />
                </button>

                {/* Celebration header */}
                <div className="relative pt-10 pb-8 px-6 text-center bg-gradient-to-b from-yellow-100 via-amber-50 to-white dark:from-yellow-500/20 dark:via-amber-500/5 dark:to-transparent overflow-hidden">
                    {/* Confetti sits behind the cup and must never eat clicks. */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                        {CONFETTI.map((piece, index) => (
                            <span
                                key={index}
                                className="absolute top-0 rounded-[2px]"
                                style={{
                                    left: piece.left,
                                    width: piece.size,
                                    height: piece.size * 1.6,
                                    backgroundColor: piece.color,
                                    animation: `legio-confetti-fall ${piece.duration}ms ${piece.delay}ms ease-in infinite`,
                                }}
                            />
                        ))}
                    </div>

                    <div className="relative inline-grid place-items-center mb-4">
                        <span
                            className="absolute w-24 h-24 rounded-full bg-yellow-400/40 blur-xl"
                            style={{ animation: 'legio-prize-glow 2400ms ease-in-out infinite' }}
                            aria-hidden="true"
                        />
                        <span className="relative grid place-items-center w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 text-white shadow-lg shadow-yellow-500/30">
                            <Trophy size={36} fill="currentColor" />
                        </span>
                    </div>

                    <h2 className="relative text-2xl font-bold text-zinc-900 dark:text-white mb-1">
                        {notification.title}
                    </h2>
                    {monthLabel && (
                        <p className="relative text-xs font-bold uppercase tracking-widest text-yellow-700/80 dark:text-yellow-500/80">
                            {monthLabel}
                        </p>
                    )}
                </div>

                <div className="px-6 pb-6 -mt-2">
                    {/* The award itself */}
                    <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 px-5 py-5 text-center">
                        <div className="flex items-center justify-center gap-2 mb-1">
                            <Sparkles size={16} className="text-yellow-500" />
                            <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                                {language === 'ru' ? 'Ваш приз' : 'Your prize'}
                            </span>
                        </div>
                        <p className="text-4xl font-extrabold tabular-nums bg-gradient-to-r from-yellow-500 to-amber-600 bg-clip-text text-transparent leading-tight">
                            +{shownPoints.toLocaleString(locale)}
                        </p>
                        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {language === 'ru' ? 'баллов зачислено' : 'points credited'}
                        </p>
                    </div>

                    {notification.body && (
                        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300 text-center leading-relaxed">
                            {notification.body}
                        </p>
                    )}

                    {typeof notification.meta?.monthlyPoints === 'number' && notification.meta.monthlyPoints > 0 && (
                        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500 text-center">
                            {language === 'ru'
                                ? `Вы набрали ${notification.meta.monthlyPoints.toLocaleString(locale)} баллов за месяц`
                                : `You scored ${notification.meta.monthlyPoints.toLocaleString(locale)} points that month`}
                        </p>
                    )}

                    <button
                        onClick={onClose}
                        className="mt-6 w-full py-3.5 rounded-full bg-gradient-to-r from-yellow-500 to-amber-500 text-white font-bold text-sm shadow-lg shadow-yellow-500/25 hover:opacity-95 transition-opacity"
                    >
                        {language === 'ru' ? 'Отлично!' : 'Awesome!'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
