import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { API_URL } from '../config';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { PrizeModal, PrizeNotification } from '../components/PrizeModal';

interface NotificationContextType {
    // Unread items, newest first.
    notifications: PrizeNotification[];
    refresh: () => Promise<void>;
    markRead: (id: number) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
    notifications: [],
    refresh: async () => { },
    markRead: async () => { },
});

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user, refreshUser } = useAuth();
    const { showToast } = useToast();
    const [notifications, setNotifications] = useState<PrizeNotification[]>([]);
    const [activePrize, setActivePrize] = useState<PrizeNotification | null>(null);

    const refresh = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            setNotifications([]);
            return;
        }

        try {
            const res = await fetch(`${API_URL}/notifications`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            // Anything non-OK (expired session, throttling) leaves the current list alone; a
            // notification that failed to load is simply shown on the next attempt.
            if (!res.ok) return;

            const data = await res.json();
            if (Array.isArray(data)) setNotifications(data);
        } catch {
            // Offline: try again on the next refresh.
        }
    }, []);

    const markRead = useCallback(async (id: number) => {
        // Removed locally first so dismissing feels instant and can't re-show if the request is slow.
        setNotifications((prev) => prev.filter((item) => item.id !== id));

        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            await fetch(`${API_URL}/notifications/${id}/read`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
        } catch {
            // If this fails the server still has it unread, so it reappears later — which is the
            // safer direction for a message the user is meant to see.
        }
    }, []);

    // Load on sign-in, clear on sign-out.
    useEffect(() => {
        if (!user) {
            setNotifications([]);
            setActivePrize(null);
            return;
        }
        refresh();
    }, [user?.id, refresh]);

    // The prize is settled server-side when a month rolls over, so a session that stays open across
    // midnight on the 1st should still find out.
    useAutoRefresh(refresh, { intervalMs: 300_000, enabled: !!user });

    // A prize gets the full celebration; anything else is a toast. The dialog shows one at a time.
    useEffect(() => {
        if (activePrize) return;

        const prize = notifications.find((item) => item.type === 'monthly_prize');
        if (prize) {
            setActivePrize(prize);
            return;
        }

        const other = notifications[0];
        if (other) {
            showToast(other.body || other.title, 'info', { title: other.title });
            markRead(other.id);
        }
    }, [notifications, activePrize, showToast, markRead]);

    const closePrize = useCallback(async () => {
        const prize = activePrize;
        setActivePrize(null);
        if (!prize) return;

        await markRead(prize.id);
        // The prize changed the balance; pull the new total so the header stops showing the old one.
        refreshUser();
    }, [activePrize, markRead, refreshUser]);

    return (
        <NotificationContext.Provider value={{ notifications, refresh, markRead }}>
            {children}
            <PrizeModal notification={activePrize} onClose={closePrize} />
        </NotificationContext.Provider>
    );
};
