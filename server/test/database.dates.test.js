const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const BetterSqlite3 = require('better-sqlite3');

// База готовится до require('../database'): миграция дат отрабатывает на старте, поэтому
// «испорченные» строки должны уже лежать в файле, когда приложение его открывает.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legio-dates-test-'));
const dbPath = path.join(tempDir, 'database.sqlite');

const legacy = (iso) => new Date(iso).toString();
// Ровно в таком виде даты лежат в проде: Date.prototype.toString() из-под UTC-контейнера.
const PROD_LEGACY = 'Wed Sep 24 2025 23:33:44 GMT+0000 (Coordinated Universal Time)';

{
    const seed = new BetterSqlite3(dbPath);
    seed.exec(`
        CREATE TABLE news (
            id INTEGER PRIMARY KEY,
            title TEXT,
            created_at DATETIME
        );
        CREATE TABLE points_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            points INTEGER NOT NULL,
            calculation_date DATETIME,
            comment TEXT NOT NULL
        );
    `);
    const insertNews = seed.prepare('INSERT INTO news (id, title, created_at) VALUES (?, ?, ?)');
    insertNews.run(1, 'старая среда', legacy('2025-09-24T23:33:44Z'));
    insertNews.run(2, 'свежая суббота', legacy('2026-07-11T21:12:09Z'));
    insertNews.run(3, 'создана в приложении', '2026-08-18 15:44:47');
    insertNews.run(4, 'без даты', null);
    insertNews.run(5, 'строка из прода', PROD_LEGACY);
    seed.prepare('INSERT INTO points_history (user_id, points, calculation_date, comment) VALUES (?, ?, ?, ?)')
        .run(1, 100, legacy('2026-04-03T14:06:11Z'), 'win');
    seed.prepare('INSERT INTO points_history (user_id, points, calculation_date, comment) VALUES (?, ?, ?, ?)')
        .run(1, 50, 'Invalid Date', 'битая строка');
    seed.close();
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = dbPath;

const db = require('../database');

test.after(() => {
    db.close(() => { });
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('legacy Date.toString() значения приводятся к формату SQLite', async () => {
    await db.ready;

    const rows = db.prepare('SELECT id, created_at FROM news ORDER BY id').all();
    const byId = new Map(rows.map((row) => [row.id, row.created_at]));

    assert.equal(byId.get(1), '2025-09-24 23:33:44');
    assert.equal(byId.get(2), '2026-07-11 21:12:09');
    // Уже корректные значения не трогаем, NULL остаётся NULL.
    assert.equal(byId.get(3), '2026-08-18 15:44:47');
    assert.equal(byId.get(4), null);
    assert.equal(byId.get(5), '2025-09-24 23:33:44');
});

test('после миграции лента сортируется по дате, а не по дню недели', async () => {
    await db.ready;

    const order = db.prepare(
        `SELECT id FROM news
          ORDER BY COALESCE(datetime(created_at), created_at, '0000-00-00') DESC, id DESC`
    ).all().map((row) => row.id);

    // До миграции первым шёл id 1 ("Wed ..." сортируется выше "Sat ..." как текст).
    assert.deepEqual(order, [3, 2, 5, 1, 4]);
});

test('непарсящиеся даты обнуляются, остальные чинятся', async () => {
    await db.ready;

    const rows = db.prepare('SELECT points, calculation_date FROM points_history ORDER BY id').all();
    assert.equal(rows[0].calculation_date, '2026-04-03 14:06:11');
    assert.equal(rows[1].calculation_date, null);
});

test('копия базы снимается перед перезаписью дат', async () => {
    await db.ready;

    const backups = fs.readdirSync(tempDir).filter((name) => name.startsWith('pre-date-normalization-'));
    assert.equal(backups.length, 1);

    const backup = new BetterSqlite3(path.join(tempDir, backups[0]), { readonly: true });
    const before = backup.prepare('SELECT created_at FROM news WHERE id = 5').get().created_at;
    backup.close();

    // В копии лежат исходные значения — откатиться есть куда.
    assert.equal(before, PROD_LEGACY);
});
