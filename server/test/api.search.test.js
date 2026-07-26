const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legio-search-test-'));
process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = '0123456789abcdef0123456789abcdef';
process.env.DATABASE_PATH = path.join(tempDir, 'database.sqlite');

const { app } = require('../index');
const db = require('../database');

let server;
let baseUrl;

const search = async (query) => {
    const response = await fetch(`${baseUrl}/api/feed?search=${encodeURIComponent(query)}`);
    const body = await response.json();
    return { status: response.status, ids: Array.isArray(body) ? body.map((item) => item.id) : body };
};

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
});

test.before(async () => {
    await db.ready;

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Inserted WITHOUT search_text, exactly like every row that predates the column and every row
    // the WordPress import wrote before it was taught to fill it in.
    const rows = [
        [301, 'Курс рубля укрепился', 'Аналитики обсуждают валютный рынок', '["Экономика","Финансы"]', 'ekonomika'],
        [302, 'Матч завершился вничью', 'Подробный разбор игры', '["Спорт"]', 'sport'],
        [303, 'Новый жилой комплекс', 'Застройщик сдал дом', '["Жилье","Экономика"]', 'zhile'],
        [304, 'Election results', 'Voters decided the outcome', '["Politics"]', 'politika'],
    ];

    for (const [id, title, description, tags, category] of rows) {
        await dbRun(
            `INSERT INTO news (id, title, description, image, tags, category, created_at)
             VALUES (?, ?, ?, '', ?, ?, '2026-01-0' || ?)`,
            [id, title, description, tags, category, id - 300]
        );
    }
});

test.after(async () => {
    if (server) {
        await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
    await new Promise((resolve, reject) => db.close((err) => (err ? reject(err) : resolve())));
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('search finds Cyrillic text typed in any case', async () => {
    // The original failure: SQLite's LIKE and LOWER only fold ASCII, so a stored "Курс" was only
    // findable by typing "Курс" — "курс" and "КУРС" returned nothing at all.
    for (const query of ['Курс', 'курс', 'КУРС', 'кУрС']) {
        const result = await search(query);
        assert.equal(result.status, 200);
        assert.deepEqual(result.ids, [301], `"${query}" must find the same post`);
    }
});

test('search matches tags, not just title and body', async () => {
    // "Спорт" appears only in the tag list of 302 — nowhere in its title or description.
    const byTag = await search('спорт');
    assert.deepEqual(byTag.ids, [302], 'a tag-only match must be found');

    // A tag shared by two posts returns both, newest first.
    const shared = await search('экономика');
    assert.deepEqual(shared.ids, [303, 301], 'both posts tagged Экономика, newest first');
});

test('multiple words all have to match', async () => {
    // AND, not OR: adding a word must narrow the result.
    assert.deepEqual((await search('курс рубля')).ids, [301]);
    assert.deepEqual((await search('рубля валютный')).ids, [301], 'words may come from title and body');
    assert.deepEqual((await search('курс матч')).ids, [], 'a word that matches nothing excludes the row');
});

test('search still works for Latin text', async () => {
    assert.deepEqual((await search('election')).ids, [304]);
    assert.deepEqual((await search('ELECTION')).ids, [304]);
    assert.deepEqual((await search('politics')).ids, [304], 'Latin tag match');
});

test('a search matching nothing returns an empty list, not everything', async () => {
    assert.deepEqual((await search('несуществующееслово')).ids, []);
});

test('LIKE wildcards typed by the user are treated as literal characters', async () => {
    // Without escaping, "%" would match every row — a user typing it would see the whole feed and
    // conclude the search is broken.
    assert.deepEqual((await search('%')).ids, []);
    assert.deepEqual((await search('_')).ids, []);
});

test('a newly created post is searchable by its tags immediately', async () => {
    const token = jwt.sign({ id: 901, username: 'author', role: 'admin' }, process.env.SECRET_KEY, { expiresIn: '1h' });
    await dbRun(
        "INSERT INTO users (id, username, name, password, role, points, level) VALUES (901, 'author', 'Author', 'x', 'admin', 0, 1)"
    );

    const created = await fetch(`${baseUrl}/api/news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            title: 'Заголовок без ключевого слова',
            description: 'Описание тоже без него, ключ только в теге',
            image: '',
            tags: ['Криптовалюта'],
            category: 'kriptovalyuta',
        }),
    });

    assert.equal(created.status, 200);
    const { id } = await created.json();

    // Written at insert time, not by the startup backfill.
    const stored = await dbGet('SELECT search_text FROM news WHERE id = ?', [id]);
    assert.ok(stored.search_text.includes('криптовалюта'), 'the tag is folded into the index on write');

    assert.deepEqual((await search('КРИПТОВАЛЮТА')).ids, [id]);
});

test('rows written without an index get indexed and become searchable', async () => {
    // Every fixture in this file was inserted with no search_text — the state of every row that
    // predates the column and of anything an import wrote. Cyrillic search cannot fall back to
    // LOWER() in SQL, so the search path indexes them first; searching must not silently miss them.
    await dbRun(
        `INSERT INTO news (id, title, description, image, tags, category, created_at)
         VALUES (399, 'Прогноз погоды на выходные', 'Синоптики обещают тепло', '', '["Общество"]', 'obshhestvo', '2026-01-09')`
    );

    const beforeSearch = await dbGet('SELECT search_text FROM news WHERE id = 399');
    assert.equal(beforeSearch.search_text, null, 'inserted with no index, on purpose');

    // Lowercase query against a capitalised stored word — the exact case that used to return nothing.
    assert.deepEqual((await search('прогноз')).ids, [399]);

    const afterSearch = await dbGet('SELECT search_text FROM news WHERE id = 399');
    assert.ok(afterSearch.search_text, 'the row is indexed rather than left unsearchable');
    assert.ok(afterSearch.search_text.includes('общество'), 'and its tag is part of the index');
});
