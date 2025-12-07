const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name ON users(name)`, (err) => {
        if (err) {
            console.error('Error creating index:', err.message);
        } else {
            console.log('Index idx_users_name created or already exists.');
        }
    });
});

db.close();
