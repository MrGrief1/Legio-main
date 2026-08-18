import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, Lock, ShieldCheck, KeyRound } from 'lucide-react';
import { Button, Input } from './UI';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { getApiUrl } from '../config';

// Вкладка «Безопасность»: почта, пароль и вход по коду.
//
// Вынесено из SettingsModal отдельным файлом: каждая из трёх операций — это мастер из двух-трёх
// шагов с письмом посередине, и держать три конечных автомата внутри модалки профиля означало бы
// перемешать их состояние с формой аватара и биографии.
//
// Общий принцип: сначала сервер отправляет код (request), потом мы подтверждаем его вместе с самим
// действием (confirm). Никакая из операций не выполняется одним запросом — именно этим она и
// защищена от того, кто завладел только сессией.

interface SecurityStatus {
    email: string | null;
    maskedEmail: string | null;
    hasEmail: boolean;
    emailVerified: boolean;
    mfaEmailEnabled: boolean;
    username: string;
    loginIsEmail: boolean;
}

type Flow = null | 'password' | 'email' | 'mfa';
type FlowStep = 'form' | 'current-code' | 'new-email' | 'new-code' | 'code';

const RESEND_COOLDOWN_SECONDS = 60;

const authFetch = async (path: string, options: RequestInit = {}) => {
    const res = await fetch(getApiUrl(path), {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            ...(options.headers || {}),
        },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const error = new Error(data.message || data.error || 'Request failed') as Error & { retryInSec?: number };
        error.retryInSec = data.retryInSec;
        throw error;
    }
    return data;
};

const postJson = (path: string, body: unknown = {}) =>
    authFetch(path, { method: 'POST', body: JSON.stringify(body) });

