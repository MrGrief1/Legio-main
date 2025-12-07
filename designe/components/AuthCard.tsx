
import React, { useState } from 'react';
import { Button, Input } from './UI';
import { Eye, EyeOff, Loader2, Settings, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SettingsModal } from './SettingsModal';
import { useLanguage } from '../context/LanguageContext';
import { API_URL } from '../config';

interface AuthCardProps {
  className?: string;
}

export const AuthCard: React.FC<AuthCardProps> = ({ className = '' }) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, user, logout } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const endpoint = activeTab === 'login' ? '/auth/login' : '/auth/register';
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.message || data.error || 'Something went wrong');

      login(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (user) {
    return (
      <>
        <div className={`bg-white dark:bg-[#121212] border border-zinc-200 dark:border-zinc-800 rounded-[32px] p-6 ${className}`}>
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <img src={user.avatar} alt={user.username} className="w-20 h-20 rounded-full object-cover" />
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="absolute bottom-0 right-0 bg-blue-500 text-white p-1.5 rounded-full hover:bg-blue-600 transition-colors"
              >
                <Settings size={14} />
              </button>
            </div>
            <div className="text-center">
              <h3 className="font-bold text-lg dark:text-white">{user.name || user.username}</h3>
              {user.name && user.name !== user.username && <p className="text-zinc-500 text-xs">@{user.username}</p>}
              <p className="text-zinc-500 text-sm">{t.auth.role}: {user.role}</p>
              <p className="text-blue-500 font-bold mt-1">{user.points} {t.points}</p>
            </div>
            <Button onClick={logout} variant="secondary" fullWidth>{t.auth.logout}</Button>
          </div>
        </div>

        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </>
    );
  }

  return (
    <div className={`bg-white dark:bg-[#121212] border border-zinc-200 dark:border-zinc-800 rounded-[32px] p-6 ${className}`}>
      <div className="relative flex p-1 bg-zinc-100 dark:bg-zinc-900 rounded-full mb-6">
        <div
          className="absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/2)] bg-white dark:bg-zinc-800 rounded-full shadow-sm transition-transform duration-300 ease-in-out"
          style={{
            transform: `translateX(${activeTab === 'register' ? '100%' : '0%'})`
          }}
        />
        <button
          onClick={() => setActiveTab('login')}
          className={`relative z-10 flex-1 py-2 text-xs font-medium rounded-full transition-colors duration-200 ${activeTab === 'login' ? 'text-black dark:text-white' : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}`}
        >
          {t.auth.login}
        </button>
        <button
          onClick={() => setActiveTab('register')}
          className={`relative z-10 flex-1 py-2 text-xs font-medium rounded-full transition-colors duration-200 ${activeTab === 'register' ? 'text-black dark:text-white' : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}`}
        >
          {t.auth.register}
        </button>
      </div>

      <div className="space-y-3">
        {/* OAuth buttons omitted for brevity as they require backend implementation */}

        <form className="space-y-3" onSubmit={handleSubmit}>
          <Input
            type="text"
            placeholder={t.auth.username}
            className="!bg-zinc-100 dark:!bg-zinc-900"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <Input
            type={showPassword ? "text" : "password"}
            placeholder={t.auth.password}
            className="!bg-zinc-100 dark:!bg-zinc-900"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            icon={
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="focus:outline-none">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
          {error && <p className="text-red-500 text-xs text-center">{error}</p>}

          <Button
            fullWidth
            variant="primary"
            className="!bg-zinc-900 dark:!bg-white !text-white dark:!text-black !font-bold !rounded-full hover:!opacity-90"
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : (activeTab === 'login' ? t.auth.loginButton : t.auth.registerButton)}
          </Button>
        </form>
      </div>
    </div>
  );
};
