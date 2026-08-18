// Транзакционная почта Legio через Resend.
//
// Единственная точка отправки писем: все коды подтверждения (регистрация, вход, смена пароля,
// смена почты) рисуются одним шаблоном, поэтому письма выглядят одинаково и правятся в одном месте.
//
// Ключ и адрес отправителя берутся из окружения. Без RESEND_API_KEY отправка не падает, а
// возвращает { ok: false, reason: 'not-configured' }: локальная разработка не должна требовать
// боевого ключа, а вызывающий код обязан проверить результат, прежде чем считать код доставленным.

const RESEND_API_URL = 'https://api.resend.com/emails';

// «Legio <noreply@legio.news>» — домен должен быть подтверждён в Resend, иначе API вернёт 403.
// До подтверждения домена можно поставить RESEND_FROM='Legio <onboarding@resend.dev>' — этот
// адрес Resend разрешает без верификации, но только на почту владельца аккаунта.
const getFromAddress = () => String(process.env.RESEND_FROM || 'Legio <noreply@legio.news>').trim();

const getApiKey = () => String(process.env.RESEND_API_KEY || '').trim();

const isMailerConfigured = () => Boolean(getApiKey());

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Тёмный «стеклянный» шаблон под дизайн сайта. Вёрстка на таблицах и inline-стилях —
// почтовые клиенты (особенно Outlook и Gmail) вырезают <style> и не поддерживают flex/grid.
const renderCodeEmail = ({ title, description, code, ttlMinutes, footerNote }) => `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Legio</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background-color:#09090b;color:#ffffff;">
  <div style="width:100%;background-color:#09090b;padding:40px 12px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:480px;margin:0 auto;background-color:#121212;border:1px solid #27272a;border-radius:28px;overflow:hidden;">
      <tr>
        <td style="padding:36px 36px 16px;text-align:center;">
          <div style="width:52px;height:52px;margin:0 auto 18px;border-radius:16px;background:linear-gradient(135deg,#ffffff 0%,#a1a1aa 100%);display:inline-block;line-height:52px;color:#09090b;font-weight:700;font-size:22px;">L</div>
          <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Legio</div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 36px 36px;">
          <h1 style="margin:0 0 10px;color:#ffffff;font-size:18px;font-weight:600;text-align:center;">${escapeHtml(title)}</h1>
          <p style="margin:0 0 26px;color:#a1a1aa;font-size:14px;line-height:1.55;text-align:center;">${escapeHtml(description)}</p>

          <div style="background-color:#1c1c1f;border:1px solid #303034;border-radius:18px;padding:22px;text-align:center;margin-bottom:22px;">
            <span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:32px;font-weight:700;color:#ffffff;letter-spacing:8px;">${escapeHtml(code)}</span>
          </div>

          <p style="margin:0 0 14px;color:#71717a;font-size:12px;line-height:1.5;text-align:center;">Код действует ${escapeHtml(ttlMinutes)} мин. Никому его не сообщайте — сотрудники Legio никогда не спрашивают код.</p>
          <p style="margin:0;color:#52525b;font-size:12px;line-height:1.5;text-align:center;">${escapeHtml(footerNote || 'Если вы этого не запрашивали, просто проигнорируйте письмо.')}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:18px;text-align:center;border-top:1px solid #1f1f22;background-color:#0d0d0f;">
          <p style="margin:0;color:#52525b;font-size:11px;">© ${new Date().getFullYear()} Legio · legio.news</p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;

const renderCodeText = ({ title, description, code, ttlMinutes }) =>
    `${title}\n\n${description}\n\nКод: ${code}\nДействует ${ttlMinutes} мин.\n\nЕсли вы этого не запрашивали, проигнорируйте письмо.\n\nLegio · legio.news`;

/**
 * Низкоуровневая отправка. Не бросает: вызывающему важно отличить «письмо ушло» от «не ушло»,
 * а не ловить исключение в каждом обработчике.
 *
 * @returns {Promise<{ ok: boolean, id?: string, reason?: string, error?: string }>}
 */
const sendRawEmail = async ({ to, subject, html, text }) => {
    const apiKey = getApiKey();
    if (!apiKey) {
        // Локально это ожидаемо, поэтому предупреждение, а не ошибка. Код при этом печатается
        // в лог вызывающей стороной — иначе разработку нельзя было бы вести без боевого ключа.
        console.warn('[mailer] RESEND_API_KEY не задан — письмо не отправлено:', subject);
        return { ok: false, reason: 'not-configured' };
    }

    try {
        const response = await fetch(RESEND_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: getFromAddress(),
                to: [to],
                subject,
                html,
                text,
            }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error('[mailer] Resend вернул ошибку:', response.status, payload);
            return { ok: false, reason: 'send-failed', error: payload?.message || `HTTP ${response.status}` };
        }

        return { ok: true, id: payload?.id };
    } catch (error) {
        console.error('[mailer] Не удалось отправить письмо:', error);
        return { ok: false, reason: 'send-failed', error: error.message };
    }
};

// Тексты писем по назначению кода. Ключи совпадают с purpose в таблице auth_codes,
// поэтому обработчику маршрута достаточно передать purpose.
const CODE_TEMPLATES = {
    register: {
        subject: 'Подтверждение регистрации — Legio',
        title: 'Добро пожаловать в Legio',
        description: 'Чтобы завершить регистрацию, введите этот код на сайте.',
    },
    login: {
        subject: 'Код для входа — Legio',
        title: 'Подтверждение входа',
        description: 'Кто-то входит в ваш аккаунт. Введите код, чтобы завершить вход.',
        footerNote: 'Если это были не вы — не вводите код и смените пароль.',
    },
    password_reset: {
        subject: 'Восстановление пароля — Legio',
        title: 'Восстановление пароля',
        description: 'Введите этот код, чтобы задать новый пароль.',
    },
    password_change: {
        subject: 'Подтверждение смены пароля — Legio',
        title: 'Смена пароля',
        description: 'Введите этот код, чтобы подтвердить смену пароля.',
        footerNote: 'Если это были не вы — срочно смените пароль и проверьте почту на взлом.',
    },
    email_change_current: {
        subject: 'Смена почты — подтверждение текущего адреса',
        title: 'Смена почты',
        description: 'Подтвердите, что этот адрес ваш, чтобы начать смену почты.',
    },
    email_change_new: {
        subject: 'Смена почты — подтверждение нового адреса',
        title: 'Новый адрес почты',
        description: 'Введите этот код, чтобы привязать этот адрес к аккаунту Legio.',
    },
    email_bind: {
        subject: 'Привязка почты — Legio',
        title: 'Привязка почты',
        description: 'Введите этот код, чтобы привязать этот адрес к вашему аккаунту.',
    },
    mfa_enable: {
        subject: 'Включение входа по коду — Legio',
        title: 'Двухфакторная защита',
        description: 'Введите код, чтобы включить подтверждение входа по почте.',
    },
    mfa_disable: {
        subject: 'Отключение входа по коду — Legio',
        title: 'Отключение двухфакторной защиты',
        description: 'Введите код, чтобы отключить подтверждение входа по почте.',
        footerNote: 'Если это были не вы — не вводите код и смените пароль.',
    },
};

/**
 * Отправляет письмо с кодом подтверждения.
 *
 * @param {string} to       адрес получателя
 * @param {string} purpose  ключ из CODE_TEMPLATES (он же purpose кода в БД)
 * @param {string} code     сам код
 * @param {number} ttlMinutes срок жизни кода в минутах — попадает в текст письма
 */
const sendCodeEmail = async (to, purpose, code, ttlMinutes) => {
    const template = CODE_TEMPLATES[purpose] || {
        subject: 'Код подтверждения — Legio',
        title: 'Код подтверждения',
        description: 'Введите этот код, чтобы продолжить.',
    };

    const payload = { ...template, code, ttlMinutes };

    return sendRawEmail({
        to,
        subject: template.subject,
        html: renderCodeEmail(payload),
        text: renderCodeText(payload),
    });
};

module.exports = { sendCodeEmail, sendRawEmail, isMailerConfigured, CODE_TEMPLATES };
