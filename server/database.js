const sqlite3 = require('sqlite3').verbose();
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

const dbPath = isRailwayVolume
  ? path.join(dataDir, 'database.sqlite')
  : path.resolve(__dirname, 'database.sqlite');

console.log('Database path:', dbPath); // Log the database path

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
    if (err.code === 'SQLITE_CANTOPEN') {
      console.error('Trying to fallback to in-memory/local DB due to permission error...');
    }
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

    // Ensure name is unique
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name ON users(name)`, (err) => {
      if (err) console.error('Error creating unique index on name:', err.message);
    });

    // Visits table
    db.run(`CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      count INTEGER DEFAULT 0,
      UNIQUE(date)
    )`);

    // --- OPTIMIZATION INDEXES ---
    db.run(`CREATE INDEX IF NOT EXISTS idx_news_created_at ON news(created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_news_category ON news(category)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_likes_news_id ON likes(news_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_votes_poll_id ON votes(poll_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_votes_option_id ON votes(option_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_chat_participants_user_id ON chat_participants(user_id)`);

    console.log('Database initialized');

    // Create default admin if not exists
    const adminPassword = 'admin'; // In real app hash this!
    // We'll handle hashing in the auth route, but for initial seed let's keep it simple or add a check
  });
}

module.exports = db;
