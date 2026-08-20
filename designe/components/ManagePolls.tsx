import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useDialog } from '../context/DialogContext';
import { getApiUrl } from '../config';
import { NewsItem, PollAuthor } from '../types';
import { Select, SelectOption } from './Select';
import { NewsModal } from './NewsModal';
import { Poll } from './FeedComponents';
import { formatDateOnly, formatDateTime } from '../utils/date';
import {
    AlertTriangle,
    ArrowDownWideNarrow,
    ArrowUpNarrowWide,
    CheckCheck,
    CheckCircle2,
    ChevronDown,
    Clock,
    ExternalLink,
    Link as LinkIcon,
    ListChecks,
    Loader2,
    Pencil,
    Rows2,
    Rows3,
    Search,
    Send,
    SlidersHorizontal,
    Trash2,
    User as UserIcon,
    X,
} from 'lucide-react';

// Наборы, между которыми переключается страница. Совпадают со `status` у /api/polls/manage.
type ManageStatus = 'overdue' | 'active' | 'resolved' | 'drafts';
type ManageSort = 'deadline' | 'created' | 'resolved' | 'title' | 'author' | 'votes';
type Density = 'compact' | 'expanded';

interface ManageOption {
    id: number;
    text: string;
    vote_count: number;
}

interface ManagePoll {
    id: number;
    question: string;
    news_id: number;
    news_title: string;
    news_image: string;
    news_category: string;
    created_at: string | null;
    ends_at: string | null;
    is_resolved: number;
    correct_option_id: number | null;
    resolved_at: string | null;
    author: PollAuthor | null;
    resolved_by: PollAuthor | null;
    total_votes: number;
    options: ManageOption[];
}

interface ManageCounts {
    overdue: number;
    active: number;
    pending: number;
    resolved: number;
    all: number;
}

// Черновик может ещё не иметь опроса вовсе, поэтому у него своя, более простая строка.
interface DraftRow {
    id: number;
    title: string;
    image: string;
    category: string;
    status: 'draft' | 'scheduled';
    publish_at: string | null;
    created_at: string | null;
    author: PollAuthor | null;
    poll: { id: number; question: string; ends_at: string | null; options_count: number } | null;
}

interface AuthorRow {
    id: number;
    username: string;
    name: string;
    role: string;
    pendingCount: number;
    totalCount: number;
}

const PAGE_SIZE = 30;

// Плотность списка и последняя открытая вкладка запоминаются: админ возвращается сюда десятки раз
// за день, и каждый раз заново выставлять «сжато» — та же лишняя работа, на которую он жалуется.
const DENSITY_KEY = 'managePolls.density';
const STATUS_KEY = 'managePolls.status';

const MANAGE_TABS = ['overdue', 'active', 'resolved', 'drafts'] as const;

const readStored = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    if (typeof window === 'undefined') return fallback;
    const stored = window.localStorage.getItem(key);
    return allowed.includes(stored as T) ? (stored as T) : fallback;
};

// YYYY-MM-DD -> DD.MM.YYYY (срок голосования хранится именно в таком виде).
const formatDeadline = (value: string | null): string => {
    if (!value) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
};

const isOverdue = (endsAt: string | null): boolean => {
    if (!endsAt) return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endsAt);
    if (!match) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) < today;
};

const fillTemplate = (template: string, values: Record<string, string | number>): string =>
    template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));

// «1 голосов» — то, что видно в списке чаще всего, поэтому числительное согласуется по-русски.
// Правило общее для славянских форм: 1 — одна форма, 2–4 — вторая, остальное — третья.
const pluralizeVotes = (count: number, one: string, few: string, many: string): string => {
    const mod100 = Math.abs(count) % 100;
    const mod10 = mod100 % 10;
    if (mod100 >= 11 && mod100 <= 14) return many;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;
    return many;
};

// У каждой вкладки свой осмысленный порядок: у незавершённых — ближайший срок сверху,
// у завершённых — свежие завершения сверху.
const defaultSortFor = (status: ManageStatus): ManageSort => (status === 'resolved' ? 'resolved' : 'deadline');
const defaultOrderFor = (status: ManageStatus): 'asc' | 'desc' => (status === 'resolved' ? 'desc' : 'asc');

