const sqlite3 = require('./sqlite').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

require('dotenv').config();

const DB_PATH = path.resolve(
    process.env.DATABASE_PATH || process.env.DB_PATH || path.join(__dirname, 'database.sqlite')
);

const ADMIN_LOGIN = String(process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME || '')
    .trim()
    .normalize('NFKC');
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const DISPLAY_NAME = String(process.env.ADMIN_NAME || ADMIN_LOGIN || 'Admin')
    .trim()
    .normalize('NFKC');

const validateAdminCredentials = () => {
    if (!ADMIN_LOGIN) {
        console.error('FATAL: ADMIN_EMAIL or ADMIN_USERNAME environment variable is required');
        process.exit(1);
    }

    if (!/^[\p{L}\p{N}._@+-]{3,80}$/u.test(ADMIN_LOGIN)) {
        console.error('FATAL: admin login contains unsupported characters or invalid length');
        process.exit(1);
    }

    if (ADMIN_PASSWORD.length < 8 || ADMIN_PASSWORD.length > 128) {
        console.error('FATAL: ADMIN_PASSWORD must be between 8 and 128 characters long');
        process.exit(1);
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/.test(ADMIN_PASSWORD)) {
        console.error('FATAL: ADMIN_PASSWORD must include uppercase, lowercase and a number');
        process.exit(1);
    }
};

const dbGet = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
    });
});

const dbRun = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
        if (err) return reject(err);
        resolve(this);
    });
});

async function createAdmin() {
    validateAdminCredentials();

    const db = new sqlite3.Database(DB_PATH);

    try {
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
        const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(ADMIN_LOGIN)}`;
        const existingUser = await dbGet(
            db,
            'SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1',
            [ADMIN_LOGIN]
        );

        if (existingUser) {
            await dbRun(
                db,
                `UPDATE users
                 SET password = ?, role = 'admin', avatar = ?, name = ?
                 WHERE id = ?`,
                [hashedPassword, avatarUrl, DISPLAY_NAME, existingUser.id]
            );
            console.log(`Admin role and password updated for ${ADMIN_LOGIN}`);
            return;
        }

        await dbRun(
            db,
            `INSERT INTO users (username, password, role, points, avatar, name)
             VALUES (?, ?, 'admin', 0, ?, ?)`,
            [ADMIN_LOGIN, hashedPassword, avatarUrl, DISPLAY_NAME]
        );

        console.log(`Admin account created for ${ADMIN_LOGIN}`);
    } catch (error) {
        console.error('Failed to create admin:', error);
        process.exitCode = 1;
    } finally {
        db.close();
    }
}

createAdmin();
