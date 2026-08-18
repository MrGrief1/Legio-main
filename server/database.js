const sqlite3 = require('./sqlite').verbose();
const path = require('path');
const fs = require('fs');

// Check if Railway volume exists at /app/data
const dataDir = '/app/data';
const isRailwayVolume = fs.existsSync(dataDir);

if (isRailwayVolume) {
  try {
    fs.accessSync(dataDir, fs.constants.W_OK);
    console.log(`Directory ${dataDir} is writable.`);
  } catch (err) {
    console.error(`Directory ${dataDir} is NOT writable:`, err.message);
    try {
      const stats = fs.statSync(dataDir);
      console.log(`Directory stats: uid=${stats.uid}, gid=${stats.gid}, mode=${stats.mode}`);
      console.log(`Process info: uid=${process.getuid()}, gid=${process.getgid()}`);
    } catch (e) {
      console.error('Could not stat directory:', e);
    }
  }
}

const configuredDbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : null;

const dbPath = configuredDbPath || (isRailwayVolume
  ? path.join(dataDir, 'database.sqlite')
  : path.resolve(__dirname, 'database.sqlite'));

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let resolveDbReady;
let rejectDbReady;
const ready = new Promise((resolve, reject) => {
  resolveDbReady = resolve;
  rejectDbReady = reject;
});

console.log('Database path:', dbPath); // Log the database path

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
    if (err.code === 'SQLITE_CANTOPEN') {
      console.error('Trying to fallback to in-memory/local DB due to permission error...');
    }
    rejectDbReady(err);
  } else {
    console.log('Connected to the SQLite database.');
    initDb();
  }
});

