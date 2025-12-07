import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, CheckCircle2, Clock, ExternalLink, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useDialog } from '../context/DialogContext';
import { Button } from './UI';
import { getApiUrl } from '../config';

interface ErrorReport {
    id: number;
    message: string;
    status: 'pending' | 'resolved';
    created_at: string;
    news_id: number;
    news_title: string;
    reporter_display_name: string;
}

export const ErrorReports: React.FC = () => {
    const { showAlert } = useDialog();
    const [reports, setReports] = useState<ErrorReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('all');

    const fetchReports = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(getApiUrl(`/api/admin/reports?status=${filter}`), {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!res.ok) throw new Error('Failed to fetch reports');

            const data = await res.json();
            setReports(data);
        } catch (err) {
            setError('Не удалось загрузить сообщения об ошибках');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, [filter]);

    const handleStatusChange = async (reportId: number, newStatus: 'pending' | 'resolved') => {
        try {
            const res = await fetch(getApiUrl(`/api/admin/reports/${reportId}/status`), {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (!res.ok) throw new Error('Failed to update status');

            // Refresh the list
            fetchReports();
        } catch (err) {
            console.error(err);
            showAlert('Не удалось обновить статус');
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[50vh]">
                <Loader2 className="animate-spin text-zinc-500" size={40} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col justify-center items-center min-h-[50vh] gap-4">
                <p className="text-red-500">{error}</p>
                <button
                    onClick={fetchReports}
                    className="px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
                >
                    Попробовать снова
                </button>
            </div>
        );
    }

    return (
        <main className="flex-1 min-w-0 py-4 lg:py-8 px-4 lg:px-8 max-w-4xl mx-auto w-full">
            <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">
                            Сообщения об ошибках
                        </h1>
                        <p className="text-zinc-500 dark:text-zinc-400">
                            Отзывы пользователей о проблемах на сайте
                        </p>
                    </div>
                    <button
                        onClick={fetchReports}
                        className="p-3 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all hover:rotate-180 duration-500"
                        aria-label="Обновить список"
                    >
                        <RefreshCw size={20} />
                    </button>
                </div>

                {/* Filter Buttons */}
                <div className="flex gap-2 flex-wrap">
                    {(['all', 'pending', 'resolved'] as const).map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilter(status)}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${filter === status
                                ? 'bg-blue-500 text-white'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                }`}
                        >
                            {status === 'all' && 'Все'}
                            {status === 'pending' && 'Ожидают'}
                            {status === 'resolved' && 'Решены'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Reports List */}
            <div className="space-y-4 pb-20">
                {reports.length === 0 ? (
                    <div className="text-center text-zinc-500 dark:text-zinc-400 py-20">
                        <AlertCircle size={48} className="mx-auto mb-4 opacity-50" />
                        <p>Нет сообщений об ошибках</p>
                    </div>
                ) : (
                    reports.map((report) => (
                        <div
                            key={report.id}
                            className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center ${report.status === 'pending'
                                            ? 'bg-yellow-50 dark:bg-yellow-500/10'
                                            : 'bg-green-50 dark:bg-green-500/10'
                                            }`}
                                    >
                                        {report.status === 'pending' ? (
                                            <Clock size={20} className="text-yellow-500" />
                                        ) : (
                                            <CheckCircle2 size={20} className="text-green-500" />
                                        )}
                                    </div>
                                    <div>
                                        <div className="font-medium text-zinc-900 dark:text-white">
                                            {report.reporter_display_name}
                                        </div>
                                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                            {formatDate(report.created_at)}
                                        </div>
                                    </div>
                                </div>

                                <span
                                    className={`px-3 py-1 rounded-full text-xs font-medium ${report.status === 'pending'
                                        ? 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'
                                        : 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400'
                                        }`}
                                >
                                    {report.status === 'pending' ? 'Ожидает' : 'Решено'}
                                </span>
                            </div>

                            {/* News Reference */}
                            {report.news_title && (
                                <div className="mb-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                                        Относится к новости:
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-zinc-900 dark:text-white">
                                            {report.news_title}
                                        </span>
                                        <ExternalLink size={14} className="text-zinc-400" />
                                    </div>
                                </div>
                            )}

                            {/* Message */}
                            <div className="mb-4">
                                <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                                    {report.message}
                                </p>
                            </div>

                            {/* Actions */}
                            {report.status === 'pending' && (
                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => handleStatusChange(report.id, 'resolved')}
                                        className="!bg-green-500 hover:!bg-green-600 !text-white !px-4 !py-2 !text-sm"
                                    >
                                        <CheckCircle2 size={16} className="mr-2" />
                                        Отметить как решённое
                                    </Button>
                                </div>
                            )}

                            {report.status === 'resolved' && (
                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => handleStatusChange(report.id, 'pending')}
                                        className="!bg-zinc-200 dark:!bg-zinc-700 hover:!bg-zinc-300 dark:hover:!bg-zinc-600 !text-zinc-700 dark:!text-zinc-300 !px-4 !py-2 !text-sm"
                                    >
                                        <Clock size={16} className="mr-2" />
                                        Вернуть в ожидающие
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </main>
    );
};
