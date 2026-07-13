import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Loader2, RefreshCw, TrendingUp, TrendingDown, Minus, Users, UserPlus,
    Eye, Vote, Heart, Activity, Target, Trophy, Newspaper, Clock,
    CheckCircle2, XCircle, HelpCircle, ArrowRight, Shield, Sparkles
} from 'lucide-react';
import { getApiUrl } from '../config';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Granularity = 'hour' | 'day' | 'month';
type Period = '24h' | '7d' | '30d' | '12m';

interface SeriesPoint {
    label: string;
    iso: string;
    votes: number;
    newUsers: number;
    likes: number;
    polls: number;
    visits: number;
    uniqueVisitors: number;
    engagement: number;
}

interface StatsResponse {
    period: Period;
    granularity: Granularity;
    hasVisitSeries: boolean;
    generatedAt: string;
    totals: {
        users: number; news: number; polls: number; votes: number; likes: number;
        messages: number; resolvedPolls: number; activePolls: number;
        uniqueVoters: number; pendingReports: number;
    };
    periodMetrics: {
        visits: number; uniqueVisitors: number; newUsers: number; activeUsers: number;
        votes: number; likes: number; engagementRate: number;
        deltas: { visits: number; newUsers: number; votes: number; activeUsers: number };
    };
    series: SeriesPoint[];
    activityByHour: { hour: number; label: string; votes: number }[];
    prediction: { correct: number; incorrect: number; pending: number; accuracy: number };
    categories: { category: string; polls: number; votes: number }[];
    topPolls: { id: number; question: string; votes: number; active: boolean; category: string }[];
    topUsers: { id: number; name: string; username: string; points: number; avatar: string | null }[];
    roles: { admin: number; creator: number; user: number };
}

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const PERIODS: { id: Period; label: string; short: string }[] = [
    { id: '24h', label: '24 часа', short: '24Ч' },
    { id: '7d', label: '7 дней', short: '7Д' },
    { id: '30d', label: '30 дней', short: '30Д' },
    { id: '12m', label: '12 месяцев', short: '12М' },
];

type MetricKey = 'votes' | 'visits' | 'newUsers' | 'engagement' | 'likes';

const METRICS: { key: MetricKey; label: string; color: string; needsVisits?: boolean; unit?: string }[] = [
    { key: 'votes', label: 'Голоса', color: '#3b82f6' },
    { key: 'visits', label: 'Посещения', color: '#0891b2', needsVisits: true },
    { key: 'newUsers', label: 'Пользователи', color: '#8b5cf6' },
    { key: 'engagement', label: 'Вовлечённость', color: '#059669', needsVisits: true, unit: '%' },
    { key: 'likes', label: 'Лайки', color: '#e11d48' },
];

const CATEGORY_LABELS: Record<string, string> = {
    general: 'Общее', politics: 'Политика', economy: 'Экономика', sport: 'Спорт',
    sports: 'Спорт', tech: 'Технологии', technology: 'Технологии', science: 'Наука',
    culture: 'Культура', world: 'Мир', society: 'Общество', business: 'Бизнес',
};
const catLabel = (c: string) => CATEGORY_LABELS[c?.toLowerCase()] || c || 'Общее';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmtCompact = (n: number): string => {
    const v = Number(n) || 0;
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (abs >= 10_000) return (v / 1_000).toFixed(0) + 'K';
    if (abs >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(v);
};
const fmtFull = (n: number): string => (Number(n) || 0).toLocaleString('ru-RU');

const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const tooltipDate = (iso: string, gran: Granularity): string => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const day = d.getUTCDate();
    const mon = RU_MONTHS[d.getUTCMonth()];
    const yr = d.getUTCFullYear();
    if (gran === 'hour') return `${String(d.getUTCHours()).padStart(2, '0')}:00 · ${day} ${mon}`;
    if (gran === 'month') return `${mon.charAt(0).toUpperCase() + mon.slice(1)} ${yr}`;
    return `${day} ${mon}`;
};

const niceCeil = (v: number): number => {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    const m = steps.find(s => s >= n) ?? 10;
    return m * p;
};

/* ------------------------------------------------------------------ */
/*  Small primitives                                                   */
/* ------------------------------------------------------------------ */

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
    <div className={`bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 rounded-3xl shadow-sm ${className}`}>
        {children}
    </div>
);

