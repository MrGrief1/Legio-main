import React, { useState, useEffect } from 'react';
import { BarChart3, Loader2, Users, FileText, Activity, ChevronDown, ArrowUpRight, Calendar } from 'lucide-react';
import { getApiUrl } from '../config';

interface Statistics {
    totalUsers: number;
    totalPolls: number;
    totalVotes: number;
    uniqueVoters: number;
    totalNews: number;
    resolvedPolls: number;
    totalLikes: number;
    pendingReports: number;
    votesHistory: { date: string; count: number }[];
    usersHistory: { date: string; count: number }[];
    pollsHistory: { date: string; count: number }[];
    visitsHistory: { date: string; count: number }[];
    engagementHistory: { date: string; count: number }[];
    activityByHour: { hour: string; count: number }[];
    topPolls: { id: number; question: string; votes: number; active: boolean }[];
    activeUsers: number;
    engagementRate: number;
    newUsers: number;
    periodVotes: number;
    periodVisits: number;
}

type TabType = 'overview' | 'polls' | 'users' | 'votes' | 'visits';
type TimePeriod = '28d' | '7d' | '24h';

const TABS = [
    { id: 'overview', label: 'Обзор' },
    { id: 'polls', label: 'Опросы' },
    { id: 'users', label: 'Аудитория' },
    { id: 'votes', label: 'Вовлеченность' },
    { id: 'visits', label: 'Посещения' },
];

const PERIODS = {
    '28d': 'За 28 дней',
    '7d': 'За 7 дней',
    '24h': 'За 24 часа'
};

