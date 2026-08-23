// Приём голосов: срок голосования и уже завершённый опрос.
//
// До этих проверок эндпоинт принимал любой голос: единственным ограничением был UNIQUE(user_id,
// poll_id) в базе. То есть срок голосования был просто подписью на карточке, а в завершённый
// опрос голоса продолжали приходить и меняли проценты уже после начисления баллов.
//
// Ключевой случай здесь — «срок наступил сегодня». Смысл срока — момент, когда приём голосов
// закрывается (день матча, о котором опрос), поэтому в сам этот день голосовать уже нельзя.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legio-vote-test-'));
process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = '0123456789abcdef0123456789abcdef';
process.env.DATABASE_PATH = path.join(tempDir, 'database.sqlite');

const { app } = require('../index');
const db = require('../database');

let server;
let baseUrl;
const tokens = {};

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
});

const day = (offsetDays) =>
    new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

// id опроса == id новости, чтобы фикстуры читались без сверки таблиц.
const seedPoll = async (id, endsAt, isResolved = 0) => {
    await dbRun("INSERT INTO news (id, title, description) VALUES (?, ?, '')", [id, `Новость ${id}`]);
    await dbRun(
        'INSERT INTO polls (id, news_id, question, ends_at, is_resolved) VALUES (?, ?, ?, ?, ?)',
        [id, id, `Вопрос ${id}`, endsAt, isResolved]
    );
    await dbRun("INSERT INTO poll_options (id, poll_id, text) VALUES (?, ?, 'Да')", [id * 10, id]);
    await dbRun("INSERT INTO poll_options (id, poll_id, text) VALUES (?, ?, 'Нет')", [id * 10 + 1, id]);
};

const vote = async (pollId, optionId, userId = 2) => {
    const response = await fetch(`${baseUrl}/api/polls/${pollId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[userId]}` },
        body: JSON.stringify({ optionId }),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
};

test.before(async () => {
    await db.ready;

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    for (const id of [2, 3, 4]) {
        await dbRun('INSERT INTO users (id, username, name, password, role) VALUES (?, ?, ?, ?, ?)',
            [id, `reader${id}`, `Reader ${id}`, 'x', 'user']);
        tokens[id] = jwt.sign({ id, username: `reader${id}`, role: 'user' }, process.env.SECRET_KEY, { expiresIn: '1h' });
    }

    await seedPoll(1, day(30));   // голосование идёт
    await seedPoll(2, day(-5));   // срок вышел
    await seedPoll(3, day(0));    // срок — сегодня
    await seedPoll(4, null);      // срока нет (наследие переноса из WordPress)
    await seedPoll(5, '', 0);     // пустая строка вместо срока — тот же перенос
    await seedPoll(6, day(30), 1); // уже завершён
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('голос принимается, пока срок не наступил', async () => {
    const { status } = await vote(1, 10);

    assert.equal(status, 200);
    const row = await dbGet('SELECT option_id FROM votes WHERE poll_id = 1 AND user_id = 2');
    assert.equal(row.option_id, 10);
});

test('после срока голос не принимается', async () => {
    const { status, body } = await vote(2, 20);

    assert.equal(status, 400);
    assert.match(body.message, /Голосование закрыто/);
    assert.equal(await dbGet('SELECT 1 AS ok FROM votes WHERE poll_id = 2'), null);
});

test('в день, указанный сроком, голосовать уже нельзя', async () => {
    const { status, body } = await vote(3, 30);

    assert.equal(status, 400);
    assert.match(body.message, /Голосование закрыто/);
    assert.equal(await dbGet('SELECT 1 AS ok FROM votes WHERE poll_id = 3'), null);
});

test('опрос без срока принимает голоса бессрочно', async () => {
    assert.equal((await vote(4, 40)).status, 200);
    // Пустая строка в ends_at — это «срока нет», а не «срок пуст»: без свёртки NULLIF такой опрос
    // считался бы просроченным с датой '', и все перенесённые опросы перестали бы принимать голоса.
    assert.equal((await vote(5, 50)).status, 200);
});

test('в завершённый опрос голос не принимается', async () => {
    const { status, body } = await vote(6, 60);

    assert.equal(status, 400);
    assert.match(body.message, /уже завершён/);
    assert.equal(await dbGet('SELECT 1 AS ok FROM votes WHERE poll_id = 6'), null);
});

test('вариант из чужого опроса не засчитывается', async () => {
    // Без этой проверки голосом за чужой option_id можно было попасть в «победители» опроса,
    // в котором такого варианта нет.
    const { status, body } = await vote(1, 40, 3);

    assert.equal(status, 400);
    assert.match(body.message, /does not belong/);
    assert.equal(await dbGet('SELECT 1 AS ok FROM votes WHERE poll_id = 1 AND user_id = 3'), null);
});

test('повторный голос по-прежнему отклоняется', async () => {
    const { status, body } = await vote(1, 11);

    assert.equal(status, 400);
    assert.match(body.message, /Already voted/);
});

test('несуществующий опрос отвечает 404, а не молча теряет голос', async () => {
    const { status } = await vote(9999, 1);

    assert.equal(status, 404);
});

test('лента отдаёт признак закрытого голосования, посчитанный сервером', async () => {
    const read = async (id) => {
        const response = await fetch(`${baseUrl}/api/news/${id}`);
        const body = await response.json();
        return body.poll;
    };

    assert.equal((await read(1)).voting_closed, false);
    assert.equal((await read(2)).voting_closed, true);
    assert.equal((await read(3)).voting_closed, true);
    assert.equal((await read(4)).voting_closed, false);
    assert.equal((await read(5)).voting_closed, false);
});
