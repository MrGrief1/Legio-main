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

// Шаблон письма.
//
// Вёрстка на таблицах и inline-стилях — не архаизм, а требование: Gmail, Outlook и Mail.ru
// вырезают <style> и не поддерживают flex/grid, поэтому всё, что должно выжить гарантированно,
// написано атрибутами и style="" прямо на элементах.
//
// Оформление повторяет сайт: серифный курсивный логотип (Playfair Display с откатом на Georgia —
// веб-шрифты в почте почти нигде не грузятся), Inter в тексте, белая карточка со скруглением на
// светло-сером поле. Тёмная тема — через prefers-color-scheme: там, где она поддерживается,
// правила с !important перебивают inline-стили; где нет — остаётся светлый вариант.

const EMAIL_STYLES = `
  @media (prefers-color-scheme: dark) {
    .lg-page   { background-color: #09090b !important; }
    .lg-card   { background-color: #121212 !important; border-color: #27272a !important; }
    .lg-rule   { border-color: #27272a !important; }
    .lg-title,
    .lg-brand  { color: #fafafa !important; }
    .lg-text   { color: #d4d4d8 !important; }
    .lg-muted  { color: #71717a !important; }
    .lg-panel  { background-color: #1a1a1d !important; border-color: #3f3f46 !important; }
    .lg-code   { color: #ffffff !important; }
    .lg-accent { color: #60a5fa !important; }
  }
  @media (max-width: 480px) {
    .lg-pad    { padding-left: 24px !important; padding-right: 24px !important; }
    .lg-code   { font-size: 30px !important; letter-spacing: 8px !important; }
  }
`;

