const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legio-hardening-test-'));
process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = '0123456789abcdef0123456789abcdef';
process.env.DATABASE_PATH = path.join(tempDir, 'database.sqlite');

const mailer = require('../mailer');

// Перехват писем до загрузки приложения — см. api.security.test.js.
const sentCodes = [];
mailer.sendCodeEmail = async (to, purpose, code) => {
    sentCodes.push({ to, purpose, code });
    return { ok: true };
};

const { app, isOriginAllowed } = require('../index');
const db = require('../database');

const lastCodeFor = (purpose) => [...sentCodes].reverse().find((entry) => entry.purpose === purpose)?.code;

let server;
let baseUrl;

const request = async (pathname, { method = 'GET', json, headers = {} } = {}) => {
    const response = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers: {
            ...(json ? { 'Content-Type': 'application/json' } : {}),
            ...headers,
        },
        body: json ? JSON.stringify(json) : undefined,
    });

    const text = await response.text();
    let body = null;
    if (text) {
        try {
            body = JSON.parse(text);
        } catch {
            body = text;
        }
    }

    return { status: response.status, body, headers: response.headers };
};

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
});

const sign = (claims, options) => jwt.sign(claims, process.env.SECRET_KEY, options);

test.before(async () => {
    await db.ready;

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    await dbRun(
        `INSERT INTO users (id, username, name, password, role, points, level, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [201, 'root_admin', 'Root Admin', 'x', 'admin', 100, 1, '2024-01-01 00:00:00']
    );
    await dbRun(
        `INSERT INTO users (id, username, name, password, role, points, level, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [202, 'plain_user', 'Plain User', 'x', 'user', 50, 1, '2024-02-01 00:00:00']
    );
});

test.after(async () => {
    if (server) {
        await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
    await new Promise((resolve, reject) => db.close((err) => (err ? reject(err) : resolve())));
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('a token with no expiry is refused', async () => {
    // How every token was minted before expiry existed: valid signature, no `exp`, therefore a
    // credential that outlives any password change. It must not be accepted.
    const immortal = sign({ id: 201, username: 'root_admin', role: 'admin' });

    const response = await request('/api/auth/me', {
        headers: { Authorization: `Bearer ${immortal}` },
    });

    assert.equal(response.status, 401);
});

test('an expired token is refused', async () => {
    const stale = sign({ id: 201, username: 'root_admin', role: 'admin' }, { expiresIn: '-1h' });

    const response = await request('/api/auth/me', {
        headers: { Authorization: `Bearer ${stale}` },
    });

    assert.equal(response.status, 401);
});

test('an alg:none token is refused', async () => {
    // Algorithm confusion: an unsigned token claiming admin. Pinning algorithms kills it.
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const forged = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ id: 201, username: 'root_admin', role: 'admin', exp: 9_999_999_999 })}.`;

    const response = await request('/api/admin/users', {
        headers: { Authorization: `Bearer ${forged}` },
    });

    assert.equal(response.status, 401);
});

test('a freshly signed token carries an expiry and is accepted', async () => {
    const valid = sign({ id: 201, username: 'root_admin', role: 'admin' }, { expiresIn: '1h' });

    const response = await request('/api/auth/me', {
        headers: { Authorization: `Bearer ${valid}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.username, 'root_admin');
});

test('login issues a token that expires', async () => {
    const requested = await request('/api/auth/register', {
        method: 'POST',
        json: { name: 'Expiry Probe', email: 'expiry@example.com', password: 'StrongPass1' },
    });

    // Регистрация сама по себе токена не выдаёт — сначала код с почты.
    assert.equal(requested.status, 200);
    assert.equal(requested.body.requiresVerification, true);
    assert.equal(requested.body.token, undefined);

    const registered = await request('/api/auth/register/verify', {
        method: 'POST',
        json: { challengeId: requested.body.challengeId, code: lastCodeFor('register') },
    });

    assert.equal(registered.status, 200);

    const claims = jwt.decode(registered.body.token);
    assert.equal(typeof claims.exp, 'number', 'issued tokens must carry an exp claim');
    assert.ok(claims.exp > claims.iat, 'exp must be in the future relative to iat');
});

test('the last admin cannot be demoted', async () => {
    const adminToken = sign({ id: 201, username: 'root_admin', role: 'admin' }, { expiresIn: '1h' });

    const locked = await request('/api/admin/users/201/role', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        json: { role: 'user' },
    });

    assert.equal(locked.status, 400);

    // Promote a second admin, and the first may now step down.
    const promoted = await request('/api/admin/users/202/role', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        json: { role: 'admin' },
    });
    assert.equal(promoted.status, 200);

    const demoted = await request('/api/admin/users/201/role', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        json: { role: 'user' },
    });
    assert.equal(demoted.status, 200);

    // Put the fixture back so ordering between tests cannot matter.
    await dbRun("UPDATE users SET role = 'admin' WHERE id = 201");
    await dbRun("UPDATE users SET role = 'user' WHERE id = 202");
});

