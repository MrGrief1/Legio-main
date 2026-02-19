const DEFAULT_POINTS_SETTINGS = {
  start_points: 100,
  wins_points: 100,
  level_points: 1000,
};

const WP_LEVEL_THRESHOLDS = [
  { min: 50000, level: 6 },
  { min: 30000, level: 5 },
  { min: 9000, level: 4 },
  { min: 3000, level: 3 },
  { min: 1000, level: 2 },
  { min: 0, level: 1 },
];

function isWordpressSyncConfigured() {
  return Boolean(process.env.WP_DB_HOST && process.env.WP_DB_USER && process.env.WP_DB_NAME);
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function getSyncConfig() {
  if (!isWordpressSyncConfigured()) {
    return null;
  }

  const prefix = String(process.env.WP_DB_PREFIX || 'wp_');
  if (!/^[a-zA-Z0-9_]+$/.test(prefix)) {
    throw new Error('WP_DB_PREFIX contains unsupported characters');
  }

  return {
    host: process.env.WP_DB_HOST,
    port: Number(process.env.WP_DB_PORT || 3306),
    user: process.env.WP_DB_USER,
    password: process.env.WP_DB_PASSWORD || '',
    database: process.env.WP_DB_NAME,
    prefix,
  };
}

function mysqlTable(prefix, name) {
  return `\`${prefix}${name}\``;
}

function sqliteRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function sqliteAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function mysqlSafeQuery(connection, sql, params = []) {
  try {
    const [rows] = await connection.query(sql, params);
    return rows || [];
  } catch (error) {
    if (error && (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR')) {
      return [];
    }
    throw error;
  }
}

function cleanDate(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('0000-00-00')) {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
  return raw;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseRoleFromCapabilities(capabilities) {
  const serialized = String(capabilities || '').toLowerCase();
  if (!serialized) return 'user';
  if (serialized.includes('administrator')) return 'admin';
  if (serialized.includes('editor') || serialized.includes('author')) return 'creator';
  return 'user';
}

function calculateLevel(points) {
  const safePoints = Number.isFinite(Number(points)) ? Number(points) : 0;
  for (const tier of WP_LEVEL_THRESHOLDS) {
    if (safePoints >= tier.min) {
      return tier.level;
    }
  }
  return 1;
}

function fallbackAvatar(seed) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed || 'user')}`;
}

function mapCategoryToNewProject(rawValue) {
  const value = sanitizeText(rawValue).toLowerCase();
  if (!value) return 'general';

  const map = [
    { key: 'avto', needles: ['avto', 'auto', 'авто'] },
    { key: 'bankovskij-sektor', needles: ['bankovskij-sektor', 'finance', 'bank', 'финанс', 'банк'] },
    { key: 'zhile', needles: ['zhile', 'housing', 'realty', 'жиль', 'недвиж'] },
    { key: 'zdorove', needles: ['zdorove', 'health', 'мед', 'здоров'] },
    { key: 'kino', needles: ['kino', 'cinema', 'movie', 'кино', 'сериал'] },
    { key: 'kriptovalyuta', needles: ['kriptovalyuta', 'crypto', 'bitcoin', 'крипт', 'биткоин'] },
    { key: 'obshhestvo', needles: ['obshhestvo', 'society', 'обще'] },
    { key: 'politika', needles: ['politika', 'politics', 'policy', 'полит'] },
    { key: 'semya', needles: ['semya', 'family', 'семь'] },
    { key: 'sport', needles: ['sport', 'спорт'] },
    { key: 'turizm', needles: ['turizm', 'tourism', 'travel', 'тури', 'путеш'] },
    { key: 'ekologiya', needles: ['ekologiya', 'ecology', 'eco', 'эколог'] },
    { key: 'ekonomika', needles: ['ekonomika', 'economy', 'эконом'] },
    { key: 'blagoustrojstvo', needles: ['blagoustrojstvo', 'благоустрой'] },
    { key: 'bez-rubriki', needles: ['bez-rubriki', 'uncategorized', 'без рубрики'] },
  ];

  for (const entry of map) {
    if (entry.needles.some((needle) => value.includes(needle))) {
      return entry.key;
    }
  }

  // Preserve unknown slugs from old WP if they are URL-safe.
  if (/^[a-z0-9-]+$/.test(value)) {
    return value;
  }

  return 'general';
}

function parsePollMeta(metaRows) {
  const polls = new Map();

  for (const row of metaRows) {
    const postId = Number(row.post_id);
    if (!postId) continue;

    if (!polls.has(postId)) {
      polls.set(postId, {
        question: '',
        optionsByIndex: new Map(),
      });
    }

    const poll = polls.get(postId);
    const metaKey = String(row.meta_key || '');
    const metaValue = sanitizeText(row.meta_value || '');

    if (metaKey === 'question') {
      poll.question = metaValue;
      continue;
    }

    const answerMatch = metaKey.match(/^answers_(\d+)_answer$/);
    if (answerMatch) {
      const index = Number(answerMatch[1]);
      const option = poll.optionsByIndex.get(index) || { index, counter: index + 1, text: '' };
      option.text = metaValue;
      poll.optionsByIndex.set(index, option);
      continue;
    }

    const counterMatch = metaKey.match(/^answers_(\d+)_counter$/);
    if (counterMatch) {
      const index = Number(counterMatch[1]);
      const option = poll.optionsByIndex.get(index) || { index, counter: index + 1, text: '' };
      const parsedCounter = Number(metaValue);
      option.counter = Number.isFinite(parsedCounter) && parsedCounter > 0 ? parsedCounter : index + 1;
      poll.optionsByIndex.set(index, option);
    }
  }

  const normalized = new Map();
  for (const [postId, poll] of polls.entries()) {
    const options = Array.from(poll.optionsByIndex.values())
      .filter((option) => option.text)
      .sort((a, b) => {
        if (a.counter === b.counter) return a.index - b.index;
        return a.counter - b.counter;
      });

    normalized.set(postId, {
      question: poll.question,
      options,
    });
  }

  return normalized;
}

async function getPointsSettings(connection, prefix) {
  const table = mysqlTable(prefix, 'points_settings');
  const rows = await mysqlSafeQuery(
    connection,
    `SELECT start_points, wins_points, level_points FROM ${table} ORDER BY id ASC LIMIT 1`
  );

  const base = rows[0] || {};
  return {
    start_points: Number(base.start_points) || DEFAULT_POINTS_SETTINGS.start_points,
    wins_points: Number(base.wins_points) || DEFAULT_POINTS_SETTINGS.wins_points,
    level_points: Number(base.level_points) || DEFAULT_POINTS_SETTINGS.level_points,
  };
}

async function upsertPointsSettings(db, settings) {
  await sqliteRun(
    db,
    `INSERT INTO points_settings (id, start_points, wins_points, level_points, updated_at)
     VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       start_points = excluded.start_points,
       wins_points = excluded.wins_points,
       level_points = excluded.level_points,
       updated_at = CURRENT_TIMESTAMP`,
    [settings.start_points, settings.wins_points, settings.level_points]
  );
}

async function clearTargetTables(db) {
  await sqliteRun(db, 'BEGIN TRANSACTION');
  try {
    const clearSql = [
      'DELETE FROM message_attachments',
      'DELETE FROM messages',
      'DELETE FROM chat_participants',
      'DELETE FROM chats',
      'DELETE FROM blocked_users',
      'DELETE FROM votes',
      'DELETE FROM poll_options',
      'DELETE FROM polls',
      'DELETE FROM likes',
      'DELETE FROM error_reports',
      'DELETE FROM news',
      'DELETE FROM points_history',
      'DELETE FROM users',
    ];

    for (const sql of clearSql) {
      await sqliteRun(db, sql);
    }

    await sqliteRun(db, 'COMMIT');
  } catch (error) {
    await sqliteRun(db, 'ROLLBACK');
    throw error;
  }
}

async function loadUsers(connection, prefix) {
  const usersTable = mysqlTable(prefix, 'users');
  const userMetaTable = mysqlTable(prefix, 'usermeta');
  const pollPointsTable = mysqlTable(prefix, 'poll_points');
  const capabilitiesKey = `${prefix}capabilities`;

  const users = await mysqlSafeQuery(
    connection,
    `SELECT
      u.ID AS id,
      u.user_login,
      u.user_email,
      u.user_pass,
      u.display_name,
      u.user_registered,
      MAX(CASE WHEN um.meta_key = ? THEN um.meta_value END) AS capabilities,
      MAX(CASE WHEN um.meta_key = 'vk_avatar_url' THEN um.meta_value END) AS avatar_url
    FROM ${usersTable} u
    LEFT JOIN ${userMetaTable} um ON um.user_id = u.ID
    GROUP BY u.ID, u.user_login, u.user_email, u.user_pass, u.display_name, u.user_registered`,
    [capabilitiesKey]
  );

  const pointsRows = await mysqlSafeQuery(
    connection,
    `SELECT user_id, points, level FROM ${pollPointsTable}`
  );
  const pointsByUserId = new Map(
    pointsRows.map((row) => [Number(row.user_id), row])
  );

  return users.map((user) => {
    const pointsRow = pointsByUserId.get(Number(user.id));
    return {
      ...user,
      poll_points: pointsRow?.points,
      poll_level: pointsRow?.level,
    };
  });
}

async function importUsers(db, users, settings) {
  const existingRows = await sqliteAll(
    db,
    'SELECT id, LOWER(username) AS username, LOWER(name) AS name FROM users'
  );
  const usernameOwners = new Map();
  const nameOwners = new Map();
  for (const row of existingRows) {
    if (row.username) usernameOwners.set(row.username, Number(row.id));
    if (row.name) nameOwners.set(row.name, Number(row.id));
  }

  let admins = 0;

  for (const user of users) {
    const userId = Number(user.id);
    if (!userId) continue;

    let username = sanitizeText(user.user_login || user.user_email || `user_${userId}`) || `user_${userId}`;
    let usernameLower = username.toLowerCase();
    const usernameOwner = usernameOwners.get(usernameLower);
    if (usernameOwner && usernameOwner !== userId) {
      username = `${username}_${userId}`;
      usernameLower = username.toLowerCase();
    }
    usernameOwners.set(usernameLower, userId);

    const baseName = sanitizeText(user.display_name || username) || username;
    let name = baseName;
    let nameSuffix = 1;
    while (nameOwners.has(name.toLowerCase()) && nameOwners.get(name.toLowerCase()) !== userId) {
      name = `${baseName} #${nameSuffix}`;
      nameSuffix += 1;
    }
    nameOwners.set(name.toLowerCase(), userId);

    const role = parseRoleFromCapabilities(user.capabilities);
    if (role === 'admin') admins += 1;

    const points = Number.isFinite(Number(user.poll_points))
      ? Number(user.poll_points)
      : settings.start_points;

    const level = Number.isFinite(Number(user.poll_level)) && Number(user.poll_level) > 0
      ? Number(user.poll_level)
      : calculateLevel(points);

    const avatar = sanitizeText(user.avatar_url) || fallbackAvatar(username);

    await sqliteRun(
      db,
      `INSERT INTO users (id, username, password, role, points, level, avatar, name, bio, birthdate, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)
       ON CONFLICT(id) DO UPDATE SET
         username = excluded.username,
         password = excluded.password,
         role = excluded.role,
         points = excluded.points,
         level = excluded.level,
         avatar = excluded.avatar,
         name = excluded.name,
         created_at = excluded.created_at`,
      [
        userId,
        username,
        String(user.user_pass || ''),
        role,
        points,
        level,
        avatar,
        name,
        cleanDate(user.user_registered),
      ]
    );
  }

  if (admins === 0) {
    const firstUser = await sqliteAll(db, 'SELECT id FROM users ORDER BY id ASC LIMIT 1');
    if (firstUser.length > 0) {
      await sqliteRun(db, 'UPDATE users SET role = ? WHERE id = ?', ['admin', firstUser[0].id]);
    }
  }
}

