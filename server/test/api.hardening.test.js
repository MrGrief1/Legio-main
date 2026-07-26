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

const { app } = require('../index');
const db = require('../database');

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
    const registered = await request('/api/auth/register', {
        method: 'POST',
        json: { name: 'Expiry Probe', email: 'expiry@example.com', password: 'StrongPass1' },
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
