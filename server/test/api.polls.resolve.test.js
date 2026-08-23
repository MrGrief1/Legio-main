const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legio-resolve-test-'));
process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = '0123456789abcdef0123456789abcdef';
process.env.DATABASE_PATH = path.join(tempDir, 'database.sqlite');

const { app } = require('../index');
const db = require('../database');

let server;
let baseUrl;
let adminToken;

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
});

const day = (offsetDays) =>
    new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

// id опроса == id новости, чтобы фикстуры читались без сверки таблиц.
const seedPoll = async (id, endsAt) => {
    await dbRun("INSERT INTO news (id, title, description) VALUES (?, ?, '')", [id, `Новость ${id}`]);
    await dbRun("INSERT INTO polls (id, news_id, question, ends_at) VALUES (?, ?, ?, ?)", [id, id, `Вопрос ${id}`, endsAt]);
    await dbRun("INSERT INTO poll_options (id, poll_id, text) VALUES (?, ?, 'Да')", [id * 10, id]);
    await dbRun("INSERT INTO poll_options (id, poll_id, text) VALUES (?, ?, 'Нет')", [id * 10 + 1, id]);
};

const resolvePoll = async (pollId, body) => {
    const response = await fetch(`${baseUrl}/api/polls/${pollId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
};

test.before(async () => {
    await db.ready;

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    await dbRun("INSERT INTO users (id, username, name, password, role) VALUES (1, 'chief', 'Chief', 'x', 'admin')");
    await dbRun("INSERT INTO users (id, username, name, password, role) VALUES (2, 'reader', 'Reader', 'x', 'user')");
    adminToken = jwt.sign({ id: 1, username: 'chief', role: 'admin' }, process.env.SECRET_KEY, { expiresIn: '1h' });

    await seedPoll(1, day(30));   // голосование идёт
    await seedPoll(2, day(30));   // голосование идёт, завершим досрочно
    await seedPoll(3, day(-5));   // срок вышел
    await seedPoll(4, null);      // срока нет (наследие переноса из WordPress)

    await dbRun("INSERT INTO votes (user_id, poll_id, option_id) VALUES (2, 2, 20)");
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('идущий опрос не завершается обычным кликом по варианту', async () => {
    const { status, body } = await resolvePoll(1, { correctOptionId: 10 });

    assert.equal(status, 400);
    assert.match(body.message, /ещё идёт/);
    const poll = await dbGet("SELECT is_resolved, correct_option_id FROM polls WHERE id = 1");
    assert.equal(poll.is_resolved, 0);
    assert.equal(poll.correct_option_id, null);
});

test('идущий опрос завершается досрочно с подтверждением', async () => {
    const { status } = await resolvePoll(2, { correctOptionId: 20, early: true });

    assert.equal(status, 200);
    const poll = await dbGet("SELECT is_resolved, correct_option_id, resolved_by FROM polls WHERE id = 2");
    assert.equal(poll.is_resolved, 1);
    assert.equal(poll.correct_option_id, 20);
    assert.equal(poll.resolved_by, 1);
});

test('опрос с вышедшим сроком завершается без флага досрочности', async () => {
    const { status } = await resolvePoll(3, { correctOptionId: 30 });

    assert.equal(status, 200);
    const poll = await dbGet("SELECT is_resolved, correct_option_id FROM polls WHERE id = 3");
    assert.equal(poll.is_resolved, 1);
    assert.equal(poll.correct_option_id, 30);
});

test('опрос без срока завершается в любой момент', async () => {
    const { status } = await resolvePoll(4, { correctOptionId: 40 });

    assert.equal(status, 200);
    const poll = await dbGet("SELECT is_resolved FROM polls WHERE id = 4");
    assert.equal(poll.is_resolved, 1);
});