async function loadPosts(connection, prefix) {
  const postsTable = mysqlTable(prefix, 'posts');

  return mysqlSafeQuery(
    connection,
    `SELECT ID AS id, post_title, post_content, post_date
     FROM ${postsTable}
     WHERE post_type = 'post' AND post_status = 'publish'
     ORDER BY post_date DESC`
  );
}

async function loadFeaturedImages(connection, prefix) {
  const postsTable = mysqlTable(prefix, 'posts');
  const postMetaTable = mysqlTable(prefix, 'postmeta');

  const rows = await mysqlSafeQuery(
    connection,
    `SELECT pm.post_id, MAX(att.guid) AS image_url
     FROM ${postMetaTable} pm
     JOIN ${postsTable} p ON p.ID = pm.post_id
     JOIN ${postsTable} att ON att.ID = CAST(pm.meta_value AS UNSIGNED)
     WHERE p.post_type = 'post' AND p.post_status = 'publish' AND pm.meta_key = '_thumbnail_id'
     GROUP BY pm.post_id`
  );

  const map = new Map();
  for (const row of rows) {
    const postId = Number(row.post_id);
    if (postId) {
      map.set(postId, sanitizeText(row.image_url));
    }
  }

  return map;
}

async function loadTaxonomy(connection, prefix) {
  const postsTable = mysqlTable(prefix, 'posts');
  const termRelationshipsTable = mysqlTable(prefix, 'term_relationships');
  const termTaxonomyTable = mysqlTable(prefix, 'term_taxonomy');
  const termsTable = mysqlTable(prefix, 'terms');

  const rows = await mysqlSafeQuery(
    connection,
    `SELECT tr.object_id AS post_id, tt.taxonomy, t.name, t.slug
     FROM ${termRelationshipsTable} tr
     JOIN ${termTaxonomyTable} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
     JOIN ${termsTable} t ON t.term_id = tt.term_id
     JOIN ${postsTable} p ON p.ID = tr.object_id
     WHERE p.post_type = 'post' AND p.post_status = 'publish' AND tt.taxonomy IN ('category', 'post_tag')`
  );

  const map = new Map();
  for (const row of rows) {
    const postId = Number(row.post_id);
    if (!postId) continue;

    if (!map.has(postId)) {
      map.set(postId, {
        category: 'general',
        tags: [],
      });
    }

    const entry = map.get(postId);
    if (row.taxonomy === 'category' && entry.category === 'general') {
      entry.category = mapCategoryToNewProject(row.slug || row.name || 'general');
    }

    if (row.taxonomy === 'post_tag') {
      const tag = sanitizeText(row.name);
      if (tag && !entry.tags.includes(tag)) {
        entry.tags.push(tag);
      }
    }
  }

  return map;
}