export const Statistics: React.FC = () => {
    const [stats, setStats] = useState<Statistics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [period, setPeriod] = useState<TimePeriod>('28d');
    const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    const fetchStatistics = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(getApiUrl(`/api/admin/statistics?period=${period}`), {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!res.ok) throw new Error('Failed to fetch statistics');

            const data = await res.json();
            setStats(data);
        } catch (err) {
            setError('Не удалось загрузить статистику');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatistics();
    }, [period]);

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[50vh]">
                <Loader2 className="animate-spin text-blue-500" size={40} />
            </div>
        );
    }

    if (error || !stats) {
        return (
            <div className="flex flex-col justify-center items-center min-h-[50vh] gap-4">
                <p className="text-red-500">{error}</p>
                <button
                    onClick={fetchStatistics}
                    className="px-6 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors font-bold"
                >
                    Повторить
                </button>
            </div>
        );
    }

    // Prepare data for the main chart based on active tab
    const getChartData = () => {
        let rawData: { date: string; count: number }[] = [];

        switch (activeTab) {
            case 'polls':
                rawData = stats.pollsHistory;
                break;
            case 'users':
                rawData = stats.usersHistory;
                break;
            case 'votes': // Engagement Tab
                rawData = stats.engagementHistory || stats.votesHistory;
                break;
            case 'visits':
                rawData = stats.visitsHistory || [];
                break;
            case 'overview':
            default:
                rawData = stats.votesHistory;
        }

        // Backend can return rows with null/empty date; guard all string operations.
        const normalizedRawData = (rawData || []).map((item) => ({
            date: String(item?.date || ''),
            count: Number(item?.count || 0),
        }));

        // Fill in missing dates/hours
        const filledData: { date: string; count: number }[] = [];
        const now = new Date();

        if (period === '24h') {
            // Last 24 hours
            for (let i = 23; i >= 0; i--) {
                const d = new Date(now.getTime() - i * 60 * 60 * 1000);
                const hourStr = `${d.getHours().toString().padStart(2, '0')}:00`;
                const found = normalizedRawData.find(item => item.date.includes(hourStr) || item.date === hourStr); // Adjust matching logic as needed
                // Backend likely returns "HH:00" or full date. Let's assume backend returns "YYYY-MM-DD HH:00" or just "HH:00" for 24h
                // Based on previous code: d.date.split(':')[0] implies HH:MM format or similar.
                // Let's rely on the backend format. If backend returns "YYYY-MM-DD", this logic needs to match.
                // Assuming backend returns "YYYY-MM-DD" for days and "HH:00" for hours?
                // Actually, let's look at the existing data usage: d.date.split(':')[0] for 24h.
                // So for 24h, we expect "HH:MM" or "HH:00".

                // Simple fill logic:
                // If we can't perfectly match, we might just return rawData if it's populated, but here it's likely sparse.
                // Let's try to match by hour if possible.
                const match = normalizedRawData.find(r => r.date.startsWith(d.getHours().toString().padStart(2, '0')));
                filledData.push({
                    date: hourStr,
                    count: match ? match.count : 0
                });
            }
        } else {
            // Days (7d or 28d)
            const days = period === '7d' ? 7 : 28;
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                const month = (d.getMonth() + 1).toString().padStart(2, '0');
                const day = d.getDate().toString().padStart(2, '0');
                const dateStr = `${month}-${day}`; // MM-DD format matching the chart label logic: d.date.slice(5) -> MM-DD if YYYY-MM-DD

                // We need to match against rawData which is likely YYYY-MM-DD
                // rawData item.date likely "YYYY-MM-DD"
                const fullDateStr = `${d.getFullYear()}-${month}-${day}`;

                const match = normalizedRawData.find(r => r.date === fullDateStr || r.date.endsWith(dateStr));
                filledData.push({
                    date: fullDateStr,
                    count: match ? match.count : 0
                });
            }
        }

        // If rawData has data but our fill logic missed it (due to format mismatch), fallback to rawData?
        // But the user issue is "one column", implying rawData IS just one entry.
        // So we MUST return filledData.

        return filledData;
    };

    const chartData = getChartData();
    const maxValue = Math.max(...chartData.map(d => d.count), 1);
    const isPercentage = activeTab === 'votes'; // Engagement tab is now percentage

    const summaryCards = [
        { title: 'Посещения', value: stats.periodVisits ?? 0, change: 'За период', icon: Users },
        { title: 'Новые пользователи', value: stats.newUsers ?? 0, change: 'За период', icon: Users },
        { title: 'Активные пользователи', value: stats.activeUsers ?? 0, change: 'За период', icon: Users },
        { title: 'Вовлеченность', value: `${stats.engagementRate ?? 0}%`, change: 'Активность', icon: Activity },
    ];

    return (
        <main className="flex-1 min-w-0 min-h-screen text-zinc-900 dark:text-white font-sans p-4 lg:p-6">
            <div className="max-w-7xl mx-auto">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Статистика</h1>
                        <p className="text-zinc-500 text-sm mt-1">@{localStorage.getItem('username') || 'user'}</p>
                    </div>

                    <div className="relative">
                        <button
                            onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
                            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white rounded-full transition-all text-sm font-medium shadow-sm"
                        >
                            <Calendar size={16} className="text-zinc-400" />
                            <span>{PERIODS[period]}</span>
                            <ChevronDown size={16} className={`text-zinc-400 transition-transform ${showPeriodDropdown ? 'rotate-180' : ''}`} />
                        </button>

                        {showPeriodDropdown && (
                            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-xl z-50">
                                {(Object.keys(PERIODS) as TimePeriod[]).map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => {
                                            setPeriod(p);
                                            setShowPeriodDropdown(false);
                                        }}
                                        className={`w-full px-4 py-3 text-sm text-left transition-colors ${period === p
                                            ? 'bg-zinc-50 dark:bg-zinc-800 text-blue-500'
                                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                                            }`}
                                    >
                                        {PERIODS[p]}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {summaryCards.map((card, index) => (
                        <div key={index} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer group shadow-sm">
                            <div className="flex items-start justify-between mb-2">
                                <span className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">{card.title}</span>
                                <card.icon size={18} className="text-zinc-400 dark:text-zinc-500 group-hover:text-blue-500 transition-colors" />
                            </div>
                            <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-2xl font-bold text-zinc-900 dark:text-white">{card.value}</span>
                                <span className="text-xs font-medium text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                    <ArrowUpRight size={10} />
                                    {card.change}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

                    {/* Left Column: Main Chart */}
                    <div className="lg:col-span-4 space-y-6">
                        {/* Tabs */}
                        <div className="border-b border-zinc-200 dark:border-zinc-800 flex gap-8 overflow-x-auto">
                            {TABS.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as TabType)}
                                    className={`pb-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id
                                        ? 'border-blue-500 text-blue-500'
                                        : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Chart Area */}
                        <div className="bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl flex flex-col">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                                    {activeTab === 'overview' ? 'Уровень вовлеченности' : TABS.find(t => t.id === activeTab)?.label}
                                </h3>
                                <div className="flex gap-2 items-center">
                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                    <span className="text-xs text-zinc-500">Текущий период</span>
                                </div>
                            </div>

                            {/* Custom SVG Chart */}
                            <div className="flex-1 w-full relative h-[250px]">
                                <svg className="w-full h-full overflow-visible">
                                    <defs>
                                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
                                            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.3" />
                                        </linearGradient>
                                    </defs>
                                    {/* Grid Lines */}
                                    {[0, 25, 50, 75, 100].map((tick) => (
                                        <line
                                            key={tick}
                                            x1="0"
                                            y1={`${100 - tick}%`}
                                            x2="100%"
                                            y2={`${100 - tick}%`}
                                            stroke="currentColor"
                                            className="text-zinc-200 dark:text-zinc-800"
                                            strokeWidth="1"
                                            strokeDasharray="4 4"
                                        />
                                    ))}

                                    {/* Bars and Labels */}
                                    <g>
                                        {chartData.map((d, i) => {
                                            const barHeight = (d.count / maxValue) * 100;
                                            const barWidth = 100 / chartData.length;
                                            const x = i * barWidth;
                                            const y = 100 - barHeight;

                                            return (
                                                <g key={i}>
                                                    <rect
                                                        x={`${x + (barWidth * 0.1)}%`}
                                                        y={`${y}%`}
                                                        width={`${barWidth * 0.8}%`}
                                                        height={`${Math.max(barHeight, 2)}%`}
                                                        fill={hoveredIndex === i ? '#60a5fa' : 'url(#barGradient)'}
                                                        rx="4"
                                                        className="transition-all duration-200 cursor-pointer"
                                                        onMouseEnter={() => setHoveredIndex(i)}
                                                        onMouseLeave={() => setHoveredIndex(null)}
                                                    />
                                                    {/* Label under bar */}
                                                    <text
                                                        x={`${x + (barWidth / 2)}%`}
                                                        y="100%"
                                                        dy="20"
                                                        textAnchor="middle"
                                                        fill="currentColor"
                                                        fontSize="10"
                                                        className="text-zinc-500 pointer-events-none"
                                                    >
                                                        {period === '24h' ? d.date.split(':')[0] : d.date.slice(5)}
                                                    </text>
                                                </g>
                                            );
                                        })}
                                    </g>
                                </svg>

                                {/* Tooltip Overlay */}
                                {hoveredIndex !== null && chartData[hoveredIndex] && (
                                    <div
                                        className="absolute top-0 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-2 rounded-lg shadow-xl pointer-events-none z-10"
                                        style={{ left: `${(hoveredIndex / chartData.length) * 100}%`, transform: 'translateX(-50%) translateY(-120%)' }}
                                    >
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{chartData[hoveredIndex].date}</p>
                                        <p className="text-lg font-bold text-zinc-900 dark:text-white">
                                            {chartData[hoveredIndex].count}{isPercentage ? '%' : ''}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                </div>

                {/* Top Polls Section */}
                <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-3 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-sm">
                        <h3 className="text-xl font-bold mb-4 text-zinc-900 dark:text-white">Популярные опросы</h3>
                        <div className="space-y-4">
                            {stats.topPolls && stats.topPolls.length > 0 ? (
                                stats.topPolls.map((poll, i) => (
                                    <div key={poll.id} className="flex items-center gap-4 p-4 bg-zinc-50 dark:bg-zinc-800/30 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors">
                                        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-blue-500/10 text-blue-500 font-bold rounded-lg">
                                            {i + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-zinc-900 dark:text-white truncate" title={poll.question}>
                                                {poll.question}
                                            </p>
                                            <p className="text-sm text-zinc-500">{poll.votes} голосов</p>
                                        </div>
                                        <div className={`px-2 py-1 rounded text-xs font-medium ${poll.active ? 'bg-green-500/10 text-green-500' : 'bg-zinc-200 dark:bg-zinc-700/50 text-zinc-600 dark:text-zinc-400'}`}>
                                            {poll.active ? 'Активен' : 'Завершен'}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-zinc-500">Нет данных</p>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </main>
    );
};
