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

const { app } = require('../index');
const db = require('../database');

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
            username: 'weak-user',
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
    const registerResponse = await requestJson('/api/auth/register', {
        method: 'POST',
        json: {
            username: 'admin-user',
            password: 'StrongPass1',
        },
    });

    assert.equal(registerResponse.status, 200);
    assert.ok(registerResponse.body.token);

    const createNewsResponse = await requestJson('/api/news', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${registerResponse.body.token}`,
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
