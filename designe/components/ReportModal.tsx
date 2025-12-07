import React, { useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from './UI';
import { useMountTransition } from '../hooks/useMountTransition';

interface ReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    newsId: number;
    newsTitle: string;
}import { X, AlertTriangle, Loader2 } from 'lucide-react';

export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, newsId, newsTitle }) => {
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const hasTransitionedIn = useMountTransition(isOpen, 300);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!message.trim()) {
            setError('Пожалуйста, опишите проблему');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const res = await fetch('http://localhost:3001/api/reports', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    newsId,
                    message: message.trim()
                })
            });

            if (!res.ok) {
                throw new Error('Failed to submit report');
            }

            setSuccess(true);
            setMessage('');

            // Close modal after a short delay
            setTimeout(() => {
                setSuccess(false);
                onClose();
            }, 1500);

        } catch (err) {
            console.error(err);
            setError('Не удалось отправить сообщение. Попробуйте позже.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (!isSubmitting) {
            setMessage('');
            setError(null);
            setSuccess(false);
            onClose();
        }
    };

    if (!hasTransitionedIn && !isOpen) return null;

    return createPortal(
        <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${isOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'}`}>
            {/* Backdrop */}
            <div 
                className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ease-out ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                onClick={handleClose}
            />

            {/* Modal Container */}
            <div
                className={`relative bg-white dark:bg-zinc-900 rounded-[32px] border border-zinc-200 dark:border-zinc-800 w-full max-w-lg overflow-hidden shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-yellow-50 dark:bg-yellow-500/10 flex items-center justify-center">
                            <AlertTriangle size={20} className="text-yellow-500" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                                Сообщить об ошибке
                            </h2>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                Опишите проблему, которую вы обнаружили
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        disabled={isSubmitting}
                        className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                    >
                        <X size={20} className="text-zinc-500" />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6">
                    {/* News Title Reference */}
                    <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                            Относится к новости:
                        </div>
                        <div className="text-sm font-medium text-zinc-900 dark:text-white">
                            {newsTitle}
                        </div>
                    </div>

                    {/* Message Input */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                            Описание проблемы
                        </label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            disabled={isSubmitting || success}
                            placeholder="Например: Изображение не загружается, или опрос отображается некорректно..."
                            className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-50"
                            rows={5}
                        />
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl">
                            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                        </div>
                    )}

                    {/* Success Message */}
                    {success && (
                        <div className="mb-4 p-3 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-xl animate-in fade-in slide-in-from-top-2">
                            <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                                ✓ Ваше сообщение успешно отправлено!
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3">
                        <Button
                            type="button"
                            onClick={handleClose}
                            disabled={isSubmitting}
                            className="!bg-zinc-200 dark:!bg-zinc-700 hover:!bg-zinc-300 dark:hover:!bg-zinc-600 !text-zinc-700 dark:!text-zinc-300 flex-1 !py-3"
                        >
                            Отмена
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting || !message.trim() || success}
                            className="!bg-yellow-500 hover:!bg-yellow-600 !text-white flex-1 !py-3 disabled:!bg-zinc-300 dark:disabled:!bg-zinc-700 disabled:!text-zinc-500"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="animate-spin mr-2" size={18} />
                                    Отправка...
                                </>
                            ) : success ? (
                                '✓ Отправлено'
                            ) : (
                                'Отправить'
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};