async function loadPollMeta(connection, prefix) {
  const postsTable = mysqlTable(prefix, 'posts');
  const postMetaTable = mysqlTable(prefix, 'postmeta');

  const rows = await mysqlSafeQuery(
    connection,
    `SELECT pm.post_id, pm.meta_key, pm.meta_value
     FROM ${postMetaTable} pm
     JOIN ${postsTable} p ON p.ID = pm.post_id
     WHERE p.post_type = 'post'
       AND p.post_status = 'publish'
       AND (
         pm.meta_key = 'question'
         OR pm.meta_key LIKE 'answers\\_%\\_answer'
         OR pm.meta_key LIKE 'answers\\_%\\_counter'
       )`
  );

  return parsePollMeta(rows);
}

async function loadCorrectAnswers(connection, prefix) {
  const table = mysqlTable(prefix, 'poll_correct_answers');
  const rows = await mysqlSafeQuery(
    connection,
    `SELECT post_id, correct_answer_counter FROM ${table}`
  );

  const map = new Map();
  for (const row of rows) {
    const postId = Number(row.post_id);
    const counter = Number(row.correct_answer_counter);
    if (postId && Number.isFinite(counter) && counter > 0) {
      map.set(postId, counter);
    }
  }

  return map;
}

async function importNewsAndPolls(db, posts, taxonomy, featuredImages, pollMetaMap, correctAnswers) {
  const optionMap = new Map();
  let pollsCount = 0;

  for (const post of posts) {
    const postId = Number(post.id);
    if (!postId) continue;

    const tax = taxonomy.get(postId) || { category: 'general', tags: [] };
    const tags = Array.isArray(tax.tags) ? tax.tags : [];

    await sqliteRun(
      db,
      `INSERT INTO news (id, title, description, image, tags, category, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         image = excluded.image,
         tags = excluded.tags,
         category = excluded.category,
         created_at = excluded.created_at`,
      [
        postId,
        sanitizeText(post.post_title) || `Новость #${postId}`,
        stripHtml(post.post_content),
        featuredImages.get(postId) || '',
        JSON.stringify(tags),
        sanitizeText(tax.category || 'general') || 'general',
        cleanDate(post.post_date),
      ]
    );

    const poll = pollMetaMap.get(postId);
    if (!poll || !poll.question || !Array.isArray(poll.options) || poll.options.length === 0) {
      await sqliteRun(db, 'DELETE FROM poll_options WHERE poll_id = ?', [postId]);
      await sqliteRun(db, 'DELETE FROM polls WHERE id = ?', [postId]);
      continue;
    }

    pollsCount += 1;

    await sqliteRun(
      db,
      `INSERT INTO polls (id, news_id, question, correct_option_id, is_resolved)
       VALUES (?, ?, ?, NULL, 0)
       ON CONFLICT(id) DO UPDATE SET
         news_id = excluded.news_id,
         question = excluded.question`,
      [postId, postId, poll.question]
    );

    await sqliteRun(db, 'DELETE FROM poll_options WHERE poll_id = ?', [postId]);

    const counterMap = new Map();
    for (const option of poll.options) {
      const result = await sqliteRun(
        db,
        'INSERT INTO poll_options (poll_id, text) VALUES (?, ?)',
        [postId, option.text]
      );
      counterMap.set(option.counter, result.lastID);
    }

    optionMap.set(postId, counterMap);

    const correctCounter = correctAnswers.get(postId);
    const correctOptionId = correctCounter ? counterMap.get(correctCounter) : null;

    await sqliteRun(
      db,
      'UPDATE polls SET correct_option_id = ?, is_resolved = ? WHERE id = ?',
      [correctOptionId || null, correctOptionId ? 1 : 0, postId]
    );
  }

  return { optionMap, pollsCount };
}

