// Опрос, закрытый без результата.
//
// Такое состояние появилось для опросов, у которых верного варианта нет и не будет: событие не
// разрешилось однозначно либо опрос приехал с прежнего сайта, где его так и не завершили.
//
// Главное, что здесь проверяется, — арифметика профиля. Голос в аннулированном опросе не должен
// считаться ни верным, ни ошибочным (иначе точность прогнозов падает у людей, которые ничего не
// угадывали неправильно) и не должен считаться ожидающим результата (иначе плитка «Ждут
// результата» показывает сотни опросов, закрытых навсегда).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legio-void-test-'));
process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = '0123456789abcdef0123456789abcdef';
process.env.DATABASE_PATH = path.join(tempDir, 'database.sqlite');

const { app } = require('../index');
const db = require('../database');

let server;
let baseUrl;
let adminToken;
let readerToken;

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
});

const day = (offsetDays) =>
    new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

const seedPoll = async (id, endsAt) => {
    await dbRun("INSERT INTO news (id, title, description) VALUES (?, ?, '')", [id, `Новость ${id}`]);
    await dbRun('INSERT INTO polls (id, news_id, question, ends_at) VALUES (?, ?, ?, ?)', [id, id, `Вопрос ${id}`, endsAt]);
    await dbRun("INSERT INTO poll_options (id, poll_id, text) VALUES (?, ?, 'Да')", [id * 10, id]);
    await dbRun("INSERT INTO poll_options (id, poll_id, text) VALUES (?, ?, 'Нет')", [id * 10 + 1, id]);
};

const profileStats = async (userId) => {
    const response = await fetch(`${baseUrl}/api/users/${userId}/profile`, {
        headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body = await response.json();
    return body.stats;
};

test.before(async () => {
    await db.ready;

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    await dbRun("INSERT INTO users (id, username, name, password, role) VALUES (1, 'chief', 'Chief', 'x', 'admin')");
    await dbRun("INSERT INTO users (id, username, name, password, role) VALUES (2, 'reader', 'Reader', 'x', 'user')");
    adminToken = jwt.sign({ id: 1, username: 'chief', role: 'admin' }, process.env.SECRET_KEY, { expiresIn: '1h' });
    readerToken = jwt.sign({ id: 2, username: 'reader', role: 'user' }, process.env.SECRET_KEY, { expiresIn: '1h' });

    await seedPoll(1, day(-5));   // завершим с победителем — читатель угадал
    await seedPoll(2, day(-5));   // аннулируем
    await seedPoll(3, day(30));   // останется открытым

    // Читатель голосует во всех трёх.
    await dbRun('INSERT INTO votes (user_id, poll_id, option_id) VALUES (2, 1, 10)');
    await dbRun('INSERT INTO votes (user_id, poll_id, option_id) VALUES (2, 2, 20)');
    await dbRun('INSERT INTO votes (user_id, poll_id, option_id) VALUES (2, 3, 30)');

    // Опрос 1 — с победителем, вариант тот же, за который голосовал читатель.
    await dbRun('UPDATE polls SET is_resolved = 1, correct_option_id = 10, resolved_at = CURRENT_TIMESTAMP WHERE id = 1');
    // Опрос 2 — закрыт без результата.
    await dbRun('UPDATE polls SET is_resolved = 1, is_void = 1, correct_option_id = NULL, resolved_at = CURRENT_TIMESTAMP WHERE id = 2');
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('аннулированный опрос не портит точность прогнозов', async () => {
    const stats = await profileStats(2);

    // Три голоса: один с объявленным победителем (угадал), один аннулированный, один открытый.
    assert.equal(stats.votesTotal, 3);
    // В знаменатель точности идёт только опрос с победителем.
    assert.equal(stats.votesResolved, 1);
    assert.equal(stats.votesCorrect, 1);
    assert.equal(stats.votesWrong, 0, 'голос в аннулированном опросе не должен считаться ошибкой');
    assert.equal(stats.accuracy, 100);
});

test('аннулированный опрос не висит в «ждут результата»', async () => {
    const stats = await profileStats(2);

    // Ждёт результата только по-настоящему открытый опрос №3. Если бы votesPending считался
    // вычитанием (votesTotal - votesResolved), здесь было бы 2.
    assert.equal(stats.votesPending, 1);
});

test('в аннулированный опрос нельзя проголосовать', async () => {
    const response = await fetch(`${baseUrl}/api/polls/2/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ optionId: 20 }),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.message, /уже завершён/);
});

test('лента помечает аннулированный опрос и не объявляет верный вариант', async () => {
    const response = await fetch(`${baseUrl}/api/news/2`);
    const body = await response.json();

    assert.equal(body.poll.is_void, true);
    assert.equal(body.poll.is_resolved, 1);
    assert.equal(body.poll.correct_option_id, null);
});

test('аннулированный опрос можно завершить по-настоящему, если исход стал известен', async () => {
    // Событие разрешилось позже — редакция проставляет верный вариант. Подтверждение досрочности
    // при этом не требуется: голосование закрыто самим аннулированием.
    const response = await fetch(`${baseUrl}/api/polls/2/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ correctOptionId: 20 }),
    });

    assert.equal(response.status, 200);
    const poll = await dbGet('SELECT is_resolved, is_void, correct_option_id FROM polls WHERE id = 2');
    assert.equal(poll.is_resolved, 1);
    assert.equal(poll.is_void, 0, 'флаг «без результата» должен сниматься');
    assert.equal(poll.correct_option_id, 20);

    // Теперь этот голос считается верным и попадает в точность.
    const stats = await profileStats(2);
    assert.equal(stats.votesResolved, 2);
    assert.equal(stats.votesCorrect, 2);
});

test('завершённый с победителем опрос переиграть по-прежнему нельзя', async () => {
    const response = await fetch(`${baseUrl}/api/polls/1/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ correctOptionId: 11 }),
    });

    assert.equal(response.status, 400);
    const poll = await dbGet('SELECT correct_option_id FROM polls WHERE id = 1');
    assert.equal(poll.correct_option_id, 10, 'верный вариант не должен меняться');
});
