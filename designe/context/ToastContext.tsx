import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertTriangle, Info, Trophy } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'prize';

interface Toast {
    id: string;
    message: string;
    title?: string;
    type: ToastType;
    duration: number;
    // Set while the exit animation plays, just before the toast is unmounted.
    leaving?: boolean;
}

interface ShowToastOptions {
    title?: string;
    durationMs?: number;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType, options?: ShowToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = (): ToastContextType => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
};

const DEFAULT_DURATION_MS = 4500;
const EXIT_MS = 250;
// Beyond this, older toasts are dropped: a tall stack covers the page and nobody reads the bottom.
const MAX_VISIBLE = 3;

// The icon is a filled circle in the type's colour — that reads as deliberate at a glance, where a
// tinted square on a white card just looked like an unstyled alert box. `glow` is a soft coloured
// halo behind the card so it lifts off the page instead of sitting flat on it.
const TONES: Record<ToastType, {
    icon: ReactNode;
    badge: string;
    glow: string;
    bar: string;
    defaultTitle: string;
}> = {
    success: {
        icon: <CheckCircle2 size={17} strokeWidth={2.5} />,
        badge: 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/30',
        glow: 'shadow-[0_10px_40px_-12px_rgba(16,185,129,0.45)]',
        bar: 'bg-emerald-500',
        defaultTitle: 'Готово',
    },
    error: {
        icon: <AlertTriangle size={17} strokeWidth={2.5} />,
        badge: 'bg-gradient-to-br from-red-400 to-red-600 shadow-red-500/30',
        glow: 'shadow-[0_10px_40px_-12px_rgba(239,68,68,0.45)]',
        bar: 'bg-red-500',
        defaultTitle: 'Ошибка',
    },
    info: {
        icon: <Info size={17} strokeWidth={2.5} />,
        badge: 'bg-gradient-to-br from-blue-400 to-blue-600 shadow-blue-500/30',
        glow: 'shadow-[0_10px_40px_-12px_rgba(59,130,246,0.45)]',
        bar: 'bg-blue-500',
        defaultTitle: 'Уведомление',
    },
    prize: {
        icon: <Trophy size={17} strokeWidth={2.5} fill="currentColor" />,
        badge: 'bg-gradient-to-br from-yellow-400 to-amber-600 shadow-amber-500/30',
        glow: 'shadow-[0_10px_40px_-12px_rgba(245,158,11,0.5)]',
        bar: 'bg-amber-500',
        defaultTitle: 'Приз',
    },
};

// One toast. Owns its own dismiss timer so hovering can pause it — a message that vanishes while
// being read is worse than no message.
const ToastCard: React.FC<{ toast: Toast; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
    const tone = TONES[toast.type];
    const [paused, setPaused] = useState(false);

    // The entry animation is pure CSS, deliberately. Driving it from a requestAnimationFrame
    // callback (set a `mounted` flag, then transition) leaves the toast stuck at opacity 0 whenever
    // rAF doesn't run — a tab that isn't painting never fires it, while the setTimeout that
    // dismisses the toast keeps counting. The message could expire without ever being seen.
    const remainingRef = useRef(toast.duration);
    const startedRef = useRef(Date.now());

    useEffect(() => {
        if (paused || toast.leaving) return;

        startedRef.current = Date.now();
        const timer = setTimeout(() => onDismiss(toast.id), remainingRef.current);

        return () => {
            clearTimeout(timer);
            // Bank the time already elapsed so a pause resumes rather than restarts.
            remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedRef.current));
        };
    }, [paused, toast.leaving, toast.id, onDismiss]);

    return (
        <div
            role="status"
            aria-live="polite"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            className={[
                'pointer-events-auto relative flex items-center gap-3.5 w-full overflow-hidden',
                'rounded-[20px] border border-zinc-200/70 dark:border-white/10',
                'bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl',
                tone.glow,
                'pl-3.5 pr-2.5 pt-3.5 pb-5',
            ].join(' ')}
            // Transform + opacity only, so both directions stay on the compositor. `forwards` holds
            // the end state, and the element is unmounted by the provider once the exit completes.
            style={{
                animation: toast.leaving
                    ? `legio-toast-out ${EXIT_MS}ms cubic-bezier(0.4,0,1,1) forwards`
                    : 'legio-toast-in 300ms cubic-bezier(0.22,1,0.36,1) forwards',
            }}
        >
            <span className={`shrink-0 grid place-items-center w-9 h-9 rounded-full text-white shadow-lg ${tone.badge}`}>
                {tone.icon}
            </span>

            <div className="flex-1 min-w-0">
                {/* Always a title: a lone sentence in a floating card reads like a fragment. When the
                    caller doesn't pass one, the type supplies it. */}
                <p className="text-[13px] font-bold text-zinc-900 dark:text-white leading-tight">
                    {toast.title || tone.defaultTitle}
                </p>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-snug break-words mt-0.5">
                    {toast.message}
                </p>
            </div>

            <button
                onClick={() => onDismiss(toast.id)}
                aria-label="Закрыть"
                className="shrink-0 self-start -mt-0.5 p-1.5 rounded-full text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
            >
                <X size={14} strokeWidth={2.5} />
            </button>

            {/* Time remaining, inset and rounded so it reads as part of the card rather than a stray
                line stuck to its edge. */}
            <span className="absolute bottom-1.5 left-3.5 right-3.5 h-[3px] rounded-full bg-zinc-200/70 dark:bg-white/10 overflow-hidden">
                <span
                    className={`block h-full rounded-full ${tone.bar}`}
                    style={{
                        animation: `legio-toast-progress ${toast.duration}ms linear forwards`,
                        animationPlayState: paused ? 'paused' : 'running',
                    }}
                />
            </span>
        </div>
    );
};

