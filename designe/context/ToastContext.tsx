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

const TONES: Record<ToastType, {
    icon: ReactNode;
    iconWrap: string;
    accent: string;
    ring: string;
}> = {
    success: {
        icon: <CheckCircle2 size={18} />,
        iconWrap: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        accent: 'bg-emerald-500',
        ring: 'ring-emerald-500/20',
    },
    error: {
        icon: <AlertTriangle size={18} />,
        iconWrap: 'bg-red-500/15 text-red-600 dark:text-red-400',
        accent: 'bg-red-500',
        ring: 'ring-red-500/20',
    },
    info: {
        icon: <Info size={18} />,
        iconWrap: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
        accent: 'bg-blue-500',
        ring: 'ring-blue-500/20',
    },
    prize: {
        icon: <Trophy size={18} />,
        iconWrap: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
        accent: 'bg-yellow-500',
        ring: 'ring-yellow-500/20',
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
                'pointer-events-auto relative flex items-start gap-3 w-full overflow-hidden',
                'rounded-2xl border border-zinc-200/80 dark:border-zinc-700/60',
                'bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl',
                'shadow-lg shadow-black/5 dark:shadow-black/40 ring-1',
                tone.ring,
                'pl-4 pr-2 py-3',
            ].join(' ')}
            // Transform + opacity only, so both directions stay on the compositor. `forwards` holds
            // the end state, and the element is unmounted by the provider once the exit completes.
            style={{
                animation: toast.leaving
                    ? `legio-toast-out ${EXIT_MS}ms cubic-bezier(0.4,0,1,1) forwards`
                    : 'legio-toast-in 300ms cubic-bezier(0.22,1,0.36,1) forwards',
            }}
        >
            {/* Accent edge — carries the type at a glance without colouring the whole card. */}
            <span className={`absolute left-0 top-0 bottom-0 w-1 ${tone.accent}`} />

            <span className={`shrink-0 mt-0.5 grid place-items-center w-8 h-8 rounded-xl ${tone.iconWrap}`}>
                {tone.icon}
            </span>

            <div className="flex-1 min-w-0 pt-0.5">
                {toast.title && (
                    <p className="text-sm font-bold text-zinc-900 dark:text-white leading-tight mb-0.5">
                        {toast.title}
                    </p>
                )}
                <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-snug break-words">
                    {toast.message}
                </p>
            </div>

            <button
                onClick={() => onDismiss(toast.id)}
                aria-label="Закрыть"
                className="shrink-0 p-1.5 rounded-full text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
                <X size={15} />
            </button>

            {/* Time remaining, so the disappearance is expected rather than sudden. */}
            <span
                className={`absolute bottom-0 left-0 h-0.5 ${tone.accent} opacity-40`}
                style={{
                    animation: `legio-toast-progress ${toast.duration}ms linear forwards`,
                    animationPlayState: paused ? 'paused' : 'running',
                }}
            />
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
                        @keyframes legio-toast-in {
                            from { opacity: 0; transform: translateY(-12px) scale(0.97); }
                            to   { opacity: 1; transform: translateY(0) scale(1); }
                        }
                        @keyframes legio-toast-out {
                            from { opacity: 1; transform: translateY(0) scale(1); }
                            to   { opacity: 0; transform: translateY(-8px) scale(0.98); }
                        }
                        /* Someone who has asked for less motion still gets the toast — it just
                           appears instead of sliding. */
                        @media (prefers-reduced-motion: reduce) {
                            @keyframes legio-toast-in  { from { opacity: 0; } to { opacity: 1; } }
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
