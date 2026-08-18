const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legio-api-test-'));
process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = '0123456789abcdef0123456789abcdef';
process.env.DATABASE_PATH = path.join(tempDir, 'database.sqlite');
process.env.ALLOW_BOOTSTRAP_ADMIN = 'true';

const mailer = require('../mailer');

// Письма перехватываются до загрузки приложения: index.js вызывает mailer.sendCodeEmail в момент
// отправки, поэтому подмена метода на модуле работает и Resend в тестах не участвует.
const sentCodes = [];
mailer.sendCodeEmail = async (to, purpose, code) => {
    sentCodes.push({ to, purpose, code });
    return { ok: true };
};

const { app } = require('../index');
const db = require('../database');

const lastCodeFor = (purpose) => [...sentCodes].reverse().find((entry) => entry.purpose === purpose)?.code;

// Регистрация теперь двухшаговая: заявка + код с почты. Возвращает готовую сессию.
const registerVerifiedUser = async ({ name, email, password }) => {
    const requested = await requestJson('/api/auth/register', {
        method: 'POST',
        json: { name, email, password },
    });

    assert.equal(requested.status, 200);
    assert.equal(requested.body.requiresVerification, true);

    const verified = await requestJson('/api/auth/register/verify', {
        method: 'POST',
        json: { email, code: lastCodeFor('register') },
    });

    assert.equal(verified.status, 200);
    return verified.body;
};

let server;
let baseUrl;

const requestJson = async (pathname, {
    method = 'GET',
    json,
    headers = {},
} = {}) => {
    const response = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers: {
            ...(json ? { 'Content-Type': 'application/json' } : {}),
            ...headers,
        },
        body: json ? JSON.stringify(json) : undefined,
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : null;

    return {
        status: response.status,
        body,
    };
};

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) {
            reject(err);
            return;
        }
        resolve(row || null);
    });
});

