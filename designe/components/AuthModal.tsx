import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AuthCard } from './AuthCard';
import { useScrollLock } from '../hooks/useScrollLock';
import { useBackClose } from '../hooks/useBackClose';

// Login / registration in a dialog.
//
// The full auth card normally lives in the right panel, which is hidden below xl. This is how the
// sidebar offers the same thing when the layout has no room for a permanent card.
export const AuthModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    useScrollLock(isOpen);
    // Кнопка «назад» закрывает модалку, а не уводит с сайта.
    useBackClose(isOpen, onClose);

    useEffect(() => {
        if (!isOpen) return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

            <div
                className="relative w-full max-w-sm animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute -top-3 -right-3 z-10 p-2 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white shadow-lg transition-colors"
                    aria-label="Close"
                >
                    <X size={16} />
                </button>
                <AuthCard />
            </div>
        </div>,
        document.body
    );
};
