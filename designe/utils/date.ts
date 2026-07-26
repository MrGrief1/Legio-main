// Publication timestamps reach the client in two shapes: SQLite's "YYYY-MM-DD HH:MM:SS"
// (what CURRENT_TIMESTAMP writes — always UTC, no zone marker) and ISO strings carried over
// by the WordPress import. `new Date("2025-06-10 07:00:00")` is not valid per the spec:
// Safari returns Invalid Date, and Chrome parses it as *local* time, which shifts every post
// by the viewer's offset and can flip the order of two posts published minutes apart.
// Normalising the separator and pinning UTC keeps the rendered date consistent with the
// server-side ordering.
export const parseNewsDate = (value?: string | null): Date | null => {
    if (!value) return null;

    const raw = String(value).trim();
    const isNaiveTimestamp = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw)
        && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);

    const parsed = new Date(isNaiveTimestamp ? `${raw.replace(' ', 'T')}Z` : raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// "сегодня"/"вчера" for fresh posts, an explicit date for anything older. The feed is sorted
// by this value, so it has to be readable at a glance.
export const formatNewsDate = (value?: string | null): string => {
    const date = parseNewsDate(value);
    if (!date) return '';

    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const dayDiff = Math.round((startOfToday - new Date(date).setHours(0, 0, 0, 0)) / 86_400_000);
    const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    if (dayDiff === 0) return `сегодня, ${time}`;
    if (dayDiff === 1) return `вчера, ${time}`;

    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: 'long',
        ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
    });
};

// Full date + time, for detail views where the exact moment matters.
export const formatDateTime = (value?: string | null, fallback = ''): string => {
    const date = parseNewsDate(value);
    if (!date) return fallback;

    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

// Date only, no clock — registration rows, birthdates and similar.
export const formatDateOnly = (value?: string | null, fallback = ''): string => {
    const date = parseNewsDate(value);
    if (!date) return fallback;

    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