test.before(async () => {
    await db.ready;

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));

    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
    if (server) {
        await new Promise((resolve, reject) => {
            server.close((err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }

    await new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });

    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('rejects weak passwords during registration', async () => {
    const response = await requestJson('/api/auth/register', {
        method: 'POST',
        json: {
            name: 'Weak User',
            email: 'weak@example.com',
            password: 'weakpass',
        },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.message, 'Validation failed');
    assert.ok(
        response.body.errors.some((error) => error.field === 'password'),
        'password validation error should be present'
    );
});

test('sanitizes stored news content before it reaches the feed', async () => {
    const session = await registerVerifiedUser({
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'StrongPass1',
    });

    assert.ok(session.token);

    const createNewsResponse = await requestJson('/api/news', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${session.token}`,
        },
        json: {
            title: 'Безопасная тестовая новость',
            description: '<script>alert(1)</script><b>Описание для безопасной ленты новостей</b>',
            image: '',
            tags: ['security'],
            category: 'general',
        },
    });

    assert.equal(createNewsResponse.status, 200);
    assert.equal(createNewsResponse.body.message, 'News created');

    const feedResponse = await requestJson('/api/feed');
    assert.equal(feedResponse.status, 200);

    const createdItem = feedResponse.body.find((item) => item.id === createNewsResponse.body.id);
    assert.ok(createdItem, 'created news item should be present in the feed');
    assert.ok(!createdItem.description.includes('<script'));
    assert.ok(!createdItem.description.includes('<b>'));
    assert.ok(createdItem.description.includes('Описание для безопасной ленты новостей'));
});

test('deduplicates daily visit metrics for the same visitor fingerprint', async () => {
    const headers = { 'User-Agent': 'legio-test-suite' };

    const firstVisit = await requestJson('/api/visit', {
        method: 'POST',
        headers,
    });
    const secondVisit = await requestJson('/api/visit', {
        method: 'POST',
        headers,
    });

    assert.equal(firstVisit.status, 200);
    assert.equal(firstVisit.body.message, 'Visit recorded');
    assert.equal(secondVisit.status, 200);
    assert.equal(secondVisit.body.message, 'Visit already recorded');

    const today = new Date().toISOString().split('T')[0];
    const row = await dbGet('SELECT count FROM visits WHERE date = ?', [today]);
    assert.equal(row.count, 1);
});

// --- Коды подтверждения на почту ---
//
// Проверяется не то, что письмо «ушло» (отправка подменена), а то, что без кода действие не
// проходит: именно это отличает новую схему от прежней, где хватало одного токена сессии.

test('вход со включённым вторым фактором не выдаёт токен без кода', async () => {
    const email = 'mfa.user@example.com';
    const password = 'StrongPass1';
    const session = await registerVerifiedUser({ name: 'MFA User', email, password });

    const requested = await requestJson('/api/user/security/mfa/request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        json: { enable: true },
    });
    assert.equal(requested.status, 200);

    const confirmed = await requestJson('/api/user/security/mfa/confirm', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        json: { enable: true, code: lastCodeFor('mfa_enable') },
    });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.mfaEmailEnabled, true);

    const login = await requestJson('/api/auth/login', {
        method: 'POST',
        json: { username: email, password },
    });

    assert.equal(login.status, 200);
    assert.equal(login.body.requires2fa, true);
    assert.equal(login.body.token, undefined, 'пароль подтверждён, но токен выдаётся только после кода');
    assert.ok(login.body.challengeId);

    const wrongCode = await requestJson('/api/auth/login/verify', {
        method: 'POST',
        json: { challengeId: login.body.challengeId, code: '000000' },
    });
    assert.equal(wrongCode.status, 400);
    assert.equal(wrongCode.body.token, undefined);

    const verified = await requestJson('/api/auth/login/verify', {
        method: 'POST',
        json: { challengeId: login.body.challengeId, code: lastCodeFor('login') },
    });
    assert.equal(verified.status, 200);
    assert.ok(verified.body.token);

    // Код одноразовый: повтор того же запроса не должен выдать вторую сессию.
    const replay = await requestJson('/api/auth/login/verify', {
        method: 'POST',
        json: { challengeId: login.body.challengeId, code: lastCodeFor('login') },
    });
    assert.equal(replay.status, 400);
});

test('смена пароля требует и текущий пароль, и код с почты', async () => {
    const email = 'pwd.user@example.com';
    const session = await registerVerifiedUser({
        name: 'Password User',
        email,
        password: 'StrongPass1',
    });

    const wrongCurrent = await requestJson('/api/user/security/password/request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        json: { currentPassword: 'WrongPass1' },
    });
    assert.equal(wrongCurrent.status, 400);
    assert.equal(wrongCurrent.body.code, 'CURRENT_PASSWORD_INVALID');

    const requested = await requestJson('/api/user/security/password/request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        json: { currentPassword: 'StrongPass1' },
    });
    assert.equal(requested.status, 200);
    assert.equal(requested.body.codeRequired, true);

    const withoutCode = await requestJson('/api/user/security/password/confirm', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        json: { currentPassword: 'StrongPass1', newPassword: 'NewStrongPass1' },
    });
    assert.equal(withoutCode.status, 400);

    const confirmed = await requestJson('/api/user/security/password/confirm', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        json: {
            currentPassword: 'StrongPass1',
            newPassword: 'NewStrongPass1',
            code: lastCodeFor('password_change'),
        },
    });
    assert.equal(confirmed.status, 200);

    const oldPassword = await requestJson('/api/auth/login', {
        method: 'POST',
        json: { username: email, password: 'StrongPass1' },
    });
    assert.equal(oldPassword.status, 400);

    const newPassword = await requestJson('/api/auth/login', {
        method: 'POST',
        json: { username: email, password: 'NewStrongPass1' },
    });
    assert.equal(newPassword.status, 200);
    assert.ok(newPassword.body.token);
});

test('смена почты проходит только через оба адреса', async () => {
    const email = 'move.me@example.com';
    const session = await registerVerifiedUser({
        name: 'Moving User',
        email,
        password: 'StrongPass1',
    });

    // Без подтверждения текущего адреса второй шаг закрыт — иначе украденной сессии хватило бы,
    // чтобы увести аккаунт на чужую почту.
    const withoutStage = await requestJson('/api/user/email/request-new', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        json: { email: 'moved@example.com' },
    });
    assert.equal(withoutStage.status, 403);
    assert.equal(withoutStage.body.code, 'STAGE_TOKEN_REQUIRED');

    await requestJson('/api/user/email/request-current', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        json: {},
    });

    const stage = await requestJson('/api/user/email/verify-current', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        json: { code: lastCodeFor('email_change_current') },
    });
    assert.equal(stage.status, 200);
    assert.ok(stage.body.stageToken);

    const requestedNew = await requestJson('/api/user/email/request-new', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        json: { email: 'moved@example.com', stageToken: stage.body.stageToken },
    });
    assert.equal(requestedNew.status, 200);

    const confirmed = await requestJson('/api/user/email/confirm', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        json: { code: lastCodeFor('email_change_new'), stageToken: stage.body.stageToken },
    });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.user.email, 'moved@example.com');

    // Логин у таких аккаунтов — сам адрес, поэтому он тоже переезжает.
    const loginWithNew = await requestJson('/api/auth/login', {
        method: 'POST',
        json: { username: 'moved@example.com', password: 'StrongPass1' },
    });
    assert.equal(loginWithNew.status, 200);
});

test('восстановление пароля не раскрывает, есть ли такой аккаунт', async () => {
    const known = await requestJson('/api/auth/forgot-password', {
        method: 'POST',
        json: { email: 'admin@example.com' },
    });

    const unknown = await requestJson('/api/auth/forgot-password', {
        method: 'POST',
        json: { email: 'nobody-here@example.com' },
    });

    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    assert.deepEqual(known.body, unknown.body);
});
