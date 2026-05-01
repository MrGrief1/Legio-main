import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, CalendarClock, FileText, LockKeyhole, PlusCircle, Tag } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

function defaultCloseDate() {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());

  return date.toISOString().slice(0, 16);
}

export function CreateMarket() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [formMessage, setFormMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage('');
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await api.createMarket({
        title: String(formData.get('title') || ''),
        description: String(formData.get('description') || ''),
        category: String(formData.get('category') || ''),
        closeDate: new Date(String(formData.get('closeDate') || '')).toISOString(),
      });

      navigate(`/market/${response.market.id}`);
    } catch (error) {
      setFormMessage(error instanceof ApiError ? error.message : 'Не удалось создать рынок.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoading && !user) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-89px)] max-w-[760px] items-center px-4 py-10 sm:px-6">
        <div className="w-full rounded-2xl border border-pm-border bg-pm-surface p-6 shadow-[0_18px_48px_var(--color-pm-card-shadow-strong)]">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-pm-surface-hover text-pm-blue">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-pm-text-strong">Нужен аккаунт</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-pm-text">
            Создавать посты-рынки и голосовать могут только зарегистрированные пользователи.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/register"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-pm-blue px-5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
            >
              Зарегистрироваться
            </Link>
            <Link
              to="/login"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-pm-border px-5 text-sm font-bold text-pm-text-strong transition-colors hover:bg-pm-surface-hover"
            >
              Войти
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="mx-auto max-w-[960px] px-4 py-8 sm:px-6"
    >
      <div className="mb-6">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-pm-border bg-pm-surface px-3 py-1.5 text-sm font-semibold text-pm-text">
          <PlusCircle className="h-4 w-4 text-pm-blue" />
          Новый пост-рынок
        </div>
        <h1 className="text-3xl font-bold text-pm-text-strong">Создать рынок</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-pm-text-muted">
          Формулируй вопрос так, чтобы он мог закрыться однозначно: “Да” или “Нет”.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-pm-border bg-pm-surface p-5 shadow-[0_18px_48px_var(--color-pm-card-shadow-strong)] sm:p-6">
        <div className="grid grid-cols-1 gap-4">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
              <FileText className="h-4 w-4" />
              Вопрос
            </span>
            <input
              name="title"
              required
              minLength={8}
              maxLength={180}
              placeholder="Например: BTC будет выше $100 000 к 31 декабря 2026?"
              className="h-12 w-full rounded-xl border border-pm-border bg-pm-bg/45 px-4 text-base font-semibold text-pm-text-strong outline-none transition-colors placeholder:text-pm-text-muted focus:border-pm-blue focus:bg-pm-bg"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
                <Tag className="h-4 w-4" />
                Категория
              </span>
              <input
                name="category"
                required
                defaultValue="Общее"
                maxLength={48}
                className="h-12 w-full rounded-xl border border-pm-border bg-pm-bg/45 px-4 text-base font-semibold text-pm-text-strong outline-none transition-colors placeholder:text-pm-text-muted focus:border-pm-blue focus:bg-pm-bg"
              />
            </label>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
                <CalendarClock className="h-4 w-4" />
                Завершение
              </span>
              <input
                name="closeDate"
                type="datetime-local"
                required
                defaultValue={defaultCloseDate()}
                className="h-12 w-full rounded-xl border border-pm-border bg-pm-bg/45 px-4 text-base font-semibold text-pm-text-strong outline-none transition-colors focus:border-pm-blue focus:bg-pm-bg"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-pm-text-muted">
              <FileText className="h-4 w-4" />
              Правила и контекст
            </span>
            <textarea
              name="description"
              rows={7}
              maxLength={2000}
              placeholder="Какие источники считаются валидными? Что должно произойти, чтобы рынок закрылся как Да?"
              className="w-full resize-y rounded-xl border border-pm-border bg-pm-bg/45 px-4 py-3 text-base font-medium leading-7 text-pm-text-strong outline-none transition-colors placeholder:text-pm-text-muted focus:border-pm-blue focus:bg-pm-bg"
            />
          </label>
        </div>

        {formMessage && (
          <div className="mt-4 rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-sm font-semibold text-pm-red">
            {formMessage}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-pm-blue px-6 text-base font-bold text-white shadow-[0_4px_0_#1d4ed8] transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Создаю...' : 'Создать'}
            <ArrowRight className="h-4 w-4" />
          </motion.button>
        </div>
      </form>
    </motion.div>
  );
}
