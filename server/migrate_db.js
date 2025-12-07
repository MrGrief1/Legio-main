const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite'); // Corrected path to match database.js
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
        process.exit(1);
    }
    console.log('Connected to database for migration.');
});

db.serialize(() => {
    console.log("Starting migration...");

    // 1. Add category to news
    db.run(`ALTER TABLE news ADD COLUMN category TEXT DEFAULT 'general'`, (err) => {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log("✓ 'category' column already exists in 'news'");
            } else {
                console.error("✗ Error adding 'category' to 'news':", err.message);
            }
        } else {
            console.log("✓ Added 'category' column to 'news'");
        }
    });

    // 2. Add name to users
    db.run(`ALTER TABLE users ADD COLUMN name TEXT`, (err) => {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log("✓ 'name' column already exists in 'users'");
            } else {
                console.error("✗ Error adding 'name' to 'users':", err.message);
            }
        } else {
            console.log("✓ Added 'name' column to 'users'");
        }
    });

    // 3. Add avatar to users
    db.run(`ALTER TABLE users ADD COLUMN avatar TEXT`, (err) => {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log("✓ 'avatar' column already exists in 'users'");
            } else {
                console.error("✗ Error adding 'avatar' to 'users':", err.message);
            }
        } else {
            console.log("✓ Added 'avatar' column to 'users'");
        }
    });
});

db.close((err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Migration finished.');
});
