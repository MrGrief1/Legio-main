// Догрузка новостей со старого WordPress: добавляет посты, которых ещё нет, и ничего больше.
//
// Полный перенос (wordpress_sync.js) переписывает пользователей, голоса, лайки и историю баллов —
// на живой базе это стёрло бы всё, что накопилось в приложении. Здесь нет ни одного DELETE и ни
// одной записи в users/votes/likes/points_history: только INSERT в news, polls и poll_options.
//
// Запуск:  node import_wp_delta.js <путь к wp_delta.json> [--dry-run]
// JSON готовит scripts/wp_delta_extract.py.

const fs = require('fs');
const path = require('path');
const db = require('./database');
const {
  buildSearchText,
  mapCategoryToNewProject,
  parsePollMeta,
  sanitizeText,
  stripHtml,
} = require('./wordpress_sync');

// Максимальный id поста в дампе от 12 июля 2026, с которого делали первый перенос. Новости с
// меньшим или равным id приехали оттуда один в один; всё, что выше, приложение выдало себе само
// через AUTOINCREMENT. Значение проверяется ниже по фактическому числу строк, так что расхождение
// с реальностью остановит импорт, а не испортит данные.
const FIRST_IMPORT_MAX_WP_ID = 18457;
const FIRST_IMPORT_NEWS_COUNT = 2850;

// Обёртка из sqlite.js возвращает из run() саму себя, а импорту нужны lastInsertRowid и changes,
// поэтому здесь берётся исходный дескриптор better-sqlite3 — то же соединение, но полный API.
const sqlite = db.db;
const run = (sql, params = []) => sqlite.prepare(sql).run(...params);
const get = (sql, params = []) => sqlite.prepare(sql).get(...params);

// Строки старого сайта помечаются задним числом: у первого переноса id новости и id поста
// совпадали, поэтому здесь достаточно проставить wp_post_id = id — но только на том диапазоне,
// про который это доказуемо верно.
function backfillWpPostIds() {
  const imported = get(
    'SELECT COUNT(*) AS n FROM news WHERE id <= ?',
    [FIRST_IMPORT_MAX_WP_ID]
  ).n;

  if (imported !== FIRST_IMPORT_NEWS_COUNT) {
    throw new Error(
      `Ожидалось ${FIRST_IMPORT_NEWS_COUNT} новостей из первого переноса (id <= ${FIRST_IMPORT_MAX_WP_ID}), ` +
      `в базе ${imported}. Импорт остановлен: границу переносов нужно перепроверить вручную.`
    );
  }

  const info = run(
    'UPDATE news SET wp_post_id = id WHERE wp_post_id IS NULL AND id <= ?',
    [FIRST_IMPORT_MAX_WP_ID]
  );

  return info.changes;
}

function main() {
  const jsonPath = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');

  if (!jsonPath) {
    console.error('Usage: node import_wp_delta.js <wp_delta.json> [--dry-run]');
    process.exitCode = 1;
    return;
  }

  const payload = JSON.parse(fs.readFileSync(path.resolve(jsonPath), 'utf8'));
  const posts = Array.isArray(payload.posts) ? payload.posts : [];
  const pollMeta = parsePollMeta(payload.pollMeta || []);
  const correctAnswers = new Map(
    (payload.correctAnswers || [])
      .map((row) => [Number(row.post_id), Number(row.correct_answer_counter)])
      .filter(([postId, counter]) => postId && Number.isFinite(counter) && counter > 0)
  );

  console.log(`Дамп: ${payload.dumpCompletedAt || 'дата не указана'}; постов в файле: ${posts.length}`);

  const stats = { backfilled: 0, inserted: 0, skipped: 0, renumbered: 0, polls: 0 };

  sqlite.exec('PRAGMA busy_timeout = 15000');
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    stats.backfilled = backfillWpPostIds();

    for (const post of posts) {
      const wpId = Number(post.wpId);
      if (!wpId) continue;

      // Уже переносили — второй раз не заводим. Существующую строку не трогаем: в ней могут быть
      // правки, сделанные в приложении, и на неё уже ссылаются голоса.
      if (get('SELECT 1 AS ok FROM news WHERE wp_post_id = ?', [wpId])) {
        stats.skipped += 1;
        continue;
      }

      // Номер поста может быть уже занят новостью, созданной в приложении. Тогда пост получает
      // свободный id от AUTOINCREMENT, а связь со старым сайтом держится на wp_post_id.
      const idTaken = Boolean(get('SELECT 1 AS ok FROM news WHERE id = ?', [wpId]));
      if (idTaken) stats.renumbered += 1;

      const title = sanitizeText(post.title) || `Новость #${wpId}`;
      const description = stripHtml(post.content);
      const tags = Array.isArray(post.tags) ? post.tags.map(sanitizeText).filter(Boolean) : [];
      const category = sanitizeText(mapCategoryToNewProject(post.category || 'general')) || 'general';
      const meta = pollMeta.get(wpId);
      const source = (meta && meta.source) || '';
      const searchText = buildSearchText(title, description, tags);

      const columns = 'title, description, image, tags, category, source, created_at, search_text, wp_post_id';
      const values = [
        title,
        description,
        sanitizeText(post.image) || '',
        JSON.stringify(tags),
        category,
        source,
        post.date,
        searchText,
        wpId,
      ];

      const info = idTaken
        ? run(`INSERT INTO news (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, values)
        : run(`INSERT INTO news (id, ${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [wpId, ...values]);

      const newsId = idTaken ? Number(info.lastInsertRowid) : wpId;
      stats.inserted += 1;

      if (!meta || !meta.question || !Array.isArray(meta.options) || meta.options.length === 0) {
        continue;
      }

      // id опроса совпадает с id новости — так их связал первый перенос, и на это рассчитывает
      // выдача ленты.
      run(
        `INSERT INTO polls (id, news_id, question, correct_option_id, is_resolved, ends_at)
         VALUES (?, ?, ?, NULL, 0, ?)`,
        [newsId, newsId, meta.question, meta.endsAt || null]
      );

      const optionIdByCounter = new Map();
      for (const option of meta.options) {
        const optionInfo = run('INSERT INTO poll_options (poll_id, text) VALUES (?, ?)', [newsId, option.text]);
        optionIdByCounter.set(option.counter, Number(optionInfo.lastInsertRowid));
      }

      const correctCounter = correctAnswers.get(wpId);
      const correctOptionId = correctCounter ? optionIdByCounter.get(correctCounter) : null;
      if (correctOptionId) {
        run('UPDATE polls SET correct_option_id = ?, is_resolved = 1 WHERE id = ?', [correctOptionId, newsId]);
      }

      stats.polls += 1;
    }

    if (dryRun) {
      sqlite.exec('ROLLBACK');
      console.log('--dry-run: изменения откачены');
    } else {
      sqlite.exec('COMMIT');
    }
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }

  console.log(JSON.stringify(stats, null, 2));
  console.log('Итог:', JSON.stringify({
    news: get('SELECT COUNT(*) AS n FROM news').n,
    polls: get('SELECT COUNT(*) AS n FROM polls').n,
    users: get('SELECT COUNT(*) AS n FROM users').n,
    votes: get('SELECT COUNT(*) AS n FROM votes').n,
    points_history: get('SELECT COUNT(*) AS n FROM points_history').n,
  }));
}

db.ready
  .then(() => {
    main();
  })
  .catch((error) => {
    console.error('Импорт не выполнен:', error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close(() => { });
  });