// Полоска с долей голосов за вариант. Вынесена, чтобы разметка строки опроса не разрасталась.
const OptionBar: React.FC<{
    option: ManageOption;
    totalVotes: number;
    isCorrect: boolean;
    onPick?: () => void;
    disabled?: boolean;
}> = ({ option, totalVotes, isCorrect, onPick, disabled }) => {
    const percent = totalVotes > 0 ? Math.round((option.vote_count / totalVotes) * 100) : 0;
    const interactive = !!onPick;

    const content = (
        <>
            <div
                className={`absolute inset-0 origin-left transition-transform duration-500 ${isCorrect ? 'bg-green-500/15' : 'bg-blue-100/50 dark:bg-blue-900/25'
                    }`}
                style={{ transform: `scaleX(${percent / 100})` }}
            />
            <CheckCircle2
                size={17}
                className={`relative z-10 shrink-0 transition-colors ${isCorrect
                    ? 'text-green-500'
                    : interactive
                        ? 'text-zinc-300 dark:text-zinc-600 group-hover:text-green-500'
                        : 'text-zinc-300 dark:text-zinc-700'
                    }`}
            />
            <span className={`relative z-10 flex-1 text-sm text-left ${isCorrect ? 'font-semibold text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-200'}`}>
                {option.text}
            </span>
            <span className="relative z-10 shrink-0 text-xs font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums">
                {option.vote_count} · {percent}%
            </span>
        </>
    );

    const shared = `group relative w-full flex items-start gap-3 rounded-xl border px-3 py-2.5 overflow-hidden transition-colors ${isCorrect
        ? 'border-green-500/40 bg-green-50/60 dark:bg-green-500/5'
        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50'
        }`;

    if (!interactive) {
        return <div className={shared}>{content}</div>;
    }

    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onPick}
            className={`${shared} text-left hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-500/10 disabled:opacity-50 disabled:cursor-not-allowed`}
        >
            {content}
        </button>
    );
};

interface ManagePollsProps {
    // Правка открывается в мастере создания — страница только сообщает, что именно правим.
    onEditNews?: (newsId: number) => void;
}