const renderCodeEmail = ({ eyebrow, title, description, code, ttlMinutes, footerNote }) => `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Legio</title>
  <style>${EMAIL_STYLES}</style>
</head>
<body class="lg-page" style="margin:0;padding:0;width:100%;background-color:#f4f4f5;">

  <!-- Строка предпросмотра в списке писем: сам код видно ещё до открытия. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">
    ${escapeHtml(code)} — код подтверждения Legio, действует ${escapeHtml(ttlMinutes)} мин.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="lg-page" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" class="lg-card" style="width:100%;max-width:520px;background-color:#ffffff;border:1px solid #e4e4e7;border-radius:24px;">

          <!-- Шапка -->
          <tr>
            <td class="lg-pad" style="padding:36px 40px 0;">
              <div class="lg-brand" style="font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-style:italic;font-size:30px;font-weight:500;letter-spacing:-0.5px;color:#18181b;line-height:1.1;">Legio</div>
              <div class="lg-muted" style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#a1a1aa;padding-top:6px;">Проверь свою интуицию</div>
            </td>
          </tr>
          <tr>
            <td class="lg-pad" style="padding:24px 40px 0;">
              <div class="lg-rule" style="border-top:1px solid #e4e4e7;font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>

          <!-- Заголовок и пояснение -->
          <tr>
            <td class="lg-pad" style="padding:28px 40px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
              <div class="lg-accent" style="font-size:11px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#2563eb;">${escapeHtml(eyebrow)}</div>
              <h1 class="lg-title" style="margin:10px 0 0;font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;line-height:1.25;color:#18181b;">${escapeHtml(title)}</h1>
              <p class="lg-text" style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#52525b;">${escapeHtml(description)}</p>
            </td>
          </tr>

          <!-- Код -->
          <tr>
            <td class="lg-pad" style="padding:24px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="lg-panel" style="background-color:#fafafa;border:1px dashed #d4d4d8;border-radius:16px;">
                <tr>
                  <td align="center" style="padding:22px 12px 16px;">
                    <div class="lg-code" style="font-family:'SF Mono',ui-monospace,Menlo,Consolas,'Courier New',monospace;font-size:36px;font-weight:700;letter-spacing:12px;text-indent:12px;color:#18181b;line-height:1.1;">${escapeHtml(code)}</div>
                    <div class="lg-muted" style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#a1a1aa;padding-top:10px;">действует ${escapeHtml(ttlMinutes)} мин</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Предупреждение -->
          <tr>
            <td class="lg-pad" style="padding:22px 40px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
              <p class="lg-muted" style="margin:0;font-size:13px;line-height:1.6;color:#71717a;">${escapeHtml(footerNote || 'Если вы этого не запрашивали, просто проигнорируйте письмо.')}</p>
              <p class="lg-muted" style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#a1a1aa;">Никому не сообщайте этот код — сотрудники Legio никогда его не спрашивают.</p>
            </td>
          </tr>

          <!-- Подвал -->
          <tr>
            <td class="lg-pad" style="padding:28px 40px 32px;">
              <div class="lg-rule" style="border-top:1px solid #e4e4e7;font-size:0;line-height:0;">&nbsp;</div>
              <div class="lg-muted" style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#a1a1aa;padding-top:16px;">
                <a href="https://legio.news" style="color:#a1a1aa;text-decoration:none;">legio.news</a>
                &nbsp;·&nbsp; © ${new Date().getFullYear()} Legio
              </div>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

const renderCodeText = ({ eyebrow, title, description, code, ttlMinutes, footerNote }) =>
    [
        'LEGIO',
        '',
        `${eyebrow} — ${title}`,
        '',
        description,
        '',
        `Код: ${code}`,
        `Действует ${ttlMinutes} мин.`,
        '',
        footerNote || 'Если вы этого не запрашивали, просто проигнорируйте письмо.',
        'Никому не сообщайте этот код — сотрудники Legio никогда его не спрашивают.',
        '',
        'legio.news',
    ].join('\n');

// Письмо об итогах опроса.
//
// Приходит участнику, когда редакция проставила верный вариант. Главное, ради чего его открывают, —
// «угадал или нет», поэтому это первое, что видно: цветная плашка с вердиктом, под ней свой ответ
// и верный ответ рядом, чтобы их можно было сравнить, не вспоминая, за что голосовал месяц назад.
//
// Вёрстка та же, что и у писем с кодами: таблицы и inline-стили, потому что почтовые клиенты
// вырезают <style> и не поддерживают flex.
const renderPollResultEmail = ({ isWinner, question, userAnswer, correctAnswer, points, newsUrl }) => {
    // Зелёный для верного прогноза, серый для неверного. Красный сюда не годится: неугаданный
    // прогноз — это не ошибка пользователя и не сбой, а обычный исход.
    const accent = isWinner ? '#16a34a' : '#71717a';
    const verdict = isWinner ? 'Вы угадали' : 'В этот раз мимо';
    const eyebrow = 'Опрос завершён';

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Legio</title>
  <style>${EMAIL_STYLES}</style>
</head>
<body class="lg-page" style="margin:0;padding:0;width:100%;background-color:#f4f4f5;">

  <!-- Строка предпросмотра: исход виден ещё в списке входящих. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">
    ${escapeHtml(verdict)}${isWinner && points > 0 ? ` — начислено ${escapeHtml(points)} баллов` : ''}. Верный ответ: ${escapeHtml(correctAnswer)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="lg-page" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" class="lg-card" style="width:100%;max-width:520px;background-color:#ffffff;border:1px solid #e4e4e7;border-radius:24px;">

          <!-- Шапка -->
          <tr>
            <td class="lg-pad" style="padding:36px 40px 0;">
              <div class="lg-brand" style="font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-style:italic;font-size:30px;font-weight:500;letter-spacing:-0.5px;color:#18181b;line-height:1.1;">Legio</div>
              <div class="lg-muted" style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#a1a1aa;padding-top:6px;">Проверь свою интуицию</div>
            </td>
          </tr>
          <tr>
            <td class="lg-pad" style="padding:24px 40px 0;">
              <div class="lg-rule" style="border-top:1px solid #e4e4e7;font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>

          <!-- Вердикт и вопрос -->
          <tr>
            <td class="lg-pad" style="padding:28px 40px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
              <div style="font-size:11px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:${accent};">${escapeHtml(eyebrow)}</div>
              <h1 class="lg-title" style="margin:10px 0 0;font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;line-height:1.25;color:#18181b;">${escapeHtml(verdict)}</h1>
              <p class="lg-text" style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#52525b;">${escapeHtml(question)}</p>
            </td>
          </tr>

          <!-- Свой ответ и верный ответ -->
          <tr>
            <td class="lg-pad" style="padding:24px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="lg-panel" style="background-color:#fafafa;border:1px solid #e4e4e7;border-radius:16px;">
                <tr>
                  <td style="padding:18px 20px 14px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                    <div class="lg-muted" style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#a1a1aa;">Ваш ответ</div>
                    <div class="lg-code" style="font-size:15px;font-weight:600;line-height:1.5;color:#18181b;padding-top:5px;">${escapeHtml(userAnswer)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 20px;">
                    <div class="lg-rule" style="border-top:1px solid #e4e4e7;font-size:0;line-height:0;">&nbsp;</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 20px 18px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                    <div class="lg-muted" style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#a1a1aa;">Верный ответ</div>
                    <div style="font-size:15px;font-weight:600;line-height:1.5;color:${accent};padding-top:5px;">${escapeHtml(correctAnswer)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${isWinner && points > 0 ? `<!-- Начисление -->
          <tr>
            <td class="lg-pad" style="padding:16px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:16px;">
                <tr>
                  <td align="center" style="padding:18px 12px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                    <div style="font-size:26px;font-weight:700;color:#16a34a;line-height:1.1;">+${escapeHtml(points)}</div>
                    <div style="font-size:12px;color:#15803d;padding-top:6px;">баллов начислено за верный прогноз</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : ''}

          <!-- Ссылка на опрос -->
          <tr>
            <td class="lg-pad" style="padding:24px 40px 0;" align="center">
              <a href="${escapeHtml(newsUrl)}" style="display:inline-block;background-color:#18181b;color:#ffffff;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:999px;">Посмотреть результаты</a>
            </td>
          </tr>

          <!-- Подвал -->
          <tr>
            <td class="lg-pad" style="padding:28px 40px 32px;">
              <div class="lg-rule" style="border-top:1px solid #e4e4e7;font-size:0;line-height:0;">&nbsp;</div>
              <div class="lg-muted" style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#a1a1aa;padding-top:16px;">
                Письмо пришло, потому что вы голосовали в этом опросе.<br>
                <a href="https://legio.news" style="color:#a1a1aa;text-decoration:none;">legio.news</a>
                &nbsp;·&nbsp; © ${new Date().getFullYear()} Legio
              </div>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
};

