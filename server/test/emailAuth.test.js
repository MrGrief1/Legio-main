// Тесты на правила одноразовых кодов. Модуль намеренно принимает доступ к базе параметрами,
// поэтому здесь поднимается настоящая SQLite в памяти со схемой auth_codes — без Express и без
// сети. Проверяются именно те инварианты, ради которых модуль и существует: одноразовость,
// лимит попыток, срок жизни, пауза между отправками и то, что провал отправки письма не гасит
// действующий код.

const test = require('node:test');
const assert = require('node:assert');
const BetterSqlite3 = require('better-sqlite3');

const { createEmailAuthService, AuthCodeError, maskEmail } = require('../emailAuth');

const SCHEMA = `
CREATE TABLE auth_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id TEXT UNIQUE,
  user_id INTEGER,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  payload TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`;

const setup = ({ sendResult = { ok: true }, allowUnsentCodes = false } = {}) => {
    const db = new BetterSqlite3(':memory:');
    db.exec(SCHEMA);

    const sent = [];
    const dbRunAsync = async (sql, params = []) => db.prepare(sql).run(...params);
    const dbGetAsync = async (sql, params = []) => db.prepare(sql).get(...params) || null;

    const service = createEmailAuthService({
        dbRunAsync,
        dbGetAsync,
        sendCodeEmail: async (to, purpose, code, ttlMinutes) => {
            sent.push({ to, purpose, code, ttlMinutes });
            return typeof sendResult === 'function' ? sendResult() : sendResult;
        },
        allowUnsentCodes,
    });

    return { db, service, sent };
};

test('код одноразовый: успешная проверка гасит его', async () => {
    const { service, sent } = setup();
    await service.issueCode({ userId: 1, email: 'a@example.com', purpose: 'login' });

    const result = await service.verifyCode({ userId: 1, purpose: 'login', code: sent[0].code });
    assert.strictEqual(result.userId, 1);

    await assert.rejects(
        () => service.verifyCode({ userId: 1, purpose: 'login', code: sent[0].code }),
        (err) => err instanceof AuthCodeError && err.code === 'CODE_NOT_FOUND'
    );
});

test('пятая неверная попытка гасит код целиком', async () => {
    const { service, sent } = setup();
    await service.issueCode({ userId: 1, email: 'a@example.com', purpose: 'login' });
    const wrong = sent[0].code === '000000' ? '111111' : '000000';

    for (let attempt = 1; attempt <= 4; attempt += 1) {
        await assert.rejects(
            () => service.verifyCode({ userId: 1, purpose: 'login', code: wrong }),
            (err) => err.code === 'CODE_INVALID' && err.attemptsLeft === 5 - attempt
        );
    }

    await assert.rejects(
        () => service.verifyCode({ userId: 1, purpose: 'login', code: wrong }),
        (err) => err.code === 'CODE_ATTEMPTS_EXCEEDED'
    );

    // Даже правильный код больше не принимается — иначе лимит обходился бы ожиданием.
    await assert.rejects(
        () => service.verifyCode({ userId: 1, purpose: 'login', code: sent[0].code }),
        (err) => err.code === 'CODE_NOT_FOUND'
    );
});

test('просроченный код отклоняется', async () => {
    const { db, service, sent } = setup();
    await service.issueCode({ userId: 1, email: 'a@example.com', purpose: 'login' });
    db.prepare("UPDATE auth_codes SET expires_at = datetime('now', '-1 minute')").run();

    await assert.rejects(
        () => service.verifyCode({ userId: 1, purpose: 'login', code: sent[0].code }),
        (err) => err.code === 'CODE_EXPIRED'
    );
});

test('повторная выдача отменяет предыдущий код', async () => {
    const { db, service, sent } = setup();
    await service.issueCode({ userId: 1, email: 'a@example.com', purpose: 'login' });
    // Пауза между отправками здесь не проверяется, поэтому сдвигаем время выдачи назад.
    db.prepare("UPDATE auth_codes SET created_at = datetime('now', '-5 minutes')").run();
    await service.issueCode({ userId: 1, email: 'a@example.com', purpose: 'login' });

    await assert.rejects(
        () => service.verifyCode({ userId: 1, purpose: 'login', code: sent[0].code }),
        (err) => err.code === 'CODE_INVALID' || err.code === 'CODE_NOT_FOUND'
    );

    const result = await service.verifyCode({ userId: 1, purpose: 'login', code: sent[1].code });
    assert.strictEqual(result.userId, 1);
});

test('пауза между отправками', async () => {
    const { service } = setup();
    await service.issueCode({ userId: 1, email: 'a@example.com', purpose: 'login' });

    await assert.rejects(
        () => service.issueCode({ userId: 1, email: 'a@example.com', purpose: 'login' }),
        (err) => err.code === 'CODE_COOLDOWN' && err.retryInSec > 0
    );
});

test('неудачная отправка не гасит действующий код', async () => {
    let ok = true;
    const { service, sent, db } = setup({ sendResult: () => ({ ok, reason: ok ? undefined : 'send-failed' }) });

    await service.issueCode({ userId: 1, email: 'a@example.com', purpose: 'login' });
    db.prepare("UPDATE auth_codes SET created_at = datetime('now', '-5 minutes')").run();

    ok = false;
    await assert.rejects(
        () => service.issueCode({ userId: 1, email: 'a@example.com', purpose: 'login' }),
        (err) => err.code === 'MAIL_SEND_FAILED'
    );

    // Первый код по-прежнему действует: пользователь, уже получивший письмо, не должен пострадать
    // из-за сбоя на стороне почтового сервиса.
    const result = await service.verifyCode({ userId: 1, purpose: 'login', code: sent[0].code });
    assert.strictEqual(result.userId, 1);
});

test('коды разных назначений не мешают друг другу', async () => {
    const { service, sent } = setup();
    await service.issueCode({ userId: 1, email: 'a@example.com', purpose: 'login' });
    await service.issueCode({ userId: 1, email: 'a@example.com', purpose: 'password_change' });

    await assert.rejects(
        () => service.verifyCode({ userId: 1, purpose: 'password_change', code: sent[0].code }),
        (err) => err.code === 'CODE_INVALID'
    );

    const result = await service.verifyCode({ userId: 1, purpose: 'password_change', code: sent[1].code });
    assert.strictEqual(result.purpose, 'password_change');
});

test('challengeId опознаёт попытку входа, payload переживает выдачу', async () => {
    const { service, sent } = setup();
    const challenge = await service.issueCode({
        email: 'a@example.com',
        purpose: 'register',
        payload: { name: 'Тест' },
    });

    const result = await service.verifyCode({ challengeId: challenge.challengeId, code: sent[0].code });
    assert.deepStrictEqual(result.payload, { name: 'Тест' });
});

test('код принимается только из шести цифр', async () => {
    const { service } = setup();
    await service.issueCode({ userId: 1, email: 'a@example.com', purpose: 'login' });

    for (const bad of ['', '12345', 'abcdef', '1234567']) {
        await assert.rejects(
            () => service.verifyCode({ userId: 1, purpose: 'login', code: bad }),
            (err) => err.code === 'CODE_INVALID'
        );
    }
});

test('маскировка адреса оставляет две первые буквы и домен', () => {
    assert.strictEqual(maskEmail('maksim@legio.news'), 'ma****@legio.news');
    assert.strictEqual(maskEmail('a@legio.news'), 'a*@legio.news');
});