export const ManagePolls: React.FC<ManagePollsProps> = ({ onEditNews }) => {
    const { user } = useAuth();
    const { t } = useLanguage();
    const { showAlert, showConfirm } = useDialog();

    const canManage = !!user && (user.role === 'admin' || user.role === 'creator');
    // Создатель ведёт всю редакцию, поэтому по умолчанию видит опросы всех авторов; админ приходит
    // сюда за своими. Это только значение фильтра по умолчанию, а не запрет: подменить админа,
    // который в отпуске, всё равно должно быть можно одним кликом.
    const defaultAuthor = user?.role === 'admin' ? 'me' : 'all';

    const [status, setStatus] = useState<ManageStatus>(() => readStored(STATUS_KEY, MANAGE_TABS, 'overdue'));
    const [density, setDensity] = useState<Density>(() => readStored(DENSITY_KEY, ['compact', 'expanded'] as const, 'compact'));
    // Сортировка по умолчанию зависит от вкладки, а вкладка восстанавливается из localStorage:
    // если взять здесь фиксированный «по сроку», админ, ушедший с «Завершённых», вернётся в них
    // отсортированными по сроку голосования вместо даты завершения — и не поймёт, почему порядок
    // не тот, что был.
    const [sort, setSort] = useState<ManageSort>(() => defaultSortFor(status));
    const [order, setOrder] = useState<'asc' | 'desc'>(() => defaultOrderFor(status));
    const [authorFilter, setAuthorFilter] = useState<string>(defaultAuthor);

    const [search, setSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');

    const [polls, setPolls] = useState<ManagePoll[]>([]);
    const [drafts, setDrafts] = useState<DraftRow[]>([]);
    const [draftCounts, setDraftCounts] = useState({ draft: 0, scheduled: 0 });
    const [busyDraftId, setBusyDraftId] = useState<number | null>(null);
    const [counts, setCounts] = useState<ManageCounts>({ overdue: 0, active: 0, pending: 0, resolved: 0, all: 0 });
    const [authors, setAuthors] = useState<AuthorRow[]>([]);
    const [withoutAuthorCount, setWithoutAuthorCount] = useState(0);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);

    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [resolvingId, setResolvingId] = useState<number | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

    // Опрос, открытый «как его видит пользователь»: та же карточка новости и тот же опрос, что в
    // ленте, — чтобы не приходилось искать его во вкладке «Незавершённые опросы» по названию.
    const [openNews, setOpenNews] = useState<NewsItem | null>(null);
    const [openingId, setOpeningId] = useState<number | null>(null);

    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        window.localStorage.setItem(DENSITY_KEY, density);
    }, [density]);

    useEffect(() => {
        window.localStorage.setItem(STATUS_KEY, status);
    }, [status]);

    // Сортировка по умолчанию своя у каждой вкладки: у просроченных смысл в сроке, у завершённых —
    // в дате завершения. Переключение вкладки сбрасывает и порядок, иначе «по возрастанию даты
    // завершения» переносится на список, где этой даты вовсе нет.
    const selectStatus = (next: ManageStatus) => {
        setStatus(next);
        setExpandedIds(new Set());
        setSort(defaultSortFor(next));
        setOrder(defaultOrderFor(next));
    };

    useEffect(() => {
        if (search === appliedSearch) return;
        if (search === '') {
            setAppliedSearch('');
            return;
        }
        const timer = setTimeout(() => setAppliedSearch(search), 350);
        return () => clearTimeout(timer);
    }, [search, appliedSearch]);

    const buildUrl = useCallback((pageToLoad: number) => {
        const params = new URLSearchParams({
            status,
            sort,
            order,
            page: String(pageToLoad),
            limit: String(PAGE_SIZE),
        });
        if (appliedSearch) params.set('search', appliedSearch);
        if (authorFilter && authorFilter !== 'all') params.set('author', authorFilter);
        return getApiUrl(`/api/polls/manage?${params.toString()}`);
    }, [status, sort, order, appliedSearch, authorFilter]);

    const buildDraftsUrl = useCallback((pageToLoad: number) => {
        const params = new URLSearchParams({ page: String(pageToLoad), limit: String(PAGE_SIZE) });
        if (appliedSearch) params.set('search', appliedSearch);
        return getApiUrl(`/api/news/drafts?${params.toString()}`);
    }, [appliedSearch]);

    const fetchPage = useCallback(async (pageToLoad: number, mode: 'replace' | 'append') => {
        const isDrafts = status === 'drafts';
        const res = await fetch(isDrafts ? buildDraftsUrl(pageToLoad) : buildUrl(pageToLoad), {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (!res.ok) throw new Error('Failed to load polls');
        const data = await res.json();

        if (isDrafts) {
            const items: DraftRow[] = Array.isArray(data.items) ? data.items : [];
            setDrafts((prev) => (mode === 'replace' ? items : [...prev, ...items]));
            setDraftCounts(data.counts || { draft: 0, scheduled: 0 });
        } else {
            const items: ManagePoll[] = Array.isArray(data.items) ? data.items : [];
            setPolls((prev) => (mode === 'replace' ? items : [...prev, ...items]));
            setCounts(data.counts || { overdue: 0, active: 0, pending: 0, resolved: 0, all: 0 });
        }

        setTotal(Number(data.total) || 0);
        setHasMore(!!data.hasMore);
        setPage(pageToLoad);
    }, [buildUrl, buildDraftsUrl, status]);

    useEffect(() => {
        if (!canManage) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        fetchPage(1, 'replace')
            .catch((error) => {
                console.error(error);
                if (!cancelled) {
                    setPolls([]);
                    setTotal(0);
                    setHasMore(false);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [canManage, fetchPage]);

    // Список авторов нужен один раз на сессию — он меняется только когда кто-то создаёт опрос.
    const loadAuthors = useCallback(() => {
        if (!canManage) return;
        fetch(getApiUrl('/api/polls/manage/authors'), {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!data) return;
                setAuthors(Array.isArray(data.authors) ? data.authors : []);
                setWithoutAuthorCount(Number(data.withoutAuthor?.totalCount) || 0);
            })
            .catch((error) => console.error(error));
    }, [canManage]);

    useEffect(() => {
        loadAuthors();
    }, [loadAuthors]);

    // Цифры на вкладках должны быть верными независимо от того, какая вкладка открыта: находясь
    // в «Черновиках», админ всё равно должен видеть, сколько опросов ждёт завершения, и наоборот.
    // Поэтому оба счётчика подтягиваются отдельными лёгкими запросами.
    const loadBadgeCounts = useCallback(() => {
        if (!canManage) return;
        const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

        fetch(getApiUrl('/api/news/drafts?limit=1'), { headers })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => { if (data?.counts) setDraftCounts(data.counts); })
            .catch((error) => console.error(error));

        fetch(getApiUrl('/api/polls/manage?status=pending&limit=1'), { headers })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => { if (data?.counts) setCounts(data.counts); })
            .catch((error) => console.error(error));
    }, [canManage]);

    useEffect(() => {
        loadBadgeCounts();
    }, [loadBadgeCounts]);

    const loadMore = () => {
        setLoadingMore(true);
        fetchPage(page + 1, 'append')
            .catch((error) => console.error(error))
            .finally(() => setLoadingMore(false));
    };

    const refresh = useCallback(() => {
        fetchPage(1, 'replace').catch((error) => console.error(error));
        loadAuthors();
        loadBadgeCounts();
    }, [fetchPage, loadAuthors, loadBadgeCounts]);

    const toggleRow = (pollId: number) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(pollId)) next.delete(pollId);
            else next.add(pollId);
            return next;
        });
    };

    const handleResolve = async (poll: ManagePoll, option: ManageOption) => {
        const confirmed = await showConfirm(fillTemplate(t.managePolls.confirmResolve, { option: option.text }));
        if (!confirmed) return;

        setResolvingId(poll.id);
        try {
            const res = await fetch(getApiUrl(`/api/polls/${poll.id}/resolve`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ correctOptionId: option.id }),
            });

            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                showAlert(fillTemplate(t.managePolls.resolveSuccess, {
                    points: data.pointsAwarded ?? 0,
                    winners: data.winners ?? 0,
                }));
                // Завершённый опрос уходит из вкладок «требуют завершения» / «ещё идут», поэтому
                // проще перечитать страницу, чем чинить счётчики на месте.
                refresh();
            } else {
                const err = await res.json().catch(() => ({}));
                showAlert(err.message || t.managePolls.resolveFailed);
            }
        } catch (error) {
            console.error(error);
            showAlert(t.managePolls.networkError);
        } finally {
            setResolvingId(null);
        }
    };

    // Открывает новость с опросом ровно в том виде, в каком её видит читатель.
    const openPoll = async (poll: ManagePoll) => {
        setOpeningId(poll.id);
        try {
            const res = await fetch(getApiUrl(`/api/news/${poll.news_id}`), {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            if (!res.ok) throw new Error('Failed to load news');
            const data = await res.json();
            setOpenNews(data);
        } catch (error) {
            console.error(error);
            showAlert(t.managePolls.openFailed);
        } finally {
            setOpeningId(null);
        }
    };

    // Публикация черновика «как есть»: полный набор проверок отработает на сервере, поэтому
    // недозаполненный материал сюда не пролезет — вернётся понятная ошибка поля.
    const publishDraftNow = async (draft: DraftRow) => {
        const confirmed = await showConfirm(fillTemplate(t.managePolls.confirmPublishNow, { title: draft.title }));
        if (!confirmed) return;

        setBusyDraftId(draft.id);
        try {
            const res = await fetch(getApiUrl(`/api/news/${draft.id}`), {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            if (!res.ok) throw new Error('Failed to load draft');
            const item = await res.json();

            const saveRes = await fetch(getApiUrl(`/api/news/${draft.id}`), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({
                    title: item.title,
                    description: item.description,
                    image: item.image,
                    category: item.category,
                    source: item.source,
                    tags: item.tags,
                    status: 'published',
                    poll: item.poll
                        ? {
                            question: item.poll.question,
                            options: (item.poll.options || []).map((option: { id: number; text: string }) => ({
                                id: option.id,
                                text: option.text,
                            })),
                            endDate: item.poll.ends_at || undefined,
                        }
                        : undefined,
                }),
            });

            if (saveRes.ok) {
                showAlert(t.managePolls.publishedNow);
                refresh();
            } else {
                const err = await saveRes.json().catch(() => ({}));
                showAlert(err.errors?.[0]?.message || err.message || t.managePolls.resolveFailed);
            }
        } catch (error) {
            console.error(error);
            showAlert(t.managePolls.networkError);
        } finally {
            setBusyDraftId(null);
        }
    };

    const deleteDraft = async (draft: DraftRow) => {
        const confirmed = await showConfirm(fillTemplate(t.managePolls.confirmDeleteDraft, { title: draft.title }));
        if (!confirmed) return;

        setBusyDraftId(draft.id);
        try {
            const res = await fetch(getApiUrl(`/api/news/${draft.id}`), {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            if (res.ok) {
                showAlert(t.managePolls.draftDeleted);
                refresh();
            } else {
                showAlert(t.managePolls.resolveFailed);
            }
        } catch (error) {
            console.error(error);
            showAlert(t.managePolls.networkError);
        } finally {
            setBusyDraftId(null);
        }
    };

    const copyLink = (poll: ManagePoll) => {
        const url = `${window.location.origin}/?news=${poll.news_id}`;
        navigator.clipboard.writeText(url)
            .then(() => showAlert(t.managePolls.linkCopied))
            .catch(() => showAlert(t.managePolls.linkCopyFailed));
    };

    const authorOptions: SelectOption<string>[] = useMemo(() => {
        const options: SelectOption<string>[] = [
            { value: 'all', label: t.managePolls.allAuthors },
        ];
        if (user) {
            options.push({ value: 'me', label: t.managePolls.onlyMine });
        }
        authors
            // Себя показываем один раз — отдельным пунктом «Только мои» выше.
            .filter((author) => String(author.id) !== String(user?.id))
            .forEach((author) => {
                options.push({
                    value: String(author.id),
                    label: author.name || author.username,
                    hint: fillTemplate(t.managePolls.authorHint, { pending: author.pendingCount, total: author.totalCount }),
                });
            });
        if (withoutAuthorCount > 0) {
            options.push({ value: 'none', label: t.managePolls.withoutAuthor });
        }
        return options;
    }, [authors, withoutAuthorCount, user, t]);

    const sortOptions: SelectOption<ManageSort>[] = useMemo(() => {
        const base: SelectOption<ManageSort>[] = [
            { value: 'deadline', label: t.managePolls.sortDeadline },
            { value: 'created', label: t.managePolls.sortCreated },
            { value: 'title', label: t.managePolls.sortTitle },
            { value: 'author', label: t.managePolls.sortAuthor },
            { value: 'votes', label: t.managePolls.sortVotes },
        ];
        // Дата завершения есть только у завершённых — в остальных вкладках это пустая сортировка.
        if (status === 'resolved') {
            base.unshift({ value: 'resolved', label: t.managePolls.sortResolvedAt });
        }
        return base;
    }, [status, t]);

    const filtersDirty = authorFilter !== defaultAuthor || !!appliedSearch;

    const resetFilters = () => {
        setAuthorFilter(defaultAuthor);
        setSearch('');
        setAppliedSearch('');
        searchInputRef.current?.focus();
    };

    if (!canManage) {
        return <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">{t.admin.accessDenied}</div>;
    }

    const tabs: { key: ManageStatus; label: string; count: number; tone: string }[] = [
        { key: 'overdue', label: t.managePolls.tabOverdue, count: counts.overdue, tone: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10' },
        { key: 'active', label: t.managePolls.tabActive, count: counts.active, tone: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10' },
        { key: 'resolved', label: t.managePolls.tabResolved, count: counts.resolved, tone: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10' },
        { key: 'drafts', label: t.managePolls.tabDrafts, count: draftCounts.draft + draftCounts.scheduled, tone: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10' },
    ];

    const isDraftsTab = status === 'drafts';

    const tabHint = status === 'overdue' ? t.managePolls.tabHintOverdue
        : status === 'active' ? t.managePolls.tabHintActive
            : status === 'drafts' ? t.managePolls.tabHintDrafts
                : t.managePolls.tabHintResolved;

    const emptyText = status === 'overdue' ? t.managePolls.emptyOverdue
        : status === 'active' ? t.managePolls.emptyActive
            : status === 'drafts' ? t.managePolls.emptyDrafts
                : t.managePolls.emptyResolved;

    return (
        <div className="bg-white dark:bg-[#121212] rounded-2xl lg:rounded-[32px] p-4 lg:p-6 border border-zinc-200 dark:border-zinc-800 w-full">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 dark:bg-blue-500/10 rounded-xl">
                    <ListChecks className="text-blue-600 dark:text-blue-400 w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold dark:text-white">{t.managePolls.title}</h2>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">{t.managePolls.subtitle}</p>

            {/* Вкладки набора. Счётчики считаются по всей базе с учётом фильтра автора, поэтому
                видно, сколько ещё осталось, даже стоя в другой вкладке. */}
            <div className="flex flex-wrap gap-2 mb-3">
                {tabs.map((tab) => {
                    const isActive = status === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => selectStatus(tab.key)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${isActive
                                ? 'border-zinc-900 dark:border-white bg-zinc-900 dark:bg-white text-white dark:text-black'
                                : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                                }`}
                        >
                            <span>{tab.label}</span>
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full tabular-nums ${isActive ? 'bg-white/20 dark:bg-black/10' : tab.tone}`}>
                                {tab.count}
                            </span>
                        </button>
                    );
                })}
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-5">{tabHint}</p>

            {/* Поиск, фильтр по автору, сортировка и плотность списка. */}
            <div className="space-y-3 mb-5">
                <div className="relative">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t.managePolls.searchPlaceholder}
                        className="w-full pl-10 pr-10 py-2.5 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-transparent focus:border-blue-400 dark:focus:border-blue-500 outline-none text-sm dark:text-white placeholder-zinc-400 transition-colors"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            aria-label={t.cancel}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                        >
                            <X size={15} />
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* У черновиков свой порядок — ближайшие к выходу сверху, — и фильтровать их
                        по автору незачем: их и так единицы. */}
                    {!isDraftsTab && (
                        <>
                            <div className="min-w-[170px] flex-1 max-w-[240px]">
                                <Select
                                    value={authorFilter}
                                    options={authorOptions}
                                    onChange={setAuthorFilter}
                                    icon={<UserIcon size={15} />}
                                    ariaLabel={t.managePolls.author}
                                />
                            </div>

                            <div className="min-w-[170px] flex-1 max-w-[240px]">
                                <Select
                                    value={sort}
                                    options={sortOptions}
                                    onChange={setSort}
                                    icon={<SlidersHorizontal size={15} />}
                                    ariaLabel={t.managePolls.sortBy}
                                />
                            </div>

                            <button
                                onClick={() => setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                                title={order === 'asc' ? t.managePolls.orderAsc : t.managePolls.orderDesc}
                                aria-label={order === 'asc' ? t.managePolls.orderAsc : t.managePolls.orderDesc}
                                className="p-2.5 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                            >
                                {order === 'asc' ? <ArrowUpNarrowWide size={16} /> : <ArrowDownWideNarrow size={16} />}
                            </button>
                        </>
                    )}

                    {/* «Сжато / развёрнуто»: в сжатом виде строка — это заголовок, автор и срок, и
                        двадцать опросов помещаются в один экран вместо девятнадцати прокруток.
                        У черновиков разворачивать нечего — там строка и так одна. */}
                    <div className={`flex items-center rounded-full border border-zinc-200 dark:border-zinc-800 overflow-hidden ${isDraftsTab ? 'hidden' : ''}`}>
                        {([['compact', Rows3, t.managePolls.compactView], ['expanded', Rows2, t.managePolls.expandedView]] as const).map(([mode, Icon, label]) => (
                            <button
                                key={mode}
                                onClick={() => setDensity(mode)}
                                title={label}
                                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${density === mode
                                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-black'
                                    : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                                    }`}
                            >
                                <Icon size={15} />
                                <span className="hidden sm:inline">{label}</span>
                            </button>
                        ))}
                    </div>

                    {filtersDirty && (
                        <button
                            onClick={resetFilters}
                            className="px-3 py-2.5 rounded-full text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                        >
                            {t.managePolls.resetFilters}
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    <p>{t.managePolls.loading}</p>
                </div>
            ) : (isDraftsTab ? drafts.length === 0 : polls.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-500 dark:text-zinc-400 gap-3">
                    <div className={`p-4 rounded-full ${appliedSearch ? 'bg-zinc-100 dark:bg-zinc-800' : 'bg-green-50 dark:bg-green-500/10'}`}>
                        {appliedSearch ? <Search className="w-7 h-7 text-zinc-400" /> : <CheckCheck className="w-8 h-8 text-green-500" />}
                    </div>
                    <p className="font-medium">{appliedSearch ? t.managePolls.noResults : emptyText}</p>
                </div>
            ) : (
                <>
                    <div className="space-y-2">
                        {isDraftsTab ? drafts.map((draft) => {
                            const busy = busyDraftId === draft.id;
                            const goesLive = draft.status === 'scheduled' && draft.publish_at
                                ? formatDateTime(draft.publish_at, '—')
                                : null;

                            return (
                                <div
                                    key={draft.id}
                                    className={`rounded-2xl border p-3 lg:p-3.5 transition-colors ${draft.status === 'scheduled'
                                        ? 'border-amber-200 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-500/5'
                                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40'
                                        }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-semibold text-zinc-900 dark:text-white text-[15px] leading-snug break-words">
                                                    {draft.title}
                                                </h3>
                                                <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 border ${draft.status === 'scheduled'
                                                    ? 'text-amber-600 dark:text-amber-400 border-amber-500/40'
                                                    : 'text-zinc-500 border-zinc-300 dark:border-zinc-700'
                                                    }`}>
                                                    {draft.status === 'scheduled' ? t.managePolls.scheduledBadge : t.managePolls.draftBadge}
                                                </span>
                                            </div>

                                            <div className="mt-1 flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                                                <span className={`flex items-center gap-1.5 ${draft.author ? '' : 'italic text-zinc-400 dark:text-zinc-600'}`}>
                                                    <UserIcon size={12} className="shrink-0" />
                                                    {draft.author ? (draft.author.name || draft.author.username) : t.managePolls.unknownAuthor}
                                                </span>

                                                {goesLive && (
                                                    <span className="flex items-center gap-1.5 whitespace-nowrap text-amber-700 dark:text-amber-400 font-semibold">
                                                        <Clock size={12} className="shrink-0" />
                                                        {t.managePolls.goesLiveAt} {goesLive}
                                                    </span>
                                                )}

                                                <span className={draft.poll ? '' : 'italic text-zinc-400 dark:text-zinc-600'}>
                                                    {draft.poll
                                                        ? `${draft.poll.question || '—'} · ${draft.poll.options_count}`
                                                        : t.managePolls.noPollYet}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            {onEditNews && (
                                                <button
                                                    onClick={() => onEditNews(draft.id)}
                                                    title={t.managePolls.continueEditing}
                                                    aria-label={t.managePolls.continueEditing}
                                                    className="p-2 rounded-full text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => publishDraftNow(draft)}
                                                disabled={busy}
                                                title={t.managePolls.publishNow}
                                                aria-label={t.managePolls.publishNow}
                                                className="p-2 rounded-full text-zinc-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 transition-colors disabled:opacity-50"
                                            >
                                                {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                            </button>
                                            <button
                                                onClick={() => deleteDraft(draft)}
                                                disabled={busy}
                                                title={t.managePolls.deleteDraft}
                                                aria-label={t.managePolls.deleteDraft}
                                                className="p-2 rounded-full text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        }) : polls.map((poll) => {
                            const overdue = poll.is_resolved === 0 && isOverdue(poll.ends_at);
                            const busy = resolvingId === poll.id;
                            const expanded = density === 'expanded' || expandedIds.has(poll.id);
                            const authorName = poll.author?.name || poll.author?.username || t.managePolls.unknownAuthor;
                            const headline = poll.news_title || poll.question;

                            return (
                                <div
                                    key={poll.id}
                                    className={`rounded-2xl border transition-colors ${overdue
                                        ? 'border-red-200 dark:border-red-500/30 bg-red-50/40 dark:bg-red-500/5'
                                        : poll.is_resolved === 1
                                            ? 'border-zinc-200 dark:border-zinc-800 bg-green-50/30 dark:bg-green-500/[0.03]'
                                            : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40'
                                        }`}
                                >
                                    {/* Сжатая строка: заголовок + автор + срок. Клик по строке
                                        разворачивает варианты, кнопки справа — открыть и скопировать. */}
                                    <div className="flex items-start gap-2 p-3 lg:p-3.5">
                                        <button
                                            onClick={() => toggleRow(poll.id)}
                                            aria-label={expanded ? t.managePolls.collapseRow : t.managePolls.expandRow}
                                            className="mt-0.5 p-1 shrink-0 rounded-full text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                                        >
                                            <ChevronDown size={16} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                                        </button>

                                        <div
                                            className="min-w-0 flex-1 cursor-pointer"
                                            onClick={() => toggleRow(poll.id)}
                                        >
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-semibold text-zinc-900 dark:text-white text-[15px] leading-snug break-words">
                                                    {headline}
                                                </h3>
                                                {poll.is_resolved === 1 && (
                                                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-green-600 dark:text-green-400 border border-green-500/40 rounded px-1.5 py-0.5">
                                                        {t.managePolls.resolvedBadge}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="mt-1 flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                                                <span className={`flex items-center gap-1.5 ${poll.author ? '' : 'italic text-zinc-400 dark:text-zinc-600'}`}>
                                                    <UserIcon size={12} className="shrink-0" />
                                                    {authorName}
                                                </span>

                                                {poll.created_at && (
                                                    <span className="whitespace-nowrap">
                                                        {t.managePolls.createdOn} {formatDateOnly(poll.created_at)}
                                                    </span>
                                                )}

                                                {poll.is_resolved === 1 ? (
                                                    <span className="flex items-center gap-1.5 whitespace-nowrap text-green-600 dark:text-green-500">
                                                        <CheckCircle2 size={12} className="shrink-0" />
                                                        {t.managePolls.resolvedAt} {formatDateTime(poll.resolved_at, '—')}
                                                        {poll.resolved_by && ` · ${poll.resolved_by.name || poll.resolved_by.username}`}
                                                    </span>
                                                ) : poll.ends_at ? (
                                                    <span className={`flex items-center gap-1.5 whitespace-nowrap ${overdue ? 'text-red-500 font-semibold' : ''}`}>
                                                        {overdue ? <AlertTriangle size={12} className="shrink-0" /> : <Clock size={12} className="shrink-0" />}
                                                        {overdue ? `${t.managePolls.overdue}: ` : `${t.managePolls.deadline} `}
                                                        {formatDeadline(poll.ends_at)}
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                                                        <Clock size={12} className="shrink-0" />
                                                        {t.managePolls.noDeadline}
                                                    </span>
                                                )}

                                                <span className="whitespace-nowrap tabular-nums">
                                                    {poll.total_votes} {pluralizeVotes(poll.total_votes, t.managePolls.votesOne, t.managePolls.votesFew, t.managePolls.votes)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            {onEditNews && (
                                                <button
                                                    onClick={() => onEditNews(poll.news_id)}
                                                    title={t.managePolls.editPoll}
                                                    aria-label={t.managePolls.editPoll}
                                                    className="p-2 rounded-full text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => openPoll(poll)}
                                                disabled={openingId === poll.id}
                                                title={t.managePolls.openPoll}
                                                aria-label={t.managePolls.openPoll}
                                                className="p-2 rounded-full text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                                            >
                                                {openingId === poll.id ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
                                            </button>
                                            <button
                                                onClick={() => copyLink(poll)}
                                                title={t.managePolls.copyLink}
                                                aria-label={t.managePolls.copyLink}
                                                className="p-2 rounded-full text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                                            >
                                                <LinkIcon size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {expanded && (
                                        <div className="px-3 lg:px-3.5 pb-3.5 -mt-1">
                                            <div className="pl-8">
                                                <p className="text-sm text-zinc-700 dark:text-zinc-200 mb-3 leading-snug">
                                                    {poll.question}
                                                </p>

                                                <div className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">
                                                    {poll.is_resolved === 1 ? t.managePolls.correctAnswer : t.managePolls.pickCorrect}
                                                </div>

                                                <div className="space-y-2">
                                                    {poll.options.map((option) => (
                                                        <OptionBar
                                                            key={option.id}
                                                            option={option}
                                                            totalVotes={poll.total_votes}
                                                            isCorrect={poll.correct_option_id === option.id}
                                                            disabled={busy}
                                                            onPick={poll.is_resolved === 1 ? undefined : () => handleResolve(poll, option)}
                                                        />
                                                    ))}
                                                </div>

                                                {busy && (
                                                    <div className="flex items-center gap-2 text-xs text-zinc-500 mt-3">
                                                        <Loader2 size={14} className="animate-spin" /> {t.managePolls.resolving}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-5 flex flex-col items-center gap-3">
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 tabular-nums">
                            {t.managePolls.shown} {isDraftsTab ? drafts.length : polls.length} / {total}
                        </p>
                        {hasMore && (
                            <button
                                onClick={loadMore}
                                disabled={loadingMore}
                                className="px-5 py-2.5 rounded-full text-sm font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors disabled:opacity-60"
                            >
                                {loadingMore ? t.managePolls.loadingMore : t.managePolls.loadMore}
                            </button>
                        )}
                    </div>
                </>
            )}

            {openNews && (
                <NewsModal
                    item={openNews}
                    isOpen={!!openNews}
                    onClose={() => setOpenNews(null)}
                    onRefresh={refresh}
                >
                    {openNews.poll && (
                        <Poll
                            data={openNews.poll}
                            onPollChange={() => {
                                // Опрос могли завершить прямо в модалке — список и счётчики
                                // должны это увидеть, не дожидаясь перезагрузки страницы.
                                refresh();
                                setOpenNews(null);
                            }}
                        />
                    )}
                </NewsModal>
            )}
        </div>
    );
};
