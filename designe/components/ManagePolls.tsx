import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useDialog } from '../context/DialogContext';
import { getApiUrl } from '../config';
import { CheckCircle2, Clock, Loader2, ListChecks, CheckCheck } from 'lucide-react';

interface PendingOption {
    id: number;
    text: string;
    vote_count: number;
}

interface PendingPoll {
    id: number;
    question: string;
    news_id: number;
    news_title: string;
    news_image: string;
    news_category: string;
    ends_at: string | null;
    total_votes: number;
    options: PendingOption[];
}

// YYYY-MM-DD -> DD.MM.YYYY (falls back to the raw value).
const formatDate = (value: string): string => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
};

// A poll whose voting deadline has already passed but which still has no answer.
const isOverdue = (endsAt: string | null): boolean => {
    if (!endsAt) return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endsAt);
    if (!match) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return end < today;
};

export const ManagePolls: React.FC = () => {
    const { user } = useAuth();
    const { t } = useLanguage();
    const { showAlert, showConfirm } = useDialog();
    const [polls, setPolls] = useState<PendingPoll[]>([]);
    const [loading, setLoading] = useState(true);
    const [resolvingId, setResolvingId] = useState<number | null>(null);

    const canManage = !!user && (user.role === 'admin' || user.role === 'creator');

    const fetchPending = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(getApiUrl('/api/polls/pending'), {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            });
            if (res.ok) {
                const data = await res.json();
                setPolls(Array.isArray(data) ? data : []);
            } else {
                setPolls([]);
            }
        } catch (e) {
            console.error(e);
            setPolls([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (canManage) fetchPending();
        else setLoading(false);
    }, [canManage, fetchPending]);

    const handleResolve = async (poll: PendingPoll, option: PendingOption) => {
        const confirmed = await showConfirm(
            `Отметить вариант «${option.text}» верным и завершить опрос? Это действие нельзя отменить.`
        );
        if (!confirmed) return;

        setResolvingId(poll.id);
        try {
            const res = await fetch(getApiUrl(`/api/polls/${poll.id}/resolve`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ correctOptionId: option.id }),
            });

            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                showAlert(`Опрос завершён. Начислено ${data.pointsAwarded ?? 0} баллов победителям (${data.winners ?? 0}).`);
                setPolls((prev) => prev.filter((p) => p.id !== poll.id));
            } else {
                const err = await res.json().catch(() => ({}));
                showAlert(err.message || 'Не удалось завершить опрос.');
            }
        } catch (e) {
            console.error(e);
            showAlert('Ошибка сети. Попробуйте ещё раз.');
        } finally {
            setResolvingId(null);
        }
    };

    if (!canManage) {
        return <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">{t.admin.accessDenied}</div>;
    }

    return (
        <div className="bg-white dark:bg-[#121212] rounded-2xl lg:rounded-[32px] p-4 lg:p-8 border border-zinc-200 dark:border-zinc-800 w-full">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 dark:bg-blue-500/10 rounded-xl">
                    <ListChecks className="text-blue-600 dark:text-blue-400 w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold dark:text-white">{t.managePolls.title}</h2>
                {!loading && polls.length > 0 && (
                    <span className="ml-auto text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-3 py-1 rounded-full">
                        {polls.length}
                    </span>
                )}
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">{t.managePolls.subtitle}</p>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    <p>{t.managePolls.loading}</p>
                </div>
            ) : polls.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-500 dark:text-zinc-400 gap-3">
                    <div className="p-4 bg-green-50 dark:bg-green-500/10 rounded-full">
                        <CheckCheck className="w-8 h-8 text-green-500" />
                    </div>
                    <p className="font-medium">{t.managePolls.empty}</p>
                </div>
            ) : (
                <div className="space-y-5">
                    {polls.map((poll) => {
                        const overdue = isOverdue(poll.ends_at);
                        const busy = resolvingId === poll.id;
                        return (
                            <div
                                key={poll.id}
                                className={`rounded-[24px] border p-4 lg:p-5 transition-colors ${overdue
                                    ? 'border-red-200 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/5'
                                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40'
                                    }`}
                            >
                                {poll.news_title && (
                                    <div className="text-xs text-zinc-400 dark:text-zinc-500 mb-1 truncate">{poll.news_title}</div>
                                )}
                                <h3 className="font-semibold text-zinc-900 dark:text-white text-[15px] mb-3 leading-snug">
                                    {poll.question}
                                </h3>

                                <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                                    <span className="flex items-center gap-1.5">
                                        <Clock size={13} />
                                        {poll.ends_at ? (
                                            <span className={overdue ? 'text-red-500 font-semibold' : ''}>
                                                {overdue ? 'Срок вышел: ' : 'До '}{formatDate(poll.ends_at)}
                                            </span>
                                        ) : (
                                            <span>Без срока</span>
                                        )}
                                    </span>
                                    <span>{poll.total_votes} {t.managePolls.votes}</span>
                                </div>

                                <div className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">{t.managePolls.pickCorrect}</div>
                                <div className="space-y-2">
                                    {poll.options.map((option) => {
                                        const percent = poll.total_votes > 0
                                            ? Math.round((option.vote_count / poll.total_votes) * 100)
                                            : 0;
                                        return (
                                            <button
                                                key={option.id}
                                                disabled={busy}
                                                onClick={() => handleResolve(poll, option)}
                                                className="group relative w-full flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/60 px-3 py-2.5 text-left hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                                            >
                                                <div
                                                    className="absolute inset-0 bg-blue-100/40 dark:bg-blue-900/20 origin-left"
                                                    style={{ transform: `scaleX(${percent / 100})` }}
                                                />
                                                <CheckCircle2 size={18} className="relative z-10 shrink-0 text-zinc-300 dark:text-zinc-600 group-hover:text-green-500 transition-colors" />
                                                <span className="relative z-10 flex-1 text-sm text-zinc-800 dark:text-zinc-100 truncate">{option.text}</span>
                                                <span className="relative z-10 shrink-0 text-xs font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums">
                                                    {option.vote_count} · {percent}%
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {busy && (
                                    <div className="flex items-center gap-2 text-xs text-zinc-500 mt-3">
                                        <Loader2 size={14} className="animate-spin" /> {t.managePolls.resolving}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
