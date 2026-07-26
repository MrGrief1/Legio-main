import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

interface CountdownTimerProps {
    // Absolute deadline (ISO). The remaining time is anchored to the server's own clock so a
    // skewed device can't show a different countdown than everyone else.
    deadline: string;
    // Server time at the moment `deadline` was fetched — used to derive the client/server offset.
    serverTime?: string;
    onExpire?: () => void;
    className?: string;
    compact?: boolean;
}

const splitDuration = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));

    return {
        days: Math.floor(total / 86_400),
        hours: Math.floor((total % 86_400) / 3_600),
        minutes: Math.floor((total % 3_600) / 60),
        seconds: total % 60,
    };
};

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
    deadline,
    serverTime,
    onExpire,
    className = '',
    compact = false,
}) => {
    const { t } = useLanguage();

    // Positive when the device clock runs ahead of the server. Applied to every tick so the
    // countdown reaches zero exactly when the server rolls the month over.
    const clockOffset = useMemo(() => {
        if (!serverTime) return 0;
        const server = new Date(serverTime).getTime();
        if (Number.isNaN(server)) return 0;
        return Date.now() - server;
    }, [serverTime]);

    const deadlineMs = useMemo(() => new Date(deadline).getTime(), [deadline]);

    const [remaining, setRemaining] = useState(() => Math.max(0, deadlineMs - (Date.now() - clockOffset)));

    useEffect(() => {
        if (Number.isNaN(deadlineMs)) return;

        const tick = () => {
            const next = Math.max(0, deadlineMs - (Date.now() - clockOffset));
            setRemaining(next);
            return next;
        };

        tick();
        const interval = setInterval(() => {
            if (tick() === 0) {
                clearInterval(interval);
                onExpire?.();
            }
        }, 1000);

        return () => clearInterval(interval);
        // onExpire is intentionally left out: callers pass an inline closure, and re-running this
        // effect on every parent render would restart the timer a second at a time.
    }, [deadlineMs, clockOffset]);

    if (Number.isNaN(deadlineMs)) return null;

    const { days, hours, minutes, seconds } = splitDuration(remaining);
    const pad = (value: number) => String(value).padStart(2, '0');

    if (compact) {
        return (
            <span className={`tabular-nums font-semibold ${className}`}>
                {days > 0 && `${days}${t.leaderboard.days} `}
                {pad(hours)}:{pad(minutes)}:{pad(seconds)}
            </span>
        );
    }

    const units = [
        { value: days, label: t.leaderboard.days },
        { value: hours, label: t.leaderboard.hours },
        { value: minutes, label: t.leaderboard.minutes },
        { value: seconds, label: t.leaderboard.seconds },
    ];

    return (
        <div className={`flex items-center gap-1.5 ${className}`}>
            {units.map((unit, index) => (
                <React.Fragment key={unit.label}>
                    {index > 0 && <span className="text-zinc-300 dark:text-zinc-700 font-bold pb-3">:</span>}
                    <div className="flex flex-col items-center min-w-[2.75rem] px-1.5 py-1.5 rounded-xl bg-white/70 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800">
                        <span className="text-lg lg:text-xl font-bold tabular-nums text-zinc-900 dark:text-white leading-none">
                            {pad(unit.value)}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mt-0.5">
                            {unit.label}
                        </span>
                    </div>
                </React.Fragment>
            ))}
        </div>
    );
};
