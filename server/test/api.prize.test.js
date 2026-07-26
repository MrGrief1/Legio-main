const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legio-prize-test-'));
process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = '0123456789abcdef0123456789abcdef';
process.env.DATABASE_PATH = path.join(tempDir, 'database.sqlite');

const { app } = require('../index');
const db = require('../database');

let server;
let baseUrl;

const getJson = async (pathname) => {
    const response = await fetch(`${baseUrl}${pathname}`);
    return { status: response.status, body: await response.json() };
};

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
});

const toSql = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

const PRIZE = 5000;
const now = new Date();
const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const lastMonthMid = toSql(new Date(thisMonthStart.getTime() - 10 * 86_400_000));

test.before(async () => {
    await db.ready;

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    await dbRun(
        "INSERT INTO users (id, username, name, password, role, points, level) VALUES (1, 'winner', 'Winner', 'x', 'user', 1000, 1)"
    );
    await dbRun(
        "INSERT INTO users (id, username, name, password, role, points, level) VALUES (2, 'runner', 'Runner Up', 'x', 'user', 1000, 1)"
    );

    // Last month closed with winner on 700 and runner-up on 300.
    await dbRun(
        "INSERT INTO points_history (user_id, points, calculation_date, comment, kind) VALUES (1, 700, ?, 'опрос', 'poll')",
        [lastMonthMid]
    );
    await dbRun(
        "INSERT INTO points_history (user_id, points, calculation_date, comment, kind) VALUES (2, 300, ?, 'опрос', 'poll')",
        [lastMonthMid]
    );
});

test.after(async () => {
    if (server) {
        await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
    await new Promise((resolve, reject) => db.close((err) => (err ? reject(err) : resolve())));
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('the winner of a closed month receives the flat prize, not their score', async () => {
    // Requesting the monthly board settles any month that has finished.
    const response = await getJson('/api/leaders/monthly');

    assert.equal(response.status, 200);
    assert.equal(response.body.prizePoints, PRIZE, 'the API must publish the flat prize amount');

    const winner = await dbGet('SELECT points FROM users WHERE id = 1');
    const runnerUp = await dbGet('SELECT points FROM users WHERE id = 2');

    assert.equal(winner.points, 1000 + PRIZE, 'the prize is 5000, not the 700 they scored');
    assert.equal(runnerUp.points, 1000, 'only the winner is paid');

    const ledger = await dbGet("SELECT points, comment, kind FROM points_history WHERE kind = 'prize'");
    assert.equal(ledger.points, PRIZE);
    assert.equal(ledger.kind, 'prize');
});

test('the prize does not count toward the next month it lands in', async () => {
    // The prize row is written with today's date. If it counted as ordinary points, the recipient
    // would lead the new month by 5000 before anyone had voted, and win it automatically.
    const response = await getJson('/api/leaders/monthly');

    assert.equal(response.status, 200);
    assert.deepEqual(
        response.body.leaders.map((row) => row.username),
        [],
        'the current month starts empty — a prize payout is not a score'
    );
    assert.equal(response.body.winner, null);
});

test('settling is idempotent — the prize is never paid twice', async () => {
    const before = await dbGet('SELECT points FROM users WHERE id = 1');

    for (let attempt = 0; attempt < 5; attempt += 1) {
        await getJson('/api/leaders/monthly');
        await getJson('/api/leaders/monthly?monthsAgo=2');
    }

    const after = await dbGet('SELECT points FROM users WHERE id = 1');
    assert.equal(after.points, before.points, 'repeat settlement must be a no-op');

    const count = await dbGet("SELECT COUNT(*) AS value FROM points_history WHERE kind = 'prize'");
    assert.equal(count.value, 1, 'exactly one prize row must exist');
});

test('a month nobody scored in is settled with no winner and no payout', async () => {
    // Every month in the lookback window is recorded, so a late-arriving points row cannot
    // retroactively win a month that has already been settled.
    const emptyMonth = new Date(Date.UTC(thisMonthStart.getUTCFullYear(), thisMonthStart.getUTCMonth() - 5, 1));
    const key = `${emptyMonth.getUTCFullYear()}-${String(emptyMonth.getUTCMonth() + 1).padStart(2, '0')}`;

    const row = await dbGet('SELECT user_id, points FROM monthly_prizes WHERE month = ?', [key]);

    assert.ok(row, 'the empty month must still be recorded as settled');
    assert.equal(row.user_id, null);
    assert.equal(row.points, 0);
});

test('every monthly figure agrees with the leaderboard and excludes the prize', async () => {
    // The prize row lands in the current month. If any endpoint summed it as ordinary monthly
    // points, a profile would claim "+5000 this month" for someone the leaderboard shows as having
    // scored nothing — the same number disagreeing with itself depending on where you look.
    const jwt = require('jsonwebtoken');
    const adminToken = jwt.sign({ id: 1, username: 'winner', role: 'admin' }, process.env.SECRET_KEY, { expiresIn: '1h' });
    await dbRun("UPDATE users SET role = 'admin' WHERE id = 1");

    const detail = await fetch(`${baseUrl}/api/admin/users/1`, {
        headers: { Authorization: `Bearer ${adminToken}` },
    }).then((res) => res.json());
    assert.equal(detail.stats.monthlyPoints, 0, 'admin detail must not count the prize as a score');

    const profile = await fetch(`${baseUrl}/api/users/1/profile`, {
        headers: { Authorization: `Bearer ${adminToken}` },
    }).then((res) => res.json());
    assert.equal(profile.stats.monthlyPoints, 0, 'public profile must agree');

    const leaders = await getJson('/api/leaders');
    const row = leaders.body.find((entry) => entry.id === 1);
    assert.equal(row.monthlyPoints, 0, 'the all-time list must agree too');
    assert.equal(row.points, 1000 + PRIZE, 'while the all-time total does include the prize');

    await dbRun("UPDATE users SET role = 'user' WHERE id = 1");
});

test('the closed month still reports who won it', async () => {
    const response = await getJson('/api/leaders/monthly?monthsAgo=2');

    assert.equal(response.status, 200);
    assert.equal(response.body.isCurrentMonth, false);
    assert.equal(response.body.winner.username, 'winner');
    assert.equal(response.body.winner.points, 700, 'the score that won it is still the score');
    assert.equal(response.body.awardedUserId, 1, 'and it is marked as paid');
    assert.ok(response.body.awardedAt);
});