test('responses carry the hardened security headers', async () => {
    const response = await request('/api/leaders');
    const csp = response.headers.get('content-security-policy') || '';

    assert.match(csp, /script-src 'self'/);
    assert.ok(!csp.includes("script-src 'self' 'unsafe-inline'"), 'inline scripts must stay blocked');
    assert.ok(!csp.includes('aistudiocdn'), 'no third-party script CDN in the policy');
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /base-uri 'self'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
});

test('internal failures do not leak driver messages', async () => {
    // `sort` is validated against a whitelist, so a rejected value must come back as a 400 with a
    // field-scoped message — never a 500 quoting SQLite.
    const adminToken = sign({ id: 201, username: 'root_admin', role: 'admin' }, { expiresIn: '1h' });

    const response = await request('/api/admin/users?sort=nonexistent_column', {
        headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(response.status, 400);
    const serialized = JSON.stringify(response.body);
    assert.ok(!/SQLITE|no such column|syntax error/i.test(serialized), 'no driver detail in the response');
});

test('a same-origin request carrying an Origin header is served normally', async () => {
    // Vite marks the bundle and stylesheet with crossorigin, so the browser sends an Origin header
    // even when fetching the app's own assets. Treating that as cross-origin and rejecting it
    // served the frontend a JSON error body in place of its CSS/JS and blanked the site in
    // production. Same-origin must always pass, allowlist or not.
    const selfOrigin = baseUrl;

    const response = await request('/api/leaders', {
        headers: { Origin: selfOrigin },
    });

    assert.equal(response.status, 200, 'the app must be able to call its own API');
    assert.equal(response.headers.get('access-control-allow-origin'), selfOrigin);
    assert.ok(Array.isArray(response.body));
});

test('a foreign origin never causes a server error', async () => {
    const response = await request('/api/leaders', {
        headers: { Origin: 'https://evil.example' },
    });

    // The browser is the enforcement point: when the grant is withheld it refuses to expose the
    // body to the calling script. Answering 500 instead — which is what a thrown CORS error did —
    // is a self-inflicted outage for legitimate callers and buries real faults in the logs.
    assert.notEqual(response.status, 500, 'a policy decision must never surface as a server fault');
});

test('the CORS policy allows same-origin and refuses foreign origins in production', () => {
    // Exercised directly rather than over HTTP: the test process runs with NODE_ENV=test, so the
    // permissive development branch would mask the production rule this locks in.
    const selfOrigin = 'https://chat-production-677a.up.railway.app';
    const prod = { selfOrigin, isProduction: true, allowlist: null };

    assert.equal(
        isOriginAllowed({ ...prod, origin: selfOrigin }),
        true,
        'the app must always be allowed to fetch its own assets and API'
    );
    assert.equal(isOriginAllowed({ ...prod, origin: 'https://evil.example' }), false);
    // A lookalike host must not slip through on a prefix match.
    assert.equal(isOriginAllowed({ ...prod, origin: `${selfOrigin}.evil.example` }), false);
    // http:// на том же хосте пропускаем намеренно: вкладка, открытая по http, шлёт запросы
    // всё равно по TLS (CSP поднимает схему), но Origin остаётся с http — без этой ветки
    // на таком домене отваливались вход, регистрация и голосование.
    assert.equal(isOriginAllowed({ ...prod, origin: 'http://chat-production-677a.up.railway.app' }), true);
    // Послабление касается ровно того же хоста, а не любого http-источника.
    assert.equal(isOriginAllowed({ ...prod, origin: 'http://evil.example' }), false);
    assert.equal(isOriginAllowed({ ...prod, origin: 'http://chat-production-677a.up.railway.app.evil.example' }), false);

    // With an explicit allowlist, named origins pass and everything else still does not.
    const withList = { selfOrigin, isProduction: true, allowlist: ['https://legio.news'] };
    assert.equal(isOriginAllowed({ ...withList, origin: 'https://legio.news' }), true);
    assert.equal(isOriginAllowed({ ...withList, origin: 'https://evil.example' }), false);
    assert.equal(isOriginAllowed({ ...withList, origin: selfOrigin }), true, 'same-origin outranks the allowlist');

    // Development with no allowlist stays permissive, so local tooling is not blocked.
    assert.equal(
        isOriginAllowed({ selfOrigin, isProduction: false, allowlist: null, origin: 'http://localhost:5173' }),
        true
    );
});

test('an unknown /api path answers with JSON, not the SPA shell', async () => {
    const response = await request('/api/definitely-not-a-route');

    assert.equal(response.status, 404);
    assert.equal(response.body.message, 'Not found');
});

test('oversized JSON bodies are rejected before they reach a route', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Comfortably past the 256 kb cap, far below the old 10 mb one.
        body: JSON.stringify({ username: 'a'.repeat(400_000), password: 'StrongPass1' }),
    });

    assert.equal(response.status, 413);
});