export const SecuritySettings: React.FC = () => {
    const { t } = useLanguage();
    const { login, refreshUser } = useAuth();
    const { showToast } = useToast();

    const [status, setStatus] = useState<SecurityStatus | null>(null);
    const [flow, setFlow] = useState<Flow>(null);
    const [flowStep, setFlowStep] = useState<FlowStep>('form');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [cooldown, setCooldown] = useState(0);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [code, setCode] = useState('');
    const [stageToken, setStageToken] = useState('');
    const [maskedTarget, setMaskedTarget] = useState('');
    const [mfaEnabling, setMfaEnabling] = useState(true);

    const loadStatus = useCallback(async () => {
        try {
            setStatus(await authFetch('/api/user/security/status'));
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => { loadStatus(); }, [loadStatus]);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    const resetFlow = () => {
        setFlow(null);
        setFlowStep('form');
        setError('');
        setCode('');
        setStageToken('');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setNewEmail('');
        setMaskedTarget('');
    };

    const fail = (e: unknown) => {
        const err = e as Error & { retryInSec?: number };
        setError(err?.message || 'Request failed');
        if (err?.retryInSec) setCooldown(err.retryInSec);
    };

    const run = async (action: () => Promise<void>) => {
        setLoading(true);
        setError('');
        try {
            await action();
        } catch (e) {
            fail(e);
        } finally {
            setLoading(false);
        }
    };

    // --- Пароль ---

    const startPasswordChange = () => run(async () => {
        if (newPassword !== confirmPassword) {
            setError(t.settings.passwordMismatch);
            return;
        }

        const data = await postJson('/api/user/security/password/request', { currentPassword });
        if (data.codeRequired === false) {
            // Почты нет — подтверждать нечем, меняем сразу по текущему паролю.
            await postJson('/api/user/security/password/confirm', { currentPassword, newPassword });
            showToast(t.settings.passwordChanged, 'success');
            resetFlow();
            return;
        }

        setMaskedTarget(data.maskedEmail || '');
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setFlowStep('code');
    });

    const confirmPasswordChange = () => run(async () => {
        await postJson('/api/user/security/password/confirm', { currentPassword, newPassword, code });
        showToast(t.settings.passwordChanged, 'success');
        resetFlow();
    });

    // --- Почта ---

    const startEmailChange = () => run(async () => {
        if (!status?.hasEmail) {
            // Привязка: первого шага с кодом на старый адрес не существует.
            setFlowStep('new-email');
            return;
        }

        const data = await postJson('/api/user/email/request-current');
        setMaskedTarget(data.maskedEmail || '');
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setFlowStep('current-code');
    });

    const verifyCurrentEmail = () => run(async () => {
        const data = await postJson('/api/user/email/verify-current', { code });
        setStageToken(data.stageToken);
        setCode('');
        setFlowStep('new-email');
    });

    const requestNewEmail = () => run(async () => {
        const data = await postJson('/api/user/email/request-new', {
            email: newEmail,
            stageToken: stageToken || undefined,
            currentPassword: status?.hasEmail ? undefined : currentPassword,
        });
        setMaskedTarget(data.maskedEmail || '');
        setCode('');
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setFlowStep('new-code');
    });

    const confirmNewEmail = () => run(async () => {
        const data = await postJson('/api/user/email/confirm', {
            code,
            stageToken: stageToken || undefined,
        });

        // Логин мог смениться вместе с адресом, поэтому сервер выдаёт новый токен — старый несёт
        // прежний username.
        if (data.token && data.user) login(data.token, data.user);
        await refreshUser();
        await loadStatus();
        showToast(t.settings.emailChanged, 'success');
        resetFlow();
    });

    // --- Вход по коду ---

    const startMfaChange = (enable: boolean) => run(async () => {
        setMfaEnabling(enable);
        const data = await postJson('/api/user/security/mfa/request', { enable });
        setMaskedTarget(data.maskedEmail || '');
        setCode('');
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setFlow('mfa');
        setFlowStep('code');
    });

    const confirmMfaChange = () => run(async () => {
        await postJson('/api/user/security/mfa/confirm', { enable: mfaEnabling, code });
        await loadStatus();
        await refreshUser();
        showToast(mfaEnabling ? t.settings.twoFactorEnabled : t.settings.twoFactorDisabled, 'success');
        resetFlow();
    });

    if (!status) {
        return (
            <div className="flex justify-center py-10">
                <Loader2 className="animate-spin text-zinc-400" />
            </div>
        );
    }

    const sectionClass = "border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5";
    const labelClass = "text-xs font-medium text-zinc-500 ml-1 mb-1.5 block";

    const codeField = (
        <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={t.settings.codePlaceholder}
            className={`!bg-zinc-100 dark:!bg-zinc-900 text-center font-mono ${code ? 'tracking-[0.5em]' : ''}`}
        />
    );

    const codeSentHint = (
        <p className="text-xs text-zinc-500 mb-3">
            {t.settings.codeSentTo} <span className="text-zinc-900 dark:text-white">{maskedTarget}</span>
        </p>
    );

    // Отсчёт до следующей отправки показывается рядом с ошибкой: сервер отвечает «подождите»,
    // но без цифры непонятно сколько, и человек жмёт кнопку снова.
    const errorLine = error
        ? <p className="text-red-500 text-xs mt-2">{error}{cooldown > 0 ? ` (${cooldown} с)` : ''}</p>
        : null;

    const actionRow = (confirmLabel: string, onConfirm: () => void, disabled = false) => (
        <div className="flex gap-2 mt-4">
            <Button type="button" onClick={onConfirm} disabled={loading || disabled} className="flex-1">
                {loading ? <Loader2 className="animate-spin" size={18} /> : confirmLabel}
            </Button>
            <Button type="button" variant="secondary" onClick={resetFlow} disabled={loading}>
                {t.settings.cancel}
            </Button>
        </div>
    );

    return (
        <div className="space-y-4">
            {/* Почта */}
            <div className={sectionClass}>
                <div className="flex items-center gap-2 mb-3">
                    <Mail size={16} className="text-zinc-500" />
                    <h4 className="text-sm font-semibold dark:text-white">{t.settings.emailSection}</h4>
                </div>

                {status.hasEmail ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {t.settings.currentEmail}: <span className="text-zinc-900 dark:text-white">{status.email}</span>
                    </p>
                ) : (
                    <>
                        <p className="text-sm text-amber-600 dark:text-amber-500">{t.settings.noEmail}</p>
                        <p className="text-xs text-zinc-500 mt-1">{t.settings.noEmailHint}</p>
                    </>
                )}

                {flow !== 'email' ? (
                    <Button
                        type="button"
                        variant="secondary"
                        className="mt-4"
                        onClick={() => { resetFlow(); setFlow('email'); startEmailChange(); }}
                        disabled={loading}
                    >
                        {status.hasEmail ? t.settings.changeEmail : t.settings.bindEmail}
                    </Button>
                ) : (
                    <div className="mt-4">
                        {flowStep === 'current-code' && (
                            <>
                                <label className={labelClass}>{t.settings.stepCurrentEmail}</label>
                                {codeSentHint}
                                {codeField}
                                {errorLine}
                                {actionRow(t.settings.confirmCode, verifyCurrentEmail, code.length < 6)}
                            </>
                        )}

                        {flowStep === 'new-email' && (
                            <>
                                <label className={labelClass}>{t.settings.stepNewEmail}</label>
                                <Input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    placeholder={t.settings.newEmailPlaceholder}
                                    className="!bg-zinc-100 dark:!bg-zinc-900"
                                    icon={<Mail size={16} />}
                                />
                                {!status.hasEmail && (
                                    <div className="mt-3">
                                        <Input
                                            type="password"
                                            value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                            placeholder={t.settings.currentPasswordPlaceholder}
                                            className="!bg-zinc-100 dark:!bg-zinc-900"
                                            icon={<Lock size={16} />}
                                        />
                                    </div>
                                )}
                                {errorLine}
                                {actionRow(t.auth.sendCode, requestNewEmail, !newEmail)}
                            </>
                        )}

                        {flowStep === 'new-code' && (
                            <>
                                {codeSentHint}
                                {codeField}
                                {errorLine}
                                {actionRow(t.settings.confirmCode, confirmNewEmail, code.length < 6)}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Пароль */}
            <div className={sectionClass}>
                <div className="flex items-center gap-2 mb-3">
                    <KeyRound size={16} className="text-zinc-500" />
                    <h4 className="text-sm font-semibold dark:text-white">{t.settings.passwordSection}</h4>
                </div>

                {flow !== 'password' ? (
                    <Button type="button" variant="secondary" onClick={() => { resetFlow(); setFlow('password'); }}>
                        {t.settings.changePassword}
                    </Button>
                ) : flowStep === 'form' ? (
                    <div className="space-y-3">
                        <Input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder={t.settings.currentPasswordPlaceholder}
                            className="!bg-zinc-100 dark:!bg-zinc-900"
                            icon={<Lock size={16} />}
                            autoComplete="current-password"
                        />
                        <Input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder={t.settings.passwordPlaceholder}
                            className="!bg-zinc-100 dark:!bg-zinc-900"
                            icon={<Lock size={16} />}
                            autoComplete="new-password"
                        />
                        <Input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder={t.settings.confirmPasswordPlaceholder}
                            className="!bg-zinc-100 dark:!bg-zinc-900"
                            icon={<Lock size={16} />}
                            autoComplete="new-password"
                        />
                        {errorLine}
                        {actionRow(t.auth.sendCode, startPasswordChange, !currentPassword || !newPassword)}
                    </div>
                ) : (
                    <>
                        {codeSentHint}
                        {codeField}
                        {errorLine}
                        {actionRow(t.settings.confirmCode, confirmPasswordChange, code.length < 6)}
                    </>
                )}
            </div>

            {/* Вход по коду */}
            <div className={sectionClass}>
                <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck size={16} className="text-zinc-500" />
                    <h4 className="text-sm font-semibold dark:text-white">{t.settings.twoFactorSection}</h4>
                </div>
                <p className="text-xs text-zinc-500 mb-3">{t.settings.twoFactorHint}</p>

                <div className="flex items-center justify-between gap-3">
                    <span className={`text-sm font-medium ${status.mfaEmailEnabled ? 'text-emerald-600 dark:text-emerald-500' : 'text-zinc-500'}`}>
                        {status.mfaEmailEnabled ? t.settings.twoFactorOn : t.settings.twoFactorOff}
                    </span>

                    {flow !== 'mfa' && (
                        <Button
                            type="button"
                            variant={status.mfaEmailEnabled ? 'outline' : 'primary'}
                            onClick={() => startMfaChange(!status.mfaEmailEnabled)}
                            // Без привязанной почты второй фактор невозможен: код некуда отправить.
                            disabled={loading || !status.hasEmail}
                        >
                            {status.mfaEmailEnabled ? t.settings.disable : t.settings.enable}
                        </Button>
                    )}
                </div>

                {flow === 'mfa' && (
                    <div className="mt-4">
                        {codeSentHint}
                        {codeField}
                        {errorLine}
                        {actionRow(t.settings.confirmCode, confirmMfaChange, code.length < 6)}
                    </div>
                )}
            </div>
        </div>
    );
};
