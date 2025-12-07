import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = (): ToastContextType => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
};

interface ToastProviderProps {
    children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = Math.random().toString(36).substring(7);
        setToasts((prev) => [...prev, { id, message, type }]);

        // Auto remove after 4 seconds
        setTimeout(() => {
            setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, 4000);
    }, []);

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    };

    const getIcon = (type: ToastType) => {
        switch (type) {
            case 'success':
                return <CheckCircle className="text-green-500" size={20} />;
            case 'error':
                return <AlertCircle className="text-red-500" size={20} />;
            case 'info':
                return <Info className="text-blue-500" size={20} />;
        }
    };

    const getStyles = (type: ToastType) => {
        switch (type) {
            case 'success':
                return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
            case 'error':
                return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
            case 'info':
                return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
        }
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {toasts.length > 0 &&
                createPortal(
                    <div className="fixed inset-0 z-[99999] flex items-center justify-center pointer-events-none p-4">
                        <div className="flex flex-col gap-3 pointer-events-auto max-w-md w-full">
                            {toasts.map((toast) => (
                                <div
                                    key={toast.id}
                                    className={`flex items-center gap-3 p-4 rounded-2xl border shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-4 duration-300 ${getStyles(
                                        toast.type
                                    )}`}
                                >
                                    {getIcon(toast.type)}
                                    <p className="flex-1 text-sm font-medium text-zinc-900 dark:text-white">
                                        {toast.message}
                                    </p>
                                    <button
                                        onClick={() => removeToast(toast.id)}
                                        className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
                                    >
                                        <X size={16} className="text-zinc-500" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>,
                    document.body
                )}
        </ToastContext.Provider>
    );
};
