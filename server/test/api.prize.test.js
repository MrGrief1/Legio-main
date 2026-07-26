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

test('the winner is left a notification they can read once', async () => {
    const jwt = require('jsonwebtoken');
    const winnerToken = jwt.sign({ id: 1, username: 'winner', role: 'user' }, process.env.SECRET_KEY, { expiresIn: '1h' });
    const runnerToken = jwt.sign({ id: 2, username: 'runner', role: 'user' }, process.env.SECRET_KEY, { expiresIn: '1h' });

    const list = async (token) => {
        const response = await fetch(`${baseUrl}/api/notifications`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return { status: response.status, body: await response.json() };
    };

    const winnerInbox = await list(winnerToken);
    assert.equal(winnerInbox.status, 200);
    assert.equal(winnerInbox.body.length, 1, 'the winner is told about the prize');

    const notification = winnerInbox.body[0];
    assert.equal(notification.type, 'monthly_prize');
    assert.equal(notification.points, PRIZE, 'and it states the amount they actually received');
    // The prize belongs to the month that closed, i.e. the one before the current one.
    const closedMonth = new Date(Date.UTC(thisMonthStart.getUTCFullYear(), thisMonthStart.getUTCMonth() - 1, 1));
    const closedMonthKey = `${closedMonth.getUTCFullYear()}-${String(closedMonth.getUTCMonth() + 1).padStart(2, '0')}`;
    assert.equal(notification.meta.month, closedMonthKey);
    assert.equal(notification.meta.monthlyPoints, 700, 'and records the score that won it');
    assert.ok(notification.title);

    // Nobody else is notified.
    const runnerInbox = await list(runnerToken);
    assert.deepEqual(runnerInbox.body, [], 'the runner-up has nothing to read');

    // Dismissing it removes it from the unread list, and staying dismissed is the point — otherwise
    // the celebration would reappear on every page load forever.
    const markRead = await fetch(`${baseUrl}/api/notifications/${notification.id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${winnerToken}` },
    });
    assert.equal(markRead.status, 200);

    const afterRead = await list(winnerToken);
    assert.deepEqual(afterRead.body, [], 'read notifications do not come back');
});

test('a notification cannot be dismissed by another account', async () => {
    const jwt = require('jsonwebtoken');
    await dbRun(
        "INSERT INTO notifications (id, user_id, type, title, body, points, meta) VALUES (777, 1, 'monthly_prize', 'Тест', 'Тело', 5000, '{\"month\":\"1999-01\"}')"
    );

    const outsiderToken = jwt.sign({ id: 2, username: 'runner', role: 'user' }, process.env.SECRET_KEY, { expiresIn: '1h' });
    const attempt = await fetch(`${baseUrl}/api/notifications/777/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${outsiderToken}` },
    });

    // The update is scoped by user_id, so it reports success but changes nothing.
    assert.equal(attempt.status, 200);
    const row = await dbGet('SELECT read_at FROM notifications WHERE id = 777');
    assert.equal(row.read_at, null, "another user's notification stays unread");

    await dbRun('DELETE FROM notifications WHERE id = 777');
});

test('notifications require a session', async () => {
    const anonymous = await fetch(`${baseUrl}/api/notifications`);
    assert.equal(anonymous.status, 401);
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