const DeltaBadge: React.FC<{ value: number }> = ({ value }) => {
    if (value === 0) {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 bg-zinc-100 dark:bg-zinc-800/60 px-1.5 py-0.5 rounded-md">
                <Minus size={11} /> 0%
            </span>
        );
    }
    const up = value > 0;
    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md ${up
            ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
            : 'text-rose-600 dark:text-rose-400 bg-rose-500/10'
            }`}>
            {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {up ? '+' : ''}{value}%
        </span>
    );
};

/* Tiny sparkline for KPI cards */
const Sparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
    const uid = React.useId().replace(/:/g, '');
    if (!data.length) return null;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const W = 100, H = 32;
    const pts = data.map((v, i) => {
        const x = data.length === 1 ? 0 : (i / (data.length - 1)) * W;
        const y = H - ((v - min) / range) * (H - 4) - 2;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-8">
            <defs>
                <linearGradient id={`spark-${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill={`url(#spark-${uid})`} />
            <polyline
                points={pts.join(' ')}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
};

/* KPI stat tile */
const StatCard: React.FC<{
    label: string; value: React.ReactNode; icon: React.ElementType; color: string;
    delta?: number; spark?: number[];
}> = ({ label, value, icon: Icon, color, delta, spark }) => (
    <Card className="p-5 overflow-hidden group hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
        <div className="flex items-start justify-between mb-3">
            <span className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">{label}</span>
            <span
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${color}1a`, color }}
            >
                <Icon size={18} />
            </span>
        </div>
        <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
                <div className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white tabular-nums leading-none">
                    {value}
                </div>
                {delta !== undefined && <div className="mt-2"><DeltaBadge value={delta} /></div>}
            </div>
            {spark && spark.length > 1 && (
                <div className="hidden sm:block w-20 lg:w-24 shrink-0 opacity-90"><Sparkline data={spark} color={color} /></div>
            )}
        </div>
    </Card>
);

/* ------------------------------------------------------------------ */
/*  Main area/line chart                                               */
/* ------------------------------------------------------------------ */

const AreaChart: React.FC<{
    series: SeriesPoint[]; metricKey: MetricKey; color: string; unit?: string; granularity: Granularity;
}> = ({ series, metricKey, color, unit, granularity }) => {
    const [hover, setHover] = useState<number | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const uid = React.useId().replace(/:/g, '');

    const values = series.map(p => Number((p as any)[metricKey]) || 0);
    const rawMax = Math.max(...values, 0);
    const yMax = niceCeil(rawMax);
    const n = series.length;

    const yTicks = [1, 0.75, 0.5, 0.25, 0].map(f => Math.round(yMax * f));

    // Points in 0..100 space (x), value mapped to 0..100 (y, inverted).
    const pts = values.map((v, i) => ({
        x: n === 1 ? 50 : (i / (n - 1)) * 100,
        y: 100 - (v / yMax) * 100,
        v,
    }));

    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(' ');
    const areaPath = `${linePath} L 100 100 L 0 100 Z`;

    // sparse x labels (~7 max)
    const step = Math.max(1, Math.ceil(n / 7));
    const showLabel = (i: number) => i === n - 1 || i % step === 0;

    const onMove = (e: React.MouseEvent) => {
        const el = wrapRef.current;
        if (!el || n === 0) return;
        const rect = el.getBoundingClientRect();
        const rel = (e.clientX - rect.left) / rect.width;
        const idx = Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1))));
        setHover(idx);
    };

    const hv = hover !== null ? pts[hover] : null;
    // Flip the tooltip below the point when the point sits high in the plot,
    // so it doesn't spill over the card header/tabs above.
    const tooltipBelow = hv !== null && hv.y < 28;

    return (
        <div className="w-full select-none">
            <div className="flex">
                {/* Y axis labels */}
                <div className="flex flex-col justify-between h-56 sm:h-64 w-11 pr-2 py-0 text-right shrink-0">
                    {yTicks.map((t, i) => (
                        <span key={i} className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums leading-none">
                            {fmtCompact(t)}{unit || ''}
                        </span>
                    ))}
                </div>

                {/* Plot */}
                <div
                    ref={wrapRef}
                    className="relative flex-1 h-56 sm:h-64 cursor-crosshair"
                    onMouseMove={onMove}
                    onMouseLeave={() => setHover(null)}
                >
                    {/* gridlines */}
                    <div className="absolute inset-0 flex flex-col justify-between">
                        {yTicks.map((_, i) => (
                            <div key={i} className="w-full h-px bg-zinc-100 dark:bg-zinc-800/70" />
                        ))}
                    </div>

                    <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id={`area-${uid}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                                <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                            </linearGradient>
                        </defs>
                        <path d={areaPath} fill={`url(#area-${uid})`} />
                        <path
                            d={linePath}
                            fill="none"
                            stroke={color}
                            strokeWidth="2.5"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>

                    {/* crosshair + active dot (HTML overlay, undistorted) */}
                    {hv && (
                        <>
                            <div
                                className="absolute top-0 bottom-0 w-px bg-zinc-300 dark:bg-zinc-600 pointer-events-none"
                                style={{ left: `${hv.x}%` }}
                            />
                            <div
                                className="absolute w-3 h-3 rounded-full pointer-events-none ring-2 ring-white dark:ring-zinc-900"
                                style={{
                                    left: `${hv.x}%`, top: `${hv.y}%`,
                                    transform: 'translate(-50%,-50%)',
                                    backgroundColor: color,
                                }}
                            />
                        </>
                    )}

                    {/* tooltip */}
                    {hover !== null && (
                        <div
                            className={`absolute z-20 pointer-events-none -translate-x-1/2 ${tooltipBelow ? 'translate-y-[35%]' : '-translate-y-[130%]'}`}
                            style={{ left: `${Math.min(88, Math.max(12, pts[hover].x))}%`, top: `${pts[hover].y}%` }}
                        >
                            <div className="bg-zinc-900 dark:bg-zinc-800 text-white rounded-xl px-3 py-2 shadow-xl border border-white/10 whitespace-nowrap">
                                <div className="text-[11px] text-zinc-400 mb-0.5">{tooltipDate(series[hover].iso, granularity)}</div>
                                <div className="text-base font-bold tabular-nums">{fmtFull(pts[hover].v)}{unit || ''}</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* X axis labels */}
            <div className="flex pl-11 mt-2">
                <div className="relative flex-1 h-4">
                    {series.map((p, i) => showLabel(i) && (
                        <span
                            key={i}
                            className="absolute text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums -translate-x-1/2 whitespace-nowrap"
                            style={{ left: `${n === 1 ? 50 : (i / (n - 1)) * 100}%` }}
                        >
                            {p.label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/*  Activity-by-hour bars                                              */
/* ------------------------------------------------------------------ */

const HourBars: React.FC<{ data: { hour: number; label: string; votes: number }[] }> = ({ data }) => {
    const [hover, setHover] = useState<number | null>(null);
    const max = Math.max(...data.map(d => d.votes), 1);
    const peak = data.reduce((a, b) => (b.votes > a.votes ? b : a), data[0]);

    return (
        <div>
            <div className="flex items-end gap-[3px] h-40">
                {data.map((d, i) => {
                    const h = (d.votes / max) * 100;
                    const isPeak = d.hour === peak.hour && d.votes > 0;
                    return (
                        <div
                            key={i}
                            className="flex-1 h-full flex items-end relative group"
                            onMouseEnter={() => setHover(i)}
                            onMouseLeave={() => setHover(null)}
                        >
                            <div
                                className="w-full rounded-t-[3px] transition-all duration-300"
                                style={{
                                    height: `${Math.max(h, 2)}%`,
                                    backgroundColor: isPeak ? '#3b82f6' : (hover === i ? '#60a5fa' : '#3b82f680'),
                                }}
                            />
                            {hover === i && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-20 pointer-events-none">
                                    <div className="bg-zinc-900 dark:bg-zinc-800 text-white rounded-lg px-2 py-1 shadow-xl border border-white/10 whitespace-nowrap text-center">
                                        <div className="text-[10px] text-zinc-400">{d.label}</div>
                                        <div className="text-xs font-bold tabular-nums">{fmtFull(d.votes)}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="flex justify-between mt-2 text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
            </div>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/*  Prediction accuracy donut                                          */
/* ------------------------------------------------------------------ */

const Donut: React.FC<{ prediction: StatsResponse['prediction'] }> = ({ prediction }) => {
    const { correct, incorrect, pending, accuracy } = prediction;
    const total = correct + incorrect + pending;
    const segments = [
        { label: 'Угадано', value: correct, color: '#10b981', Icon: CheckCircle2 },
        { label: 'Не угадано', value: incorrect, color: '#f43f5e', Icon: XCircle },
        { label: 'Ожидание', value: pending, color: '#f59e0b', Icon: HelpCircle },
    ];

    const R = 60, C = 2 * Math.PI * R;
    const gap = total > 1 ? 2 : 0; // small surface gap between arcs
    let offset = 0;

    return (
        <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
                <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
                    <circle cx="80" cy="80" r={R} fill="none" strokeWidth="16"
                        className="stroke-zinc-100 dark:stroke-zinc-800" />
                    {total > 0 && segments.map((s, i) => {
                        const frac = s.value / total;
                        const len = Math.max(0, frac * C - gap);
                        const dash = `${len} ${C - len}`;
                        const el = (
                            <circle
                                key={i} cx="80" cy="80" r={R} fill="none" strokeWidth="16"
                                stroke={s.color} strokeDasharray={dash}
                                strokeDashoffset={-offset} strokeLinecap="butt"
                            />
                        );
                        offset += frac * C;
                        return s.value > 0 ? el : null;
                    })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-zinc-900 dark:text-white tabular-nums">{accuracy}%</span>
                    <span className="text-[11px] text-zinc-500">точность</span>
                </div>
            </div>
            <div className="flex-1 w-full space-y-2.5">
                {segments.map((s, i) => (
                    <div key={i} className="flex items-center gap-3">
                        <s.Icon size={16} style={{ color: s.color }} className="shrink-0" />
                        <span className="text-sm text-zinc-600 dark:text-zinc-300 flex-1">{s.label}</span>
                        <span className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums">{fmtFull(s.value)}</span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums w-10 text-right">
                            {total > 0 ? Math.round((s.value / total) * 100) : 0}%
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export const Statistics: React.FC = () => {
    const [stats, setStats] = useState<StatsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [period, setPeriod] = useState<Period>('30d');
    const [selectedMetric, setSelectedMetric] = useState<MetricKey>('votes');
    const reqId = useRef(0);

    const fetchStats = async (isRefresh = false) => {
        const id = ++reqId.current; // guard against out-of-order responses
        isRefresh ? setRefreshing(true) : setLoading(true);
        setError(null);
        try {
            const res = await fetch(getApiUrl(`/api/admin/statistics?period=${period}`), {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            if (!res.ok) throw new Error('bad status');
            const data: StatsResponse = await res.json();
            if (id !== reqId.current) return; // superseded by a newer request
            setStats(data);
        } catch (err) {
            if (id !== reqId.current) return;
            setError('Не удалось загрузить статистику');
            console.error(err);
        } finally {
            if (id === reqId.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    };

    useEffect(() => { fetchStats(); /* eslint-disable-next-line */ }, [period]);

    const availableMetrics = useMemo(
        () => METRICS.filter(m => !m.needsVisits || stats?.hasVisitSeries),
        [stats?.hasVisitSeries]
    );
    // Derive the effective metric during render: if the current period dropped the
    // selected metric (e.g. switching to 24h while on "visits"), fall back to votes
    // immediately instead of showing a stale/empty frame for one paint.
    const metric: MetricKey = availableMetrics.some(m => m.key === selectedMetric) ? selectedMetric : 'votes';

    if (loading) {
        return (
            <main className="flex-1 min-h-screen flex justify-center items-center">
                <Loader2 className="animate-spin text-blue-500" size={40} />
            </main>
        );
    }

    if (error || !stats) {
        return (
            <main className="flex-1 min-h-screen flex flex-col justify-center items-center gap-4 px-4">
                <p className="text-rose-500">{error || 'Нет данных'}</p>
                <button
                    onClick={() => fetchStats()}
                    className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full font-bold transition-colors"
                >
                    Повторить
                </button>
            </main>
        );
    }

    const m = stats.periodMetrics;
    const activeMetric = availableMetrics.find(x => x.key === metric) || availableMetrics[0];
    const metricTotal = metric === 'engagement'
        ? m.engagementRate
        : stats.series.reduce((s, p) => s + (Number((p as any)[metric]) || 0), 0);

    const spark = (key: keyof SeriesPoint) => stats.series.map(p => Number(p[key]) || 0);
    const roleTotal = stats.roles.admin + stats.roles.creator + stats.roles.user || 1;
    const catMax = Math.max(...stats.categories.map(c => c.votes), 1);

    return (
        <main className="flex-1 min-w-0 min-h-screen text-zinc-900 dark:text-white p-4 lg:p-8">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
                            <span className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                                <Sparkles size={20} />
                            </span>
                            Статистика
                        </h1>
                        <p className="text-zinc-500 text-sm mt-1.5">
                            Обновлено {new Date(stats.generatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Segmented period control */}
                        <div className="inline-flex p-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full">
                            {PERIODS.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setPeriod(p.id)}
                                    className={`px-3 sm:px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${period === p.id
                                        ? 'bg-blue-500 text-white shadow-sm'
                                        : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                                        }`}
                                >
                                    <span className="hidden sm:inline">{p.label}</span>
                                    <span className="sm:hidden">{p.short}</span>
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => fetchStats(true)}
                            className="p-2.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-blue-500 hover:border-blue-300 dark:hover:border-blue-500/40 transition-colors"
                            title="Обновить"
                        >
                            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* KPI cards */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <StatCard label="Посещения" value={fmtCompact(m.visits)} icon={Eye} color="#06b6d4"
                        delta={m.deltas.visits} spark={stats.hasVisitSeries ? spark('visits') : undefined} />
                    <StatCard label="Уник. посетители" value={fmtCompact(m.uniqueVisitors)} icon={Users} color="#0ea5e9"
                        spark={stats.hasVisitSeries ? spark('uniqueVisitors') : undefined} />
                    <StatCard label="Новые пользователи" value={fmtCompact(m.newUsers)} icon={UserPlus} color="#8b5cf6"
                        delta={m.deltas.newUsers} spark={spark('newUsers')} />
                    <StatCard label="Активные" value={fmtCompact(m.activeUsers)} icon={Activity} color="#f59e0b"
                        delta={m.deltas.activeUsers} />
                    <StatCard label="Голоса" value={fmtCompact(m.votes)} icon={Vote} color="#3b82f6"
                        delta={m.deltas.votes} spark={spark('votes')} />
                    <StatCard label="Вовлечённость" value={`${m.engagementRate}%`} icon={Target} color="#10b981" />
                </div>

                {/* Main chart */}
                <Card className="p-5 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: activeMetric.color }} />
                                <span className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-white">
                                    {fmtFull(metricTotal)}{activeMetric.unit || ''}
                                </span>
                                <span className="text-sm text-zinc-500 dark:text-zinc-400">{activeMetric.label.toLowerCase()}</span>
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                {metric === 'engagement' ? 'средняя за период' : 'всего за период'}
                            </p>
                        </div>
                        {/* Metric tabs */}
                        <div className="flex flex-wrap gap-1.5">
                            {availableMetrics.map(mt => (
                                <button
                                    key={mt.key}
                                    onClick={() => setSelectedMetric(mt.key)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${metric === mt.key
                                        ? 'text-white border-transparent'
                                        : 'text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                                        }`}
                                    style={metric === mt.key ? { backgroundColor: mt.color } : undefined}
                                >
                                    {mt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <AreaChart
                        series={stats.series}
                        metricKey={metric}
                        color={activeMetric.color}
                        unit={activeMetric.unit}
                        granularity={stats.granularity}
                    />
                </Card>

                {/* Activity + Prediction */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="p-5 sm:p-6">
                        <div className="flex items-center gap-2 mb-1">
                            <Clock size={18} className="text-blue-500" />
                            <h3 className="text-lg font-bold">Активность по часам</h3>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">голоса за последние 30 дней по времени суток</p>
                        <HourBars data={stats.activityByHour} />
                    </Card>

                    <Card className="p-5 sm:p-6">
                        <div className="flex items-center gap-2 mb-1">
                            <Target size={18} className="text-emerald-500" />
                            <h3 className="text-lg font-bold">Точность прогнозов</h3>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">результаты голосований по завершённым опросам</p>
                        <Donut prediction={stats.prediction} />
                    </Card>
                </div>

                {/* Categories + Roles */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="p-5 sm:p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <Newspaper size={18} className="text-blue-500" />
                            <h3 className="text-lg font-bold">Категории</h3>
                        </div>
                        {stats.categories.length ? (
                            <div className="space-y-3.5">
                                {stats.categories.map((c, i) => (
                                    <div key={i}>
                                        <div className="flex items-center justify-between mb-1.5 text-sm">
                                            <span className="text-zinc-700 dark:text-zinc-300 font-medium">{catLabel(c.category)}</span>
                                            <span className="text-zinc-600 dark:text-zinc-300 tabular-nums">
                                                {fmtFull(c.votes)} <span className="text-zinc-500 dark:text-zinc-400">· {c.polls}&nbsp;опр.</span>
                                            </span>
                                        </div>
                                        <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                                            <div className="h-full rounded-full bg-blue-500 transition-all duration-500"
                                                style={{ width: `${Math.max(2, (c.votes / catMax) * 100)}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="text-zinc-500 text-sm">Нет данных</p>}
                    </Card>

                    <Card className="p-5 sm:p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <Shield size={18} className="text-violet-500" />
                            <h3 className="text-lg font-bold">Пользователи</h3>
                        </div>
                        {/* stacked composition bar */}
                        <div className="flex h-3 rounded-full overflow-hidden mb-5 gap-[2px]">
                            <div style={{ width: `${(stats.roles.user / roleTotal) * 100}%`, backgroundColor: '#3b82f6' }} />
                            <div style={{ width: `${(stats.roles.creator / roleTotal) * 100}%`, backgroundColor: '#8b5cf6' }} />
                            <div style={{ width: `${(stats.roles.admin / roleTotal) * 100}%`, backgroundColor: '#f59e0b' }} />
                        </div>
                        <div className="space-y-3">
                            {[
                                { label: 'Пользователи', value: stats.roles.user, color: '#3b82f6' },
                                { label: 'Авторы', value: stats.roles.creator, color: '#8b5cf6' },
                                { label: 'Администраторы', value: stats.roles.admin, color: '#f59e0b' },
                            ].map((r, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                                    <span className="text-sm text-zinc-600 dark:text-zinc-300 flex-1">{r.label}</span>
                                    <span className="text-sm font-bold tabular-nums">{fmtFull(r.value)}</span>
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-3 gap-3 mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800">
                            <MiniStat label="Всего" value={stats.totals.users} />
                            <MiniStat label="Новости" value={stats.totals.news} />
                            <MiniStat label="Опросы" value={stats.totals.polls} />
                        </div>
                    </Card>
                </div>

                {/* Top polls + Top users */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="p-5 sm:p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <Vote size={18} className="text-blue-500" />
                            <h3 className="text-lg font-bold">Популярные опросы</h3>
                        </div>
                        {stats.topPolls.length ? (
                            <div className="space-y-2.5">
                                {stats.topPolls.map((p, i) => (
                                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 transition-colors">
                                        <span className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg bg-blue-500/10 text-blue-500 font-bold text-sm">{i + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm truncate" title={p.question}>{p.question || 'Без названия'}</p>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{fmtFull(p.votes)} голосов · {catLabel(p.category)}</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0 ${p.active
                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                            : 'bg-zinc-200 dark:bg-zinc-700/50 text-zinc-500'}`}>
                                            {p.active ? 'Активен' : 'Завершён'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="text-zinc-500 text-sm">Нет данных</p>}
                    </Card>

                    <Card className="p-5 sm:p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <Trophy size={18} className="text-amber-500" />
                            <h3 className="text-lg font-bold">Лидеры</h3>
                        </div>
                        {stats.topUsers.length ? (
                            <div className="space-y-2.5">
                                {stats.topUsers.map((u, i) => (
                                    <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                                        <span className={`w-6 text-center font-bold text-sm shrink-0 ${i === 0 ? 'text-amber-500' : i === 2 ? 'text-orange-400' : 'text-zinc-500 dark:text-zinc-400'}`}>{i + 1}</span>
                                        {u.avatar
                                            ? <img src={u.avatar} alt="" className="w-9 h-9 rounded-full object-cover bg-zinc-200 dark:bg-zinc-700 shrink-0" />
                                            : <span className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-sm font-bold shrink-0">{(u.name || u.username || '?').charAt(0).toUpperCase()}</span>}
                                        <span className="flex-1 min-w-0 font-medium text-sm truncate">{u.name || u.username}</span>
                                        <span className="text-sm font-bold text-blue-500 tabular-nums shrink-0">{fmtFull(u.points)}</span>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="text-zinc-500 text-sm">Нет данных</p>}
                    </Card>
                </div>

            </div>
        </main>
    );
};

const MiniStat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
    <div className="text-center">
        <div className="text-xl font-bold tabular-nums">{fmtCompact(value)}</div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{label}</div>
    </div>
);
