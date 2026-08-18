import React, { useCallback, useEffect, useState } from 'react';
import { Button, Input } from './UI';
import { Eye, EyeOff, Loader2, Settings, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SettingsModal } from './SettingsModal';
import { Avatar } from './Avatar';
import { useLanguage } from '../context/LanguageContext';
import { API_URL } from '../config';

interface AuthCardProps {
  className?: string;
}

// Экраны карточки. Форма входа/регистрации — не единственный экран: почти каждое действие
// заканчивается вводом кода из письма, и это отдельный шаг, а не поле в той же форме.
type Step = 'form' | 'verify-register' | 'verify-login' | 'forgot' | 'reset';

// Совпадает с паузой между отправками на сервере (emailAuth.RESEND_COOLDOWN_SECONDS). Кнопка
// «отправить ещё раз» гаснет на это время, иначе пользователь жмёт её и получает 429.
const RESEND_COOLDOWN_SECONDS = 60;

interface ApiError extends Error {
  code?: string;
  retryInSec?: number;
}

const postJson = async (path: string, body: unknown) => {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(data.message || data.error || 'Something went wrong') as ApiError;
    error.code = data.code;
    error.retryInSec = data.retryInSec;
    throw error;
  }

  return data;
};

export const AuthCard: React.FC<AuthCardProps> = ({ className = '' }) => {
  const { t } = useLanguage();
  const { login, user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [step, setStep] = useState<Step>('form');
  const [showPassword, setShowPassword] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Состояние шага с кодом. `challengeId` живёт только у входа: там пользователь ещё не
  // аутентифицирован, и сервер опознаёт попытку по непредсказуемому идентификатору, а не по почте.
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const goToForm = useCallback((tab?: 'login' | 'register') => {
    setStep('form');
    setCode('');
    setChallengeId('');
    setError('');
    setInfo('');
    if (tab) setActiveTab(tab);
  }, []);

  const handleApiError = (err: unknown) => {
    const apiError = err as ApiError;
    setError(apiError?.message || 'Something went wrong');
    if (apiError?.retryInSec) setCooldown(apiError.retryInSec);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');

    try {
      if (activeTab === 'login') {
        const data = await postJson('/auth/login', { username, password });

        // Второй фактор включён — токена в ответе нет, вход завершится после кода.
        if (data.requires2fa) {
          setChallengeId(data.challengeId);
          setMaskedEmail(data.maskedEmail || '');
          setCode('');
          setCooldown(RESEND_COOLDOWN_SECONDS);
          setStep('verify-login');
          return;
        }

        login(data.token, data.user);
        return;
      }

      const data = await postJson('/auth/register', { name, email, password });
      setPendingEmail(data.email || email);
      setMaskedEmail(data.maskedEmail || '');
      setCode('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setStep('verify-register');
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = step === 'verify-register'
        ? await postJson('/auth/register/verify', { email: pendingEmail, code })
        : await postJson('/auth/login/verify', { challengeId, code });

      login(data.token, data.user);
      setPassword('');
      setCode('');
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setLoading(true);
    setError('');
    setInfo('');

    try {
      if (step === 'verify-register') {
        const data = await postJson('/auth/register/resend', { email: pendingEmail });
        setMaskedEmail(data.maskedEmail || maskedEmail);
      } else if (step === 'verify-login') {
        const data = await postJson('/auth/login/resend', { challengeId });
        // Повторная отправка создаёт НОВУЮ попытку: старый идентификатор больше не действует.
        setChallengeId(data.challengeId);
        setMaskedEmail(data.maskedEmail || maskedEmail);
      } else {
        await postJson('/auth/forgot-password', { email: pendingEmail });
      }

      setCode('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setInfo(t.auth.codeSentTo + ' ' + (maskedEmail || pendingEmail));
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Ответ намеренно одинаков для существующего и несуществующего адреса, поэтому экран
      // ввода кода показывается в любом случае.
      await postJson('/auth/forgot-password', { email: pendingEmail });
      setInfo(t.auth.resetSent);
      setCode('');
      setPassword('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setStep('reset');
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await postJson('/auth/reset-password', { email: pendingEmail, code, password });
      login(data.token, data.user);
      setPassword('');
      setCode('');
    } catch (err) {
      handleApiError(err);
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
              <Avatar src={user.avatar} alt={user.username} size={80} fallbackText={user.name || user.username} />
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

  const cardClass = `bg-white dark:bg-[#121212] border border-zinc-200 dark:border-zinc-800 rounded-[32px] p-6 ${className}`;
  const primaryButtonClass = "!bg-zinc-900 dark:!bg-white !text-white dark:!text-black !font-bold !rounded-full hover:!opacity-90";

  const backButton = (onBack: () => void) => (
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors mb-4"
    >
      <ArrowLeft size={14} /> {t.auth.back}
    </button>
  );

  const codeInput = (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      placeholder={t.auth.codePlaceholder}
      className={`!bg-zinc-100 dark:!bg-zinc-900 text-center font-mono ${code ? 'tracking-[0.5em]' : ''}`}
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
      required
      autoFocus
    />
  );

  const resendRow = (
    <button
      type="button"
      onClick={handleResend}
      disabled={cooldown > 0 || loading}
      className="w-full text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:hover:text-zinc-500 disabled:opacity-60 transition-colors"
    >
      {cooldown > 0 ? `${t.auth.resendIn} ${cooldown} с` : t.auth.resendCode}
    </button>
  );

  const messages = (
    <>
      {error && <p className="text-red-500 text-xs text-center">{error}</p>}
      {!error && info && <p className="text-emerald-600 dark:text-emerald-500 text-xs text-center">{info}</p>}
    </>
  );

  // --- Ввод кода: подтверждение регистрации или второй фактор при входе ---
  if (step === 'verify-register' || step === 'verify-login') {
    return (
      <div className={cardClass}>
        {backButton(() => goToForm())}

        <div className="text-center mb-5">
          <h3 className="font-bold text-base dark:text-white">
            {step === 'verify-register' ? t.auth.verifyEmailTitle : t.auth.verifyLoginTitle}
          </h3>
          <p className="text-zinc-500 text-xs mt-1">
            {t.auth.codeSentTo} <span className="text-zinc-900 dark:text-white">{maskedEmail || pendingEmail}</span>
          </p>
        </div>

        <form className="space-y-3" onSubmit={handleVerify}>
          {codeInput}
          {messages}
          <Button fullWidth variant="primary" className={primaryButtonClass} disabled={loading || code.length < 6}>
            {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : t.auth.verifyButton}
          </Button>
          {resendRow}
        </form>
      </div>
    );
  }

  // --- Восстановление пароля: шаг 1, запрос кода ---
  if (step === 'forgot') {
    return (
      <div className={cardClass}>
        {backButton(() => goToForm('login'))}

        <div className="text-center mb-5">
          <h3 className="font-bold text-base dark:text-white">{t.auth.resetTitle}</h3>
          <p className="text-zinc-500 text-xs mt-1">{t.auth.resetHint}</p>
        </div>

        <form className="space-y-3" onSubmit={handleForgot}>
          <Input
            type="email"
            placeholder={t.auth.email}
            className="!bg-zinc-100 dark:!bg-zinc-900"
            value={pendingEmail}
            onChange={(e) => setPendingEmail(e.target.value)}
            required
            autoFocus
          />
          {messages}
          <Button fullWidth variant="primary" className={primaryButtonClass} disabled={loading}>
            {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : t.auth.sendCode}
          </Button>
        </form>
      </div>
    );
  }

  // --- Восстановление пароля: шаг 2, код и новый пароль ---
  if (step === 'reset') {
    return (
      <div className={cardClass}>
        {backButton(() => setStep('forgot'))}

        <div className="text-center mb-5">
          <h3 className="font-bold text-base dark:text-white">{t.auth.resetTitle}</h3>
          <p className="text-zinc-500 text-xs mt-1">
            {t.auth.codeSentTo} <span className="text-zinc-900 dark:text-white">{pendingEmail}</span>
          </p>
        </div>

        <form className="space-y-3" onSubmit={handleReset}>
          {codeInput}
          <Input
            type={showPassword ? 'text' : 'password'}
            placeholder={t.auth.newPassword}
            className="!bg-zinc-100 dark:!bg-zinc-900"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          {messages}
          <Button fullWidth variant="primary" className={primaryButtonClass} disabled={loading || code.length < 6}>
            {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : t.auth.resetButton}
          </Button>
          {resendRow}
        </form>
      </div>
    );
  }

  // --- Обычная форма входа и регистрации ---
  return (
    <div className={cardClass}>
      <div className="relative flex p-1 bg-zinc-100 dark:bg-zinc-900 rounded-full mb-6">
        <div
          className="absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/2)] bg-white dark:bg-zinc-800 rounded-full shadow-sm transition-transform duration-300 ease-in-out"
          style={{
            transform: `translateX(${activeTab === 'register' ? '100%' : '0%'})`
          }}
        />
        <button
          onClick={() => { setActiveTab('login'); setError(''); }}
          className={`relative z-10 flex-1 py-2 text-xs font-medium rounded-full transition-colors duration-200 ${activeTab === 'login' ? 'text-black dark:text-white' : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}`}
        >
          {t.auth.login}
        </button>
        <button
          onClick={() => { setActiveTab('register'); setError(''); }}
          className={`relative z-10 flex-1 py-2 text-xs font-medium rounded-full transition-colors duration-200 ${activeTab === 'register' ? 'text-black dark:text-white' : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}`}
        >
          {t.auth.register}
        </button>
      </div>

      <div className="space-y-3">
        <form className="space-y-3" onSubmit={handleSubmit}>
          {activeTab === 'register' && (
            <Input
              type="text"
              placeholder={t.auth.name}
              className="!bg-zinc-100 dark:!bg-zinc-900"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          {activeTab === 'register' ? (
            <Input
              type="email"
              placeholder={t.auth.email}
              className="!bg-zinc-100 dark:!bg-zinc-900"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          ) : (
            <Input
              type="text"
              placeholder={t.auth.email}
              className="!bg-zinc-100 dark:!bg-zinc-900"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          )}
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
          {messages}

          <Button
            fullWidth
            variant="primary"
            className={primaryButtonClass}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : (activeTab === 'login' ? t.auth.loginButton : t.auth.registerButton)}
          </Button>
        </form>

        {activeTab === 'login' && (
          <button
            type="button"
            onClick={() => {
              // Логин мог быть введён как ник — в поле восстановления подставляем его только
              // если это похоже на адрес, иначе пользователь допишет сам.
              setPendingEmail(username.includes('@') ? username : '');
              setError('');
              setInfo('');
              setStep('forgot');
            }}
            className="w-full text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            {t.auth.forgotPassword}
          </button>
        )}
      </div>
    </div>
  );
};