async function loadVotes(connection, prefix) {
  const table = mysqlTable(prefix, 'poll_votes');
  return mysqlSafeQuery(
    connection,
    `SELECT id, post_id, user_id, vote_cont, data_vote
     FROM ${table}
     ORDER BY id ASC`
  );
}

async function importVotes(db, votes, optionMap) {
  let imported = 0;

  for (const vote of votes) {
    const pollId = Number(vote.post_id);
    const userId = Number(vote.user_id);
    const counter = Number(vote.vote_cont);
    const optionsByCounter = optionMap.get(pollId);

    if (!pollId || !userId || !optionsByCounter) continue;
    const optionId = optionsByCounter.get(counter);
    if (!optionId) continue;

    await sqliteRun(
      db,
      `INSERT OR IGNORE INTO votes (id, user_id, poll_id, option_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [Number(vote.id) || null, userId, pollId, optionId, cleanDate(vote.data_vote)]
    );

    imported += 1;
  }

  return imported;
}

async function loadLikes(connection, prefix) {
  const table = mysqlTable(prefix, 'post_likes');
  return mysqlSafeQuery(
    connection,
    `SELECT post_id, user_id, liked FROM ${table} WHERE liked = 1`
  );
}

async function importLikes(db, likes) {
  let imported = 0;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  for (const like of likes) {
    const postId = Number(like.post_id);
    const userId = Number(like.user_id);
    if (!postId || !userId) continue;

    await sqliteRun(
      db,
      `INSERT OR IGNORE INTO likes (user_id, news_id, created_at)
       VALUES (?, ?, ?)`,
      [userId, postId, now]
    );
    imported += 1;
  }

  return imported;
}

async function loadComplaints(connection, prefix) {
  const table = mysqlTable(prefix, 'complaints');
  return mysqlSafeQuery(
    connection,
    `SELECT id, post_id, user_id, complaint_text, date FROM ${table}`
  );
}

async function importComplaints(db, complaints) {
  let imported = 0;

  for (const complaint of complaints) {
    const id = Number(complaint.id);
    const postId = Number(complaint.post_id);
    const userId = Number(complaint.user_id);
    const message = sanitizeText(complaint.complaint_text);
    if (!id || !postId || !message) continue;

    await sqliteRun(
      db,
      `INSERT INTO error_reports (id, news_id, user_id, message, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)
       ON CONFLICT(id) DO UPDATE SET
         news_id = excluded.news_id,
         user_id = excluded.user_id,
         message = excluded.message,
         created_at = excluded.created_at`,
      [id, postId, userId || null, message, cleanDate(complaint.date)]
    );

    imported += 1;
  }

  return imported;
}

async function loadPointsHistory(connection, prefix) {
  const table = mysqlTable(prefix, 'points_history');
  return mysqlSafeQuery(
    connection,
    `SELECT id, user_id, points, calculation_date, comment FROM ${table} ORDER BY id ASC`
  );
}

async function importPointsHistory(db, rows) {
  let imported = 0;

  for (const row of rows) {
    const id = Number(row.id);
    const userId = Number(row.user_id);
    const points = Number(row.points);
    const comment = sanitizeText(row.comment || '');

    if (!id || !userId || !Number.isFinite(points) || !comment) continue;

    await sqliteRun(
      db,
      `INSERT INTO points_history (id, user_id, points, calculation_date, comment)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         user_id = excluded.user_id,
         points = excluded.points,
         calculation_date = excluded.calculation_date,
         comment = excluded.comment`,
      [id, userId, points, cleanDate(row.calculation_date), comment]
    );

    imported += 1;
  }

  return imported;
}

async function syncWordpressToSQLite({ db, fullReplace = true, logger = console } = {}) {
  if (!db) {
    throw new Error('SQLite DB instance is required');
  }

  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch (error) {
    throw new Error('mysql2 package is not installed. Install dependencies before sync.');
  }

  const config = getSyncConfig();
  if (!config) {
    throw new Error('WP_DB_HOST, WP_DB_USER, and WP_DB_NAME are required for WordPress sync');
  }

  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    charset: 'utf8mb4',
  });

  const stats = {
    fullReplace,
    users: 0,
    news: 0,
    polls: 0,
    votes: 0,
    likes: 0,
    reports: 0,
    pointsHistory: 0,
    settings: { ...DEFAULT_POINTS_SETTINGS },
  };

  try {
    const settings = await getPointsSettings(connection, config.prefix);
    stats.settings = settings;

    const users = await loadUsers(connection, config.prefix);
    const posts = await loadPosts(connection, config.prefix);
    const [featuredImages, taxonomy, pollMetaMap, correctAnswers] = await Promise.all([
      loadFeaturedImages(connection, config.prefix),
      loadTaxonomy(connection, config.prefix),
      loadPollMeta(connection, config.prefix),
      loadCorrectAnswers(connection, config.prefix),
    ]);
    const votes = await loadVotes(connection, config.prefix);
    const likes = await loadLikes(connection, config.prefix);
    const complaints = await loadComplaints(connection, config.prefix);
    const pointsHistory = await loadPointsHistory(connection, config.prefix);

    if (fullReplace && users.length === 0 && posts.length === 0) {
      throw new Error('Source WordPress DB returned no users and no posts. Full replace was aborted.');
    }

    if (fullReplace) {
      await clearTargetTables(db);
    }

    await upsertPointsSettings(db, settings);

    await importUsers(db, users, settings);
    stats.users = users.length;
    stats.news = posts.length;

    const pollImportResult = await importNewsAndPolls(
      db,
      posts,
      taxonomy,
      featuredImages,
      pollMetaMap,
      correctAnswers
    );

    stats.polls = pollImportResult.pollsCount;
    stats.votes = await importVotes(db, votes, pollImportResult.optionMap);
    stats.likes = await importLikes(db, likes);
    stats.reports = await importComplaints(db, complaints);
    stats.pointsHistory = await importPointsHistory(db, pointsHistory);

    if (logger && typeof logger.info === 'function') {
      logger.info('[WP Sync] Completed', stats);
    }

    return stats;
  } finally {
    await connection.end();
  }
}

module.exports = {
  DEFAULT_POINTS_SETTINGS,
  calculateLevel,
  getSyncConfig,
  isWordpressSyncConfigured,
  syncWordpressToSQLite,
  toBoolean,
};