const renderPollResultText = ({ isWinner, question, userAnswer, correctAnswer, points, newsUrl }) =>
    [
        'LEGIO',
        '',
        `Опрос завершён — ${isWinner ? 'вы угадали' : 'в этот раз мимо'}`,
        '',
        question,
        '',
        `Ваш ответ:    ${userAnswer}`,
        `Верный ответ: ${correctAnswer}`,
        ...(isWinner && points > 0 ? ['', `Начислено баллов: +${points}`] : []),
        '',
        `Результаты: ${newsUrl}`,
        '',
        'Письмо пришло, потому что вы голосовали в этом опросе.',
        'legio.news',
    ].join('\n');

/**
 * Письмо об итогах опроса одному участнику.
 *
 * @param {string} to             адрес получателя
 * @param {object} payload        { isWinner, question, userAnswer, correctAnswer, points, newsUrl }
 */
const sendPollResultEmail = async (to, payload) => {
    const data = {
        isWinner: Boolean(payload.isWinner),
        question: String(payload.question || 'Опрос'),
        userAnswer: String(payload.userAnswer || '—'),
        correctAnswer: String(payload.correctAnswer || '—'),
        points: Number(payload.points) || 0,
        newsUrl: String(payload.newsUrl || 'https://legio.news'),
    };

    // Тема письма отвечает на главный вопрос прямо в списке входящих: открывать письмо, чтобы
    // узнать «угадал или нет», не нужно.
    const subject = data.isWinner
        ? `Вы угадали — опрос завершён${data.points > 0 ? ` (+${data.points} баллов)` : ''} — Legio`
        : 'Опрос завершён — результат — Legio';

    return sendRawEmail({
        to,
        subject,
        html: renderPollResultEmail(data),
        text: renderPollResultText(data),
    });
};

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
//
// `eyebrow` — короткая надпись над заголовком: она же делает письма различимыми в списке входящих,
// когда их приходит несколько подряд.
const CODE_TEMPLATES = {
    register: {
        subject: 'Код подтверждения регистрации — Legio',
        eyebrow: 'Регистрация',
        title: 'Добро пожаловать в Legio',
        description: 'Остался один шаг: введите код на сайте, и аккаунт будет создан.',
    },
    login: {
        subject: 'Код для входа — Legio',
        eyebrow: 'Вход в аккаунт',
        title: 'Подтвердите вход',
        description: 'Кто-то входит в ваш аккаунт с паролем. Введите код, чтобы завершить вход.',
        footerNote: 'Если это были не вы — не вводите код и смените пароль.',
    },
    password_reset: {
        subject: 'Восстановление пароля — Legio',
        eyebrow: 'Восстановление пароля',
        title: 'Задайте новый пароль',
        description: 'Введите этот код на сайте, чтобы придумать новый пароль.',
    },
    password_change: {
        subject: 'Подтверждение смены пароля — Legio',
        eyebrow: 'Смена пароля',
        title: 'Подтвердите смену пароля',
        description: 'Введите код, чтобы сохранить новый пароль.',
        footerNote: 'Если это были не вы — срочно смените пароль и проверьте почту на взлом.',
    },
    email_change_current: {
        subject: 'Смена почты: подтверждение текущего адреса — Legio',
        eyebrow: 'Смена почты · шаг 1',
        title: 'Подтвердите текущий адрес',
        description: 'Прежде чем менять почту, подтвердите, что этот адрес по-прежнему ваш.',
    },
    email_change_new: {
        subject: 'Смена почты: подтверждение нового адреса — Legio',
        eyebrow: 'Смена почты · шаг 2',
        title: 'Подтвердите новый адрес',
        description: 'Введите код, чтобы этот адрес стал основным для вашего аккаунта.',
    },
    email_bind: {
        subject: 'Привязка почты — Legio',
        eyebrow: 'Привязка почты',
        title: 'Подтвердите адрес',
        description: 'Введите код, чтобы привязать этот адрес к аккаунту: он понадобится для восстановления пароля.',
    },
    mfa_enable: {
        subject: 'Включение входа по коду — Legio',
        eyebrow: 'Двухфакторная защита',
        title: 'Включить вход по коду',
        description: 'После включения при каждом входе мы будем присылать одноразовый код на эту почту.',
    },
    mfa_disable: {
        subject: 'Отключение входа по коду — Legio',
        eyebrow: 'Двухфакторная защита',
        title: 'Отключить вход по коду',
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
        eyebrow: 'Подтверждение',
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

module.exports = { sendCodeEmail, sendPollResultEmail, sendRawEmail, isMailerConfigured, CODE_TEMPLATES };
