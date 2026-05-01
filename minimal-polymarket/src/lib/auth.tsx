import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { api, AUTH_TOKEN_KEY, type User } from './api';

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  login: (input: { email: string; password: string }) => Promise<void>;
  register: (input: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);

    if (!token) {
      setIsLoading(false);
      return;
    }

    api.me()
      .then(({ user: profile }) => setUser(profile))
      .catch(() => {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    async login(input) {
      const response = await api.login(input);
      window.localStorage.setItem(AUTH_TOKEN_KEY, response.token);
      setUser(response.user);
    },
    async register(input) {
      const response = await api.register(input);
      window.localStorage.setItem(AUTH_TOKEN_KEY, response.token);
      setUser(response.user);
    },
    logout() {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      setUser(null);
    },
  }), [isLoading, user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
