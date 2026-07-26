import { useEffect, useRef } from 'react';

// Keeps data current while a tab is open, without generating a flood of requests.
//
// The naive version of this — subscribe to both `focus` and `visibilitychange`, plus a short
// interval, in every component that shows live data — is what put the app over its own rate limit.
// Returning to a tab fires BOTH events, so every panel refetched twice per switch; with four panels
// (one of them making two calls) that was ~10 requests for a single alt-tab, and a handful of tab
// switches was enough to earn 429s across the whole UI.
//
// So this hook enforces three rules for every caller:
//   1. one refresh path, not two — the two events are collapsed and de-duplicated;
//   2. a minimum gap between refreshes, so bursts of events cost at most one request;
//   3. no polling while the tab is hidden — a backgrounded tab should cost nothing.
export function useAutoRefresh(
    refresh: () => void,
    {
        intervalMs = 180_000,
        // Ignore any trigger that lands within this window of the previous refresh.
        minGapMs = 30_000,
        enabled = true,
    }: { intervalMs?: number; minGapMs?: number; enabled?: boolean } = {}
) {
    // Held in a ref so callers can pass an inline closure without restarting the timer every render.
    const refreshRef = useRef(refresh);
    refreshRef.current = refresh;

    const lastRunRef = useRef(Date.now());

    useEffect(() => {
        if (!enabled) return;

        const run = (force = false) => {
            const now = Date.now();
            if (!force && now - lastRunRef.current < minGapMs) return;
            lastRunRef.current = now;
            refreshRef.current();
        };

        const onInterval = () => {
            // A hidden tab is not being read, so refreshing it is pure cost. The visibility handler
            // below brings it up to date the moment it is looked at again.
            if (document.visibilityState !== 'visible') return;
            run();
        };

        // Both events mean "the user is looking at this again". They fire together on a tab switch,
        // and `run`'s gap check is what stops that from becoming two requests.
        const onWake = () => {
            if (document.visibilityState !== 'visible') return;
            run();
        };

        const interval = setInterval(onInterval, intervalMs);
        window.addEventListener('focus', onWake);
        document.addEventListener('visibilitychange', onWake);

        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', onWake);
            document.removeEventListener('visibilitychange', onWake);
        };
    }, [enabled, intervalMs, minGapMs]);
}
