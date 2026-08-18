// Одноразовые коды подтверждения на почту.
//
// Одна таблица `auth_codes` обслуживает все сценарии (регистрация, второй фактор при входе,
// восстановление и смена пароля, смена и привязка почты) — они различаются только полем `purpose`.
// Держать это отдельным модулем, а не внутри index.js, стоит ради двух вещей: правила здесь
// одинаковы для всех сценариев (нельзя случайно забыть лимит попыток в одном из восьми маршрутов),
// и их можно проверить тестом, не поднимая всё приложение.
//
// Что модуль гарантирует:
//   * в базе лежит только SHA-256 кода — из дампа базы действующий код не достать;
//   * письмо уходит ДО записи в базу, поэтому неудачная отправка не гасит действующий код;
//   * выдача нового кода отменяет предыдущий того же назначения — иначе «выслать ещё раз»
//     оставляло бы несколько живых кодов сразу;
//   * лимит попыток и пауза между отправками — против перебора шестизначного кода и против
//     использования сайта как бесплатного отправителя писем.

const crypto = require('crypto');

const CODE_LENGTH = 6;
const DEFAULT_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

class AuthCodeError extends Error {
    constructor(code, message, extra = {}) {
        super(message);
        this.name = 'AuthCodeError';
        this.code = code;
        Object.assign(this, extra);
    }
}

// crypto.randomInt, а не Math.random: код — это секрет, и предсказуемый генератор здесь означал бы
// предсказуемый второй фактор.
const generateNumericCode = (length = CODE_LENGTH) => {
    let code = '';
    for (let i = 0; i < length; i += 1) {
        code += String(crypto.randomInt(0, 10));
    }
    return code;
};

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

// Сравнение постоянного времени: посимвольный `===` на коротком коде утечка небольшая, но
// бесплатная к устранению.
const codeMatches = (code, storedHash) => {
    const candidate = Buffer.from(hashCode(code), 'utf8');
    const expected = Buffer.from(String(storedHash || ''), 'utf8');
    if (candidate.length !== expected.length) return false;
    return crypto.timingSafeEqual(candidate, expected);
};

const maskEmail = (email) => {
    const value = String(email || '').trim();
    const at = value.indexOf('@');
    if (at <= 0) return value;
    const local = value.slice(0, at);
    const domain = value.slice(at + 1);
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
};

const toIsoExpiry = (ttlMinutes) => new Date(Date.now() + ttlMinutes * 60_000).toISOString();

/**
 * @param {object} deps
 * @param {(sql: string, params?: any[]) => Promise<any>} deps.dbRunAsync
 * @param {(sql: string, params?: any[]) => Promise<any>} deps.dbGetAsync
 * @param {(to: string, purpose: string, code: string, ttlMinutes: number) => Promise<{ok: boolean, reason?: string}>} deps.sendCodeEmail
 * @param {boolean} [deps.allowUnsentCodes] в разработке (нет RESEND_API_KEY) код печатается в лог,
 *   а не роняет запрос — иначе локально нельзя пройти ни один сценарий.
 */
