import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { DialogType } from '../context/DialogContext';
import { Button } from './UI';
import { useMountTransition } from '../hooks/useMountTransition';

interface DialogModalProps {
    isOpen: boolean;
    type: DialogType;
    message: string;
    onConfirm?: () => void;
    onCancel?: () => void;
}

export const DialogModal: React.FC<DialogModalProps> = ({
    isOpen,
    type,
    message,
    onConfirm,
    onCancel
}) => {
    const hasTransitionedIn = useMountTransition(isOpen, 300);

    // Lock body scroll when dialog is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (type === 'alert' && onConfirm) {
                    onConfirm();
                } else if (type === 'confirm' && onCancel) {
                    onCancel();
                }
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, type, onConfirm, onCancel]);

    if (!hasTransitionedIn && !isOpen) return null;

    return createPortal(
        <div className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 transition-all duration-300 ${isOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'}`}>
            {/* Backdrop */}
            <div
                className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ease-out ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                onClick={type === 'alert' ? onConfirm : onCancel}
            />

            {/* Dialog Box */}
            <div
                className={`relative bg-white dark:bg-[#121212] w-full max-w-md rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
            >
                {/* Icon and Message */}
                <div className="p-8 text-center">
                    <div className="flex justify-center mb-4">
                        {type === 'alert' ? (
                            <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                <AlertCircle size={32} className="text-blue-500" />
                            </div>
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                                <AlertCircle size={32} className="text-yellow-500" />
                            </div>
                        )}
                    </div>

                    <p className="text-base lg:text-lg text-zinc-900 dark:text-white font-medium leading-relaxed whitespace-pre-wrap">
                        {message}
                    </p>
                </div>

                {/* Buttons */}
                <div className="px-6 pb-6 flex gap-3">
                    {type === 'confirm' && onCancel && (
                        <Button
                            onClick={onCancel}
                            className="flex-1 !bg-zinc-200 dark:!bg-zinc-800 !text-zinc-900 dark:!text-white hover:!bg-zinc-300 dark:hover:!bg-zinc-700"
                        >
                            Отмена
                        </Button>
                    )}
                    {onConfirm && (
                        <Button
                            onClick={onConfirm}
                            className={`${type === 'confirm' ? 'flex-1' : 'w-full'} !bg-blue-500 hover:!bg-blue-600 !text-white`}
                        >
                            {type === 'alert' ? 'OK' : 'Да'}
                        </Button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