function initDb() {
  db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'user', -- 'admin', 'creator', 'user'
      points INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      avatar TEXT,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // News table
    db.run(`CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      image TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tags for news
    db.run(`ALTER TABLE news ADD COLUMN tags TEXT DEFAULT '[]'`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding tags column:', err);
      }
    });

    // Category for news
    db.run(`ALTER TABLE news ADD COLUMN category TEXT DEFAULT 'general'`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding category column:', err);
      }
    });

    // Source (istochnik) for news — ported from the old WordPress version
    db.run(`ALTER TABLE news ADD COLUMN source TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding source column:', err);
      }
    });

    // Lowercased "title + description + tags", written by the application layer.
    //
    // Search cannot be done with LOWER() in SQL: SQLite's LOWER() and LIKE only fold case for
    // ASCII, so "спорт" never matches a stored "Спорт" — Russian search only worked when the
    // typed case happened to match exactly. JavaScript folds Unicode correctly, so the folding is
    // done once at write time and the query becomes a plain LIKE against this column.
    db.run(`ALTER TABLE news ADD COLUMN search_text TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding search_text column:', err);
      }
    });

    // Add name and avatar to users if missing
    db.run(`ALTER TABLE users ADD COLUMN name TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding name column:', err);
      }
    });
    db.run(`ALTER TABLE users ADD COLUMN avatar TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding avatar column:', err);
      }
    });

    // Polls table
    db.run(`CREATE TABLE IF NOT EXISTS polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      news_id INTEGER,
      question TEXT,
      correct_option_id INTEGER DEFAULT NULL,
      is_resolved INTEGER DEFAULT 0,
      FOREIGN KEY (news_id) REFERENCES news(id)
    )`);

    // Poll end date (okonchanie_oprosa) — ported from the old WordPress version.
    // CREATE TABLE IF NOT EXISTS above won't add this to pre-existing databases, so ALTER separately.
    db.run(`ALTER TABLE polls ADD COLUMN ends_at TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding ends_at column:', err);
      }
    });

    // Poll Options table
    db.run(`CREATE TABLE IF NOT EXISTS poll_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER,
      text TEXT,
      FOREIGN KEY (poll_id) REFERENCES polls(id)
    )`);

    // Votes table
    db.run(`CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      poll_id INTEGER,
      option_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (poll_id) REFERENCES polls(id),
      FOREIGN KEY (option_id) REFERENCES poll_options(id),
      UNIQUE(user_id, poll_id)
    )`);

    // Likes table
    db.run(`CREATE TABLE IF NOT EXISTS likes (
      user_id INTEGER,
      news_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (news_id) REFERENCES news(id),
      PRIMARY KEY (user_id, news_id)
    )`);

    // Error Reports table
    db.run(`CREATE TABLE IF NOT EXISTS error_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      news_id INTEGER,
      user_id INTEGER,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (news_id) REFERENCES news(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Chats table
    db.run(`CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT DEFAULT 'direct', -- 'direct', 'group'
      name TEXT, -- For group chats
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Chat Participants table
    db.run(`CREATE TABLE IF NOT EXISTS chat_participants (
      chat_id INTEGER,
      user_id INTEGER,
      FOREIGN KEY (chat_id) REFERENCES chats(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      PRIMARY KEY (chat_id, user_id)
    )`);

    // Messages table
    db.run(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER,
      sender_id INTEGER,
      content TEXT,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chat_id) REFERENCES chats(id),
      FOREIGN KEY (sender_id) REFERENCES users(id)
    )`);

    // Blocked Users table
    db.run(`CREATE TABLE IF NOT EXISTS blocked_users (
      blocker_id INTEGER,
      blocked_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (blocker_id) REFERENCES users(id),
      FOREIGN KEY (blocked_id) REFERENCES users(id),
      PRIMARY KEY (blocker_id, blocked_id)
    )`);

    // Message Attachments table
    db.run(`CREATE TABLE IF NOT EXISTS message_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER,
      url TEXT,
      type TEXT, -- 'image', 'video', 'file'
      name TEXT,
      FOREIGN KEY (message_id) REFERENCES messages(id)
    )`);

    // Add bio and birthdate to users if missing
    db.run(`ALTER TABLE users ADD COLUMN bio TEXT`, (err) => {
      // Ignore if exists
    });
    db.run(`ALTER TABLE users ADD COLUMN birthdate TEXT`, (err) => {
      // Ignore if exists
    });

    // Add last_seen column to users
    db.run(`ALTER TABLE users ADD COLUMN last_seen DATETIME`, (err) => {
      // Ignore if exists
    });

    // Add legacy-compatible level column
    db.run(`ALTER TABLE users ADD COLUMN level INTEGER DEFAULT 1`, (err) => {
      // Ignore if exists
    });

    // Ensure name is unique
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name ON users(name)`, (err) => {
      if (err) console.error('Error creating unique index on name:', err.message);
    });

    // --- Почта и двухфакторная защита ---
    //
    // `username` исторически служит и логином, и адресом почты, но у аккаунтов, перенесённых из
    // WordPress, там лежит user_login — обычный ник (см. wordpress_sync.js). Поэтому адрес живёт в
    // отдельной колонке `email`: у части старых аккаунтов её просто нечем заполнить, и код должен
    // уметь это различать, а не гадать по виду логина.
    db.run(`ALTER TABLE users ADD COLUMN email TEXT`, () => {
      // Уже существует — не ошибка.

      // Заполняем только там, где логин и правда похож на адрес. WHERE email IS NULL делает
      // операцию идемпотентной: она выполняется при каждом старте и не затирает привязанную почту.
      db.run(
        `UPDATE users SET email = LOWER(username)
         WHERE email IS NULL AND username LIKE '%_@_%._%'`,
        (updateErr) => {
          if (updateErr) console.error('Error backfilling users.email:', updateErr.message);
        }
      );
    });

    // DEFAULT 1 — намеренно: колонка добавляется к уже существующим строкам, и все они получают
    // «подтверждён». Иначе живые аккаунты со старого сайта разом стали бы неподтверждёнными и
    // потеряли доступ. Регистрация пишет 0 явным значением.
    db.run(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 1`, () => { });

    // Вход по коду на почту — включается самим пользователем в настройках.
    db.run(`ALTER TABLE users ADD COLUMN mfa_email_enabled INTEGER DEFAULT 0`, () => { });

    // Одноразовые коды подтверждения для всех сценариев (purpose): регистрация, вход, смена
    // пароля и почты. Хранится только SHA-256 кода — дамп базы не должен давать готовый код.
    //
    // `challenge_id` нужен там, где пользователь ещё не аутентифицирован (второй фактор при
    // входе): клиент оперирует непредсказуемым идентификатором вместо user_id, поэтому по ответу
    // нельзя перебирать чужие аккаунты.
    db.run(`CREATE TABLE IF NOT EXISTS auth_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id TEXT UNIQUE,
      user_id INTEGER,
      email TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      payload TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) console.error('Error creating auth_codes table:', err.message);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_auth_codes_lookup ON auth_codes(user_id, purpose, consumed_at)`, () => { });
    db.run(`CREATE INDEX IF NOT EXISTS idx_auth_codes_expiry ON auth_codes(expires_at)`, () => { });

    // Visits table
    db.run(`CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      count INTEGER DEFAULT 0,
      UNIQUE(date)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS visitor_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_id TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(visitor_id, date)
    )`);

    // Points settings table (legacy WordPress compatibility)
    db.run(`CREATE TABLE IF NOT EXISTS points_settings (
      id INTEGER PRIMARY KEY,
      start_points INTEGER NOT NULL DEFAULT 100,
      wins_points INTEGER NOT NULL DEFAULT 100,
      level_points INTEGER NOT NULL DEFAULT 1000,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Points history table (legacy WordPress compatibility)
    db.run(`CREATE TABLE IF NOT EXISTS points_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      points INTEGER NOT NULL,
      calculation_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      comment TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Distinguishes a poll win from the flat monthly prize. The monthly leaderboard sums only
    // 'poll' rows: crediting the prize as ordinary points would put 5000 into the winner's *next*
    // month total and hand them the following month's prize for free, forever.
    db.run(`ALTER TABLE points_history ADD COLUMN kind TEXT DEFAULT 'poll'`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding kind column to points_history:', err);
      }
    });

    // One row per settled month — the idempotency guard for the monthly prize. The PRIMARY KEY is
    // what makes "award once" true even if two requests settle the same month at the same time.
    db.run(`CREATE TABLE IF NOT EXISTS monthly_prizes (
      month TEXT PRIMARY KEY,          -- 'YYYY-MM' of the month that was won
      user_id INTEGER,                 -- NULL when nobody scored that month
      points INTEGER NOT NULL DEFAULT 0,
      monthly_points INTEGER NOT NULL DEFAULT 0, -- the score that won it, for the record
      awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Things the user needs to be told about but wasn't online for. The monthly prize is settled by
    // the server whenever a month rolls over, which is almost never while the winner is looking at
    // the page — so the news has to wait here until they come back.
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,              -- 'monthly_prize'
      title TEXT NOT NULL,
      body TEXT,
      points INTEGER DEFAULT 0,        -- amount awarded, when the notification is about points
      meta TEXT,                       -- JSON: e.g. the month key the prize belongs to
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      read_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Unread lookups are per user and happen on every page load, so index that path.
    db.run(`CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at)`);
    // One prize notification per user per month, enforced by the database rather than by hoping the
    // settlement runs exactly once.
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unique_event
            ON notifications(user_id, type, meta)`);

    db.run(
      `INSERT INTO points_settings (id, start_points, wins_points, level_points)
       VALUES (1, 100, 100, 1000)
       ON CONFLICT(id) DO NOTHING`
    );

    // --- OPTIMIZATION INDEXES ---
    db.run(`CREATE INDEX IF NOT EXISTS idx_news_created_at ON news(created_at)`);
    // A leading-wildcard LIKE can't use an index, but this still helps the planner keep the scan
    // on a narrow column instead of reading title+description+tags for every row.
    db.run(`CREATE INDEX IF NOT EXISTS idx_news_search_text ON news(search_text)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_news_category ON news(category)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_news_category_created ON news(category, created_at DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_likes_news_id ON likes(news_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_votes_poll_id ON votes(poll_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_votes_option_id ON votes(option_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_votes_user_poll ON votes(user_id, poll_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_chat_read ON messages(chat_id, is_read, sender_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(chat_id, created_at DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_chat_participants_user_id ON chat_participants(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_points_history_user_id ON points_history(user_id)`);
    // Monthly leaderboard sums points_history over a date window, per user.
    db.run(`CREATE INDEX IF NOT EXISTS idx_points_history_date ON points_history(calculation_date)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_points_history_date_user ON points_history(calculation_date, user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_visitor_sessions_date ON visitor_sessions(date)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_points ON users(points DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_polls_news_id ON polls(news_id)`);

    db.get('SELECT 1', (readyErr) => {
      if (readyErr) {
        rejectDbReady(readyErr);
        return;
      }

      console.log('Database initialized');
      resolveDbReady();
    });
  });
}

db.ready = ready;

module.exports = db;