const createEmailAuthService = ({ dbRunAsync, dbGetAsync, sendCodeEmail, allowUnsentCodes = false }) => {

    // Последний живой (не использованный и не просроченный) код по назначению.
    const findActiveCode = async ({ userId, email, purpose, challengeId }) => {
        if (challengeId) {
            return dbGetAsync(
                `SELECT * FROM auth_codes
                 WHERE challenge_id = ? AND consumed_at IS NULL
                 LIMIT 1`,
                [challengeId]
            );
        }

        if (userId) {
            return dbGetAsync(
                `SELECT * FROM auth_codes
                 WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL
                 ORDER BY id DESC LIMIT 1`,
                [userId, purpose]
            );
        }

        return dbGetAsync(
            `SELECT * FROM auth_codes
             WHERE email = ? AND purpose = ? AND consumed_at IS NULL
             ORDER BY id DESC LIMIT 1`,
            [String(email || '').toLowerCase(), purpose]
        );
    };

    const invalidatePrevious = async ({ userId, email, purpose }) => {
        if (userId) {
            await dbRunAsync(
                `UPDATE auth_codes SET consumed_at = CURRENT_TIMESTAMP
                 WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL`,
                [userId, purpose]
            );
            return;
        }
        await dbRunAsync(
            `UPDATE auth_codes SET consumed_at = CURRENT_TIMESTAMP
             WHERE email = ? AND purpose = ? AND consumed_at IS NULL`,
            [String(email || '').toLowerCase(), purpose]
        );
    };

    /**
     * Выдаёт код и отправляет его письмом.
     *
     * Порядок «сначала письмо, потом запись» неслучаен: если Resend недоступен, действующий код
     * должен остаться в силе, а пользователь — увидеть честную ошибку, а не «код отправлен» без
     * письма.
     *
     * @returns {Promise<{challengeId: string, expiresAt: string, maskedEmail: string, delivered: boolean}>}
     */
    const issueCode = async ({
        userId = null,
        email,
        purpose,
        payload = null,
        ttlMinutes = DEFAULT_TTL_MINUTES,
        cooldownSeconds = RESEND_COOLDOWN_SECONDS,
    }) => {
        const address = String(email || '').trim().toLowerCase();
        if (!address) {
            throw new AuthCodeError('NO_EMAIL', 'К аккаунту не привязана почта');
        }

        const existing = await findActiveCode({ userId, email: address, purpose });
        if (existing && cooldownSeconds > 0) {
            const issuedAt = new Date(`${String(existing.created_at).replace(' ', 'T')}Z`).getTime();
            const elapsed = (Date.now() - issuedAt) / 1000;
            if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < cooldownSeconds) {
                throw new AuthCodeError(
                    'CODE_COOLDOWN',
                    'Код уже отправлен. Подождите, прежде чем запрашивать новый.',
                    { retryInSec: Math.ceil(cooldownSeconds - elapsed) }
                );
            }
        }

        const code = generateNumericCode();
        const result = await sendCodeEmail(address, purpose, code, ttlMinutes);

        if (!result?.ok) {
            // Нет ключа Resend — это конфигурация разработки, а не сбой: пишем код в лог, чтобы
            // сценарий можно было пройти локально. Настоящий сбой отправки всегда ошибка.
            if (result?.reason === 'not-configured' && allowUnsentCodes) {
                console.warn(`[emailAuth] Код для ${address} (${purpose}): ${code}`);
            } else {
                throw new AuthCodeError(
                    'MAIL_SEND_FAILED',
                    'Не удалось отправить письмо с кодом. Попробуйте позже.'
                );
            }
        }

        await invalidatePrevious({ userId, email: address, purpose });

        const challengeId = crypto.randomUUID();
        const expiresAt = toIsoExpiry(ttlMinutes);

        await dbRunAsync(
            `INSERT INTO auth_codes (challenge_id, user_id, email, purpose, code_hash, payload, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [challengeId, userId, address, purpose, hashCode(code), payload ? JSON.stringify(payload) : null, expiresAt]
        );

        return {
            challengeId,
            expiresAt,
            maskedEmail: maskEmail(address),
            delivered: Boolean(result?.ok),
        };
    };

    /**
     * Проверяет код и гасит его. Успешная проверка одноразова — повтор того же кода не пройдёт.
     *
     * @returns {Promise<{userId: number|null, email: string, payload: any}>}
     */
    const verifyCode = async ({ userId = null, email = null, purpose = null, challengeId = null, code }) => {
        const submitted = String(code || '').trim();
        if (!/^\d{6}$/.test(submitted)) {
            throw new AuthCodeError('CODE_INVALID', 'Введите код из 6 цифр');
        }

        const row = await findActiveCode({ userId, email, purpose, challengeId });
        if (!row) {
            throw new AuthCodeError('CODE_NOT_FOUND', 'Код не найден или уже использован. Запросите новый.');
        }

        if (new Date(row.expires_at).getTime() <= Date.now()) {
            await dbRunAsync('UPDATE auth_codes SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
            throw new AuthCodeError('CODE_EXPIRED', 'Срок действия кода истёк. Запросите новый.');
        }

        if (!codeMatches(submitted, row.code_hash)) {
            const attempts = Number(row.attempts || 0) + 1;
            // На исчерпании попыток код гасится целиком: иначе лимит обходится ожиданием и
            // продолжением перебора того же кода.
            if (attempts >= MAX_ATTEMPTS) {
                await dbRunAsync(
                    'UPDATE auth_codes SET attempts = ?, consumed_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [attempts, row.id]
                );
                throw new AuthCodeError('CODE_ATTEMPTS_EXCEEDED', 'Слишком много неверных попыток. Запросите новый код.');
            }

            await dbRunAsync('UPDATE auth_codes SET attempts = ? WHERE id = ?', [attempts, row.id]);
            throw new AuthCodeError('CODE_INVALID', 'Неверный код', { attemptsLeft: MAX_ATTEMPTS - attempts });
        }

        await dbRunAsync('UPDATE auth_codes SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);

        let payload = null;
        if (row.payload) {
            try { payload = JSON.parse(row.payload); } catch { payload = null; }
        }

        return { userId: row.user_id, email: row.email, purpose: row.purpose, payload };
    };

    /**
     * Данные действующего кода без его погашения — чтобы «выслать ещё раз» могло повторить выдачу
     * с теми же данными, не заставляя клиент присылать пароль повторно. Сам код не возвращается:
     * в базе его и нет, только хеш.
     */
    const peekActiveCode = async ({ userId = null, email = null, purpose = null, challengeId = null }) => {
        const row = await findActiveCode({ userId, email, purpose, challengeId });
        if (!row) return null;
        if (new Date(row.expires_at).getTime() <= Date.now()) return null;

        let payload = null;
        if (row.payload) {
            try { payload = JSON.parse(row.payload); } catch { payload = null; }
        }

        return {
            userId: row.user_id,
            email: row.email,
            purpose: row.purpose,
            payload,
            expiresAt: row.expires_at,
            createdAt: row.created_at,
        };
    };

    // Просроченные и погашенные записи копятся вечно — таблица растёт на каждый вход.
    const purgeExpiredCodes = () => dbRunAsync(
        `DELETE FROM auth_codes
         WHERE expires_at < datetime('now', '-1 day')
            OR (consumed_at IS NOT NULL AND consumed_at < datetime('now', '-1 day'))`
    );

    return { issueCode, verifyCode, peekActiveCode, purgeExpiredCodes };
};

module.exports = {
    createEmailAuthService,
    AuthCodeError,
    maskEmail,
    generateNumericCode,
    hashCode,
    MAX_ATTEMPTS,
    DEFAULT_TTL_MINUTES,
    RESEND_COOLDOWN_SECONDS,
};
