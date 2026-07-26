const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legio-leaders-test-'));
process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = '0123456789abcdef0123456789abcdef';
process.env.DATABASE_PATH = path.join(tempDir, 'database.sqlite');

const { app } = require('../index');
const db = require('../database');

let server;
let baseUrl;

const requestJson = async (pathname, { method = 'GET', json, headers = {} } = {}) => {
    const response = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers: {
            ...(json ? { 'Content-Type': 'application/json' } : {}),
            ...headers,
        },
        body: json ? JSON.stringify(json) : undefined,
    });

    // Auth rejections come back as express's plain-text sendStatus body, not JSON.
    const text = await response.text();
    let body = null;
    if (text) {
        try {
            body = JSON.parse(text);
        } catch {
            body = text;
        }
    }

    return { status: response.status, body };
};

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const pad = (n) => String(n).padStart(2, '0');
const sqlUtc = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

// Anchor the fixtures to the running month so the "current month" window always covers them.
const now = new Date();
const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const inThisMonth = sqlUtc(new Date(thisMonthStart.getTime() + 3_600_000));
const inLastMonth = sqlUtc(new Date(thisMonthStart.getTime() - 86_400_000));

let adminToken;

test.before(async () => {
    await db.ready;

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Seeded directly: going through /api/auth/register would trip the registration rate limiter.
    // alltime_king leads on the all-time total but earned nothing this month; month_hero is the
    // opposite — that split is exactly what the monthly event table has to get right.
    await dbRun(
        `INSERT INTO users (id, username, name, password, role, points, level, created_at, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [101, 'admin_boss', 'Admin Boss', 'x', 'admin', 500, 1, '2024-01-15 10:00:00', '2024-06-01 10:00:00']
    );
    await dbRun(
        `INSERT INTO users (id, username, name, password, role, points, level, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [102, 'alltime_king', 'Alltime King', 'x', 'user', 9000, 4, '2023-05-20 08:00:00']
    );
    await dbRun(
        `INSERT INTO users (id, username, name, password, role, points, level, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [103, 'month_hero', 'Month Hero', 'x', 'user', 700, 1, '2025-02-10 12:00:00']
    );

    // alltime_king's points are all historical; month_hero collected 450 inside this month.
    await dbRun(
        'INSERT INTO points_history (user_id, points, calculation_date, comment) VALUES (?, ?, ?, ?)',
        [102, 8000, inLastMonth, 'Прошлый месяц']
    );
    await dbRun(
        'INSERT INTO points_history (user_id, points, calculation_date, comment) VALUES (?, ?, ?, ?)',
        [103, 300, inThisMonth, 'Начисление баллов за победу в опросе № 1']
    );
    await dbRun(
        'INSERT INTO points_history (user_id, points, calculation_date, comment) VALUES (?, ?, ?, ?)',
        [103, 150, inThisMonth, 'Начисление баллов за победу в опросе № 2']
    );
    await dbRun(
        'INSERT INTO points_history (user_id, points, calculation_date, comment) VALUES (?, ?, ?, ?)',
        [101, 100, inThisMonth, 'Начисление баллов за победу в опросе № 3']
    );

    // A resolved poll month_hero got right, so the accuracy stat has something to chew on.
    await dbRun(
        `INSERT INTO news (id, title, description, image, tags, category, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [901, 'Старая новость', 'Описание', '', '[]', 'politika', '2024-03-01 09:00:00']
    );
    // The pair that discriminates the ordering bug: same calendar day, but the ISO-shaped row
    // (WordPress import) is the *earlier* one and the space-separated row (SQLite
    // CURRENT_TIMESTAMP) is the later one. Sorting these as raw strings puts 903 first, because
    // "T" (0x54) sorts above " " (0x20) and the clock time is never even reached. Only a parsed
    // comparison gets it right.
    await dbRun(
        `INSERT INTO news (id, title, description, image, tags, category, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [903, 'Новость ISO, раннее утро', 'Описание', '', '[]', 'sport', '2025-06-10T02:00:00']
    );
    await dbRun(
        `INSERT INTO news (id, title, description, image, tags, category, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [902, 'Новость SQLite, поздний вечер', 'Описание', '', '[]', 'sport', '2025-06-10 20:00:00']
    );

    await dbRun('INSERT INTO polls (id, news_id, question, correct_option_id, is_resolved) VALUES (?, ?, ?, ?, ?)', [801, 901, 'Кто победит?', 8011, 1]);
    await dbRun('INSERT INTO poll_options (id, poll_id, text) VALUES (?, ?, ?)', [8011, 801, 'Первый']);
    await dbRun('INSERT INTO poll_options (id, poll_id, text) VALUES (?, ?, ?)', [8012, 801, 'Второй']);
    await dbRun('INSERT INTO votes (user_id, poll_id, option_id, created_at) VALUES (?, ?, ?, ?)', [103, 801, 8011, inThisMonth]);
    await dbRun('INSERT INTO votes (user_id, poll_id, option_id, created_at) VALUES (?, ?, ?, ?)', [102, 801, 8012, inThisMonth]);
    await dbRun('INSERT INTO likes (user_id, news_id, created_at) VALUES (?, ?, ?)', [103, 901, inThisMonth]);

    adminToken = jwt.sign({ id: 101, username: 'admin_boss', role: 'admin' }, process.env.SECRET_KEY, { expiresIn: '1h' });
});

test.after(async () => {
    if (server) {
        await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
    await new Promise((resolve, reject) => db.close((err) => (err ? reject(err) : resolve())));
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('all-time leaderboard still ranks on total points and reports monthly points alongside', async () => {
    const response = await requestJson('/api/leaders');

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body));

    const king = response.body.find((row) => row.username === 'alltime_king');
    const hero = response.body.find((row) => row.username === 'month_hero');

    assert.equal(king.rank, 1, 'the all-time table must stay ranked by total points');
    assert.equal(king.monthlyPoints, 0, 'points earned before this month must not count toward it');
    assert.equal(hero.monthlyPoints, 450);
    assert.equal(hero.points, 700, 'the all-time tab keeps showing the running total');
});

test('monthly event leaderboard ranks on points earned this month and exposes the countdown', async () => {
    const response = await requestJson('/api/leaders/monthly');

    assert.equal(response.status, 200);

    const { body } = response;
    assert.equal(body.isCurrentMonth, true);
    assert.equal(body.winner.username, 'month_hero', 'the monthly winner is whoever scored most this month');
    assert.equal(body.winner.points, 450);
    assert.equal(body.winner.monthlyWins, 2);
    assert.equal(body.winner.totalPoints, 700);
    assert.equal(body.leaders.length, 2, 'only users who scored this month appear');
    assert.equal(body.leaders[1].username, 'admin_boss');
    assert.ok(!body.leaders.some((row) => row.username === 'alltime_king'), 'last month\'s points must not carry over');

    // The countdown must run to the first instant of next month.
    const periodEnd = new Date(body.periodEnd);
    assert.equal(periodEnd.getUTCDate(), 1);
    assert.equal(periodEnd.getUTCHours(), 0);
    assert.ok(body.msRemaining > 0 && body.msRemaining <= 31 * 86_400_000);
    assert.equal(body.month, `${thisMonthStart.getUTCFullYear()}-${pad(thisMonthStart.getUTCMonth() + 1)}`);
});

test('monthly leaderboard can look back at the month that already closed', async () => {
    const response = await requestJson('/api/leaders/monthly?monthsAgo=2');

    assert.equal(response.status, 200);
    assert.equal(response.body.isCurrentMonth, false);
    assert.equal(response.body.msRemaining, 0, 'a finished month has no time left on the clock');
    assert.equal(response.body.winner.username, 'alltime_king');
    assert.equal(response.body.winner.points, 8000);
});

test('monthly leaderboard rejects an out-of-range month', async () => {
    const response = await requestJson('/api/leaders/monthly?monthsAgo=999');
    assert.equal(response.status, 400);
});

test('admin user list sorts by registration date and carries the dates the panel shows', async () => {
    const newest = await requestJson('/api/admin/users?sort=created_at&order=desc', {
        headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(newest.status, 200);
    const seeded = newest.body.filter((row) => row.id >= 101 && row.id <= 103);
    assert.deepEqual(
        seeded.map((row) => row.username),
        ['month_hero', 'admin_boss', 'alltime_king'],
        'newest registration first'
    );
    assert.ok(seeded[0].created_at, 'created_at must reach the client');
    assert.equal(typeof seeded[0].votes_count, 'number');

    const oldest = await requestJson('/api/admin/users?sort=created_at&order=asc', {
        headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(oldest.status, 200);
    assert.deepEqual(
        oldest.body.filter((row) => row.id >= 101 && row.id <= 103).map((row) => row.username),
        ['alltime_king', 'admin_boss', 'month_hero']
    );
});

test('admin user list rejects an unknown sort key instead of splicing it into SQL', async () => {
    const response = await requestJson('/api/admin/users?sort=points%3B+DROP+TABLE+users', {
        headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(response.status, 400);
    const stillThere = await requestJson('/api/admin/users', {
        headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(stillThere.status, 200);
});

test('admin user detail returns the full profile, activity stats and points ledger', async () => {
    const response = await requestJson('/api/admin/users/103', {
        headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(response.status, 200);

    const { body } = response;
    assert.equal(body.username, 'month_hero');
    assert.equal(body.displayName, 'Month Hero');
    assert.equal(body.created_at, '2025-02-10 12:00:00');

    assert.equal(body.stats.votesTotal, 1);
    assert.equal(body.stats.votesCorrect, 1);
    assert.equal(body.stats.votesWrong, 0);
    assert.equal(body.stats.accuracy, 100);
    assert.equal(body.stats.likesGiven, 1);
    assert.equal(body.stats.monthlyPoints, 450);
    assert.equal(body.stats.monthlyRank, 1);
    assert.equal(body.stats.allTimeRank, 2, 'alltime_king is still ahead on the all-time table');
    assert.equal(body.pointsHistory.length, 2);
    assert.equal(body.pointsHistory[0].points, 150);
    assert.deepEqual(body.topCategories.map((c) => c.id), ['politika']);
    assert.equal(body.topCategories[0].label, 'Политика');
});

test('admin user detail reports a wrong prediction as wrong and leaves accuracy at zero', async () => {
    const response = await requestJson('/api/admin/users/102', {
        headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.stats.votesCorrect, 0);
    assert.equal(response.body.stats.votesWrong, 1);
    assert.equal(response.body.stats.accuracy, 0);
    assert.equal(response.body.stats.monthlyRank, null, 'no points this month means no monthly standing');
});

test('admin user detail 404s for a user that does not exist and 401s without a token', async () => {
    const missing = await requestJson('/api/admin/users/999999', {
        headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(missing.status, 404);

    const anonymous = await requestJson('/api/admin/users/103');
    assert.equal(anonymous.status, 401);
});

test('admin user detail is closed to non-admins', async () => {
    const userToken = jwt.sign({ id: 103, username: 'month_hero', role: 'user' }, process.env.SECRET_KEY, { expiresIn: '1h' });

    const response = await requestJson('/api/admin/users/101', {
        headers: { Authorization: `Bearer ${userToken}` },
    });

    assert.equal(response.status, 403);
});

test('feed orders latest news first across both stored date formats', async () => {
    const response = await requestJson('/api/feed?category=sport');

    assert.equal(response.status, 200);
    assert.deepEqual(
        response.body.map((item) => item.id),
        [902, 903],
        'the later post must lead — a raw string sort would put the ISO-shaped row first'
    );
});

test('a post with two polls still occupies a single feed slot', async () => {
    await dbRun('INSERT INTO polls (id, news_id, question, is_resolved) VALUES (?, ?, ?, ?)', [802, 901, 'Второй опрос', 0]);
    await dbRun('INSERT INTO poll_options (id, poll_id, text) VALUES (?, ?, ?)', [8021, 802, 'Вариант']);

    const response = await requestJson('/api/feed?category=politika');
    assert.equal(response.status, 200);

    const matches = response.body.filter((item) => item.id === 901);
    assert.equal(matches.length, 1, 'the news row must not be duplicated once per poll');

    // The "open polls" tab has to find the unresolved poll even though it is not the first one.
    const openOnly = await requestJson('/api/feed?category=politika&pollStatus=open');
    assert.equal(openOnly.status, 200);
    assert.equal(openOnly.body.length, 1);
    assert.equal(openOnly.body[0].poll.id, 802);
});
