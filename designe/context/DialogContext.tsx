import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { DialogModal } from '../components/DialogModal';

export type DialogType = 'alert' | 'confirm';

interface DialogConfig {
    type: DialogType;
    message: string;
    onConfirm?: () => void;
    onCancel?: () => void;
}

interface DialogContextType {
    showAlert: (message: string) => void;
    showConfirm: (message: string) => Promise<boolean>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export const useDialog = () => {
    const context = useContext(DialogContext);
    if (!context) {
        throw new Error('useDialog must be used within DialogProvider');
    }
    return context;
};

interface DialogProviderProps {
    children: ReactNode;
}

export const DialogProvider: React.FC<DialogProviderProps> = ({ children }) => {
    const [dialog, setDialog] = useState<DialogConfig | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    const showAlert = useCallback((message: string) => {
        setDialog({
            type: 'alert',
            message,
            onConfirm: () => {
                setIsOpen(false);
                setTimeout(() => setDialog(null), 200);
            }
        });
        setIsOpen(true);
    }, []);

    const showConfirm = useCallback((message: string): Promise<boolean> => {
        return new Promise((resolve) => {
            setDialog({
                type: 'confirm',
                message,
                onConfirm: () => {
                    setIsOpen(false);
                    setTimeout(() => setDialog(null), 200);
                    resolve(true);
                },
                onCancel: () => {
                    setIsOpen(false);
                    setTimeout(() => setDialog(null), 200);
                    resolve(false);
                }
            });
            setIsOpen(true);
        });
    }, []);

    return (
        <DialogContext.Provider value={{ showAlert, showConfirm }}>
            {children}
            {dialog && (
                <DialogModal
                    isOpen={isOpen}
                    type={dialog.type}
                    message={dialog.message}
                    onConfirm={dialog.onConfirm}
                    onCancel={dialog.onCancel}
                />
            )}
        </DialogContext.Provider>
    );
};
