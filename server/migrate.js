const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Migrating database...');

db.serialize(() => {
    // Try to add missing columns to existing tables

    // 1. Add created_at to votes table (without DEFAULT due to SQLite limitation)
    db.run("ALTER TABLE votes ADD COLUMN created_at DATETIME", (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log('✓ votes.created_at already exists');
            } else {
                console.error('✗ Error adding votes.created_at:', err.message);
            }
        } else {
            console.log('✓ Added votes.created_at column');
            // Set current timestamp for existing rows
            db.run("UPDATE votes SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL", (err) => {
                if (err) {
                    console.error('✗ Error updating votes.created_at:', err.message);
                } else {
                    console.log('✓ Updated existing votes with current timestamp');
                }
            });
        }
    });

    // 2. Add created_at to users table (without DEFAULT due to SQLite limitation)
    db.run("ALTER TABLE users ADD COLUMN created_at DATETIME", (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log('✓ users.created_at already exists');
            } else {
                console.error('✗ Error adding users.created_at:', err.message);
            }
        } else {
            console.log('✓ Added users.created_at column');
            // Set current timestamp for existing rows
            db.run("UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL", (err) => {
                if (err) {
                    console.error('✗ Error updating users.created_at:', err.message);
                } else {
                    console.log('✓ Updated existing users with current timestamp');
                }
            });
        }
    });

    // 3. Add name to users table
    db.run("ALTER TABLE users ADD COLUMN name TEXT", (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log('✓ users.name already exists');
            } else {
                console.error('✗ Error adding users.name:', err.message);
            }
        } else {
            console.log('✓ Added users.name column');
        }
    });

    // 4. Add category to news table
    db.run("ALTER TABLE news ADD COLUMN category TEXT DEFAULT 'general'", (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log('✓ news.category already exists');
            } else {
                console.error('✗ Error adding news.category:', err.message);
            }
        } else {
            console.log('✓ Added news.category column');
        }
    });

    // 5. Add last_seen to users table
    db.run("ALTER TABLE users ADD COLUMN last_seen DATETIME", (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log('✓ users.last_seen already exists');
            } else {
                console.error('✗ Error adding users.last_seen:', err.message);
            }
        } else {
            console.log('✓ Added users.last_seen column');
        }
    });

    // Close the database after migration
    setTimeout(() => {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('\nMigration complete! You can now restart your server.');
            }
        });
    }, 2000);
});