interface ToastProviderProps {
    children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const counter = useRef(0);

    // Two-phase removal: flag it, let the exit animation run, then unmount. The old version dropped
    // toasts from the array immediately, so they blinked out with no transition.
    const dismiss = useCallback((id: string) => {
        setToasts((prev) => prev.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)));
        setTimeout(() => {
            setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, EXIT_MS);
    }, []);

    const showToast = useCallback((message: string, type: ToastType = 'info', options?: ShowToastOptions) => {
        counter.current += 1;
        const id = `toast-${counter.current}`;

        setToasts((prev) => {
            const next = [...prev, {
                id,
                message,
                title: options?.title,
                type,
                duration: options?.durationMs ?? DEFAULT_DURATION_MS,
            }];

            // Keep the newest; the overflow is dropped outright rather than animated, since it was
            // never really on screen.
            return next.slice(-MAX_VISIBLE);
        });
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {toasts.length > 0 && createPortal(
                <>
                    <style>{`
                        @keyframes legio-toast-progress {
                            from { width: 100%; }
                            to { width: 0%; }
                        }
                        /* The entry animation deliberately does NOT touch opacity. Animations are
                           throttled or never advanced in a tab that isn't painting, and anything
                           starting from opacity:0 would then stay invisible while its dismiss timer
                           ran out — the message would expire unseen. Animating transform only means
                           the worst case is "appears without sliding", not "never appears". */
                        @keyframes legio-toast-in {
                            from { transform: translateY(-14px) scale(0.96); }
                            to   { transform: translateY(0) scale(1); }
                        }
                        /* Exit may fade: the element is unmounted straight after, so a skipped
                           animation just removes it immediately. */
                        @keyframes legio-toast-out {
                            from { opacity: 1; transform: translateY(0) scale(1); }
                            to   { opacity: 0; transform: translateY(-8px) scale(0.98); }
                        }
                        @media (prefers-reduced-motion: reduce) {
                            @keyframes legio-toast-in  { from { transform: none; } to { transform: none; } }
                            @keyframes legio-toast-out { from { opacity: 1; } to { opacity: 0; } }
                        }
                    `}</style>
                    {/* Top-centre on phones, top-right from sm up. The old stack sat dead centre of
                        the viewport, over the content the message was usually about. The container
                        is pointer-events-none so it never blocks clicks between toasts. */}
                    <div className="fixed z-[99999] top-3 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:top-4 sm:right-4 w-[min(24rem,calc(100vw-1.5rem))] flex flex-col gap-2.5 pointer-events-none">
                        {toasts.map((toast) => (
                            <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
                        ))}
                    </div>
                </>,
                document.body
            )}
        </ToastContext.Provider>
    );
};
