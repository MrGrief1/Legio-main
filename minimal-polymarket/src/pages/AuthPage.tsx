import { type FormEvent, type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
  Wallet,
} from 'lucide-react';

type AuthMode = 'login' | 'register';

type AuthPageProps = {
  mode: AuthMode;
};

const authCopy = {
  login: {
    eyebrow: 'С возвращением',
    title: 'Войти в аккаунт',
    subtitle: 'Открой портфель, отслеживай позиции и возвращайся к рынкам быстрее.',
    submit: 'Войти',
    switchText: 'Нет аккаунта?',
    switchAction: 'Зарегистрироваться',
    switchTo: '/register',
    success: 'Готово. После подключения API здесь появится вход в аккаунт.',
  },
  register: {
    eyebrow: 'Новый аккаунт',
    title: 'Создать аккаунт',
    subtitle: 'Сохраняй рынки, собирай watchlist и готовься к сделкам в одном профиле.',
    submit: 'Создать аккаунт',
    switchText: 'Уже есть аккаунт?',
    switchAction: 'Войти',
    switchTo: '/login',
    success: 'Аккаунт подготовлен. Осталось подключить API авторизации.',
  },
} satisfies Record<AuthMode, {
  eyebrow: string;
  title: string;
  subtitle: string;
  submit: string;
  switchText: string;
  switchAction: string;
  switchTo: string;
  success: string;
}>;

