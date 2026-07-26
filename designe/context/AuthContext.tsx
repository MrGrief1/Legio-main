import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { API_URL } from '../config';

interface User {
  id: number;
  username: string;
  role: 'admin' | 'creator' | 'user';
  points: number;
  avatar: string;
  name?: string;
  bio?: string;
  birthdate?: string;
}

interface AuthContextType {
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  // Re-read the signed-in user from the server. Callers use this after a mutation instead of
  // reloading the page, and it also keeps points/level current while the tab stays open.
  refreshUser: () => Promise<User | null>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => { },
  logout: () => { },
  refreshUser: async () => null,
  isAuthenticated: false,
  isLoading: true,
});

// How often the signed-in user's own record is re-read while the tab is open, so points and level
// earned elsewhere (a poll being resolved, the monthly prize landing) appear without a reload.
const USER_POLL_INTERVAL_MS = 60_000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    const token = localStorage.getItem('token');
    if (!token) {
      setUser(null);
      return null;
    }

    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // 401/403 means the session is gone (expired token, deleted account) — drop it so the UI
      // falls back to the signed-out state instead of showing stale data forever.
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('token');
        setUser(null);
        return null;
      }

      if (!res.ok) return null; // A transient server error must not sign the user out.

      const data = await res.json();
      setUser(data);
      return data;
    } catch {
      // Offline or a dropped request: keep whatever is on screen.
      return null;
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setIsLoading(false));
  }, [refreshUser]);

  // Keep the account fresh: on an interval, and immediately when the tab regains focus (the moment
  // the user is most likely to notice something is out of date).
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(refreshUser, USER_POLL_INTERVAL_MS);
    const onFocus = () => refreshUser();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshUser();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // Depends only on whether someone is signed in — not on the user object, which this very
    // effect replaces on every poll and would otherwise restart the interval each time.
  }, [!!user, refreshUser]);

  const login = (token: string, userData: User) => {
    localStorage.setItem('token', token);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser, isAuthenticated: !!user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