function FieldShell({
  id,
  icon,
  label,
  children,
}: {
  id: string;
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className="group block rounded-xl border border-pm-border bg-pm-bg/45 px-3.5 py-3 transition-colors focus-within:border-pm-blue focus-within:bg-pm-bg"
    >
      <label htmlFor={id} className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}

export function AuthPage({ mode }: AuthPageProps) {
  const copy = authCopy[mode];
  const isRegister = mode === 'register';
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [formMessage, setFormMessage] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get('password') ?? '');
    const confirmPassword = String(formData.get('confirmPassword') ?? '');

    if (isRegister && password !== confirmPassword) {
      setFormMessage('Пароли не совпадают.');
      return;
    }

    setFormMessage(copy.success);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="mx-auto grid min-h-[calc(100vh-89px)] max-w-[1180px] grid-cols-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,0.88fr)_minmax(380px,1fr)] lg:items-center lg:py-12"
    >
      <section className="order-2 hidden lg:block">
        <div className="max-w-xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-pm-border bg-pm-surface px-3 py-1.5 text-sm font-semibold text-pm-text">
            <ShieldCheck className="h-4 w-4 text-pm-green" />
            Безопасный доступ к портфелю
          </div>
          <h1 className="max-w-lg text-4xl font-bold leading-tight text-pm-text-strong">
            Торгуй прогнозами с профилем, который помнит твой темп.
          </h1>
          <p className="mt-4 max-w-md text-base leading-7 text-pm-text">
            Сохраняй интересные рынки, отслеживай активность и быстро возвращайся к сделкам после входа.
          </p>
          <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
            {[
              { value: '$71M', label: 'объём рынка' },
              { value: '24/7', label: 'живые котировки' },
              { value: '2FA', label: 'готово к защите' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-pm-border bg-pm-surface p-4">
                <div className="text-2xl font-bold text-pm-text-strong">{item.value}</div>
                <div className="mt-1 text-sm font-medium text-pm-text-muted">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="order-1 mx-auto w-full max-w-[480px] lg:order-2">
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="rounded-2xl border border-pm-border bg-pm-surface p-5 shadow-[0_18px_48px_var(--color-pm-card-shadow-strong)] sm:p-6"
        >
          <div className="mb-6">
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.08em] text-pm-blue">{copy.eyebrow}</p>
            <h1 className="text-2xl font-bold text-pm-text-strong">{copy.title}</h1>
            <p className="mt-2 text-sm leading-6 text-pm-text-muted">{copy.subtitle}</p>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-pm-bg/45 p-1">
            <Link
              to="/login"
              className={
                mode === 'login'
                  ? 'rounded-lg bg-pm-surface px-3 py-2 text-center text-sm font-bold text-pm-text-strong shadow-[0_1px_2px_var(--color-pm-card-shadow)]'
                  : 'rounded-lg px-3 py-2 text-center text-sm font-bold text-pm-text-muted transition-colors hover:text-pm-text-strong'
              }
            >
              Вход
            </Link>
            <Link
              to="/register"
              className={
                mode === 'register'
                  ? 'rounded-lg bg-pm-surface px-3 py-2 text-center text-sm font-bold text-pm-text-strong shadow-[0_1px_2px_var(--color-pm-card-shadow)]'
                  : 'rounded-lg px-3 py-2 text-center text-sm font-bold text-pm-text-muted transition-colors hover:text-pm-text-strong'
              }
            >
              Регистрация
            </Link>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {isRegister && (
              <FieldShell id="name" label="Имя пользователя" icon={<UserRound className="h-4 w-4" />}>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="username"
                  required
                  placeholder="market_maker"
                  className="w-full bg-transparent text-base font-semibold text-pm-text-strong outline-none placeholder:text-pm-text-muted"
                />
              </FieldShell>
            )}

            <FieldShell id="email" label="Email" icon={<Mail className="h-4 w-4" />}>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="name@example.com"
                className="w-full bg-transparent text-base font-semibold text-pm-text-strong outline-none placeholder:text-pm-text-muted"
              />
            </FieldShell>

            <FieldShell id="password" label="Пароль" icon={<LockKeyhole className="h-4 w-4" />}>
              <div className="flex items-center gap-3">
                <input
                  id="password"
                  name="password"
                  type={passwordVisible ? 'text' : 'password'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  required
                  minLength={8}
                  placeholder="Минимум 8 символов"
                  className="min-w-0 flex-1 bg-transparent text-base font-semibold text-pm-text-strong outline-none placeholder:text-pm-text-muted"
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  className="rounded-lg p-1.5 text-pm-text-muted transition-colors hover:bg-pm-surface-hover hover:text-pm-text-strong"
                  aria-label={passwordVisible ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </FieldShell>

            {isRegister && (
              <FieldShell id="confirmPassword" label="Повтор пароля" icon={<LockKeyhole className="h-4 w-4" />}>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={passwordVisible ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="Повтори пароль"
                  className="w-full bg-transparent text-base font-semibold text-pm-text-strong outline-none placeholder:text-pm-text-muted"
                />
              </FieldShell>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-semibold text-pm-text-muted">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  required={isRegister}
                  className="h-4 w-4 rounded border-pm-border bg-pm-bg accent-pm-blue"
                />
                {isRegister ? 'Согласен с правилами' : 'Запомнить меня'}
              </label>
              {!isRegister && (
                <button type="button" className="text-pm-blue transition-colors hover:text-blue-400">
                  Забыли пароль?
                </button>
              )}
            </div>

            {formMessage && (
              <div
                className={
                  formMessage.includes('не совпадают')
                    ? 'rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-sm font-semibold text-pm-red'
                    : 'flex items-center gap-2 rounded-xl border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-2 text-sm font-semibold text-pm-green'
                }
              >
                {!formMessage.includes('не совпадают') && <CheckCircle2 className="h-4 w-4" />}
                {formMessage}
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-pm-blue text-base font-bold text-white shadow-[0_4px_0_#1d4ed8] transition-colors hover:bg-blue-700"
            >
              {copy.submit}
              <ArrowRight className="h-4 w-4" />
            </motion.button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
            <div className="h-px flex-1 bg-pm-border" />
            или
            <div className="h-px flex-1 bg-pm-border" />
          </div>

          <button className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-pm-border bg-pm-bg/35 text-sm font-bold text-pm-text-strong transition-colors hover:bg-pm-surface-hover">
            <Wallet className="h-4 w-4 text-pm-blue" />
            Продолжить с кошельком
          </button>

          <p className="mt-5 text-center text-sm font-semibold text-pm-text-muted">
            {copy.switchText}{' '}
            <Link to={copy.switchTo} className="text-pm-blue transition-colors hover:text-blue-400">
              {copy.switchAction}
            </Link>
          </p>
        </motion.div>
      </section>
    </motion.div>
  );
}
