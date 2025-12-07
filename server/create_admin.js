const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

// Путь к базе данных
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');

// Email и пароль для админа (можно передать через переменные окружения)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'maksurazov1502@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'; // ИЗМЕНИТЕ ЭТО!
const DISPLAY_NAME = process.env.ADMIN_NAME || 'Admin';

async function createAdmin() {
    const db = new sqlite3.Database(DB_PATH);

    try {
        // Проверяем существует ли пользователь
        const existing = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM users WHERE username = ?', [ADMIN_EMAIL], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (existing) {
            console.log(`✓ Пользователь ${ADMIN_EMAIL} уже существует`);

            // Обновляем роль на admin если нужно
            await new Promise((resolve, reject) => {
                db.run('UPDATE users SET role = ? WHERE username = ?', ['admin', ADMIN_EMAIL], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            console.log(`✓ Роль обновлена на 'admin'`);
        } else {
            // Создаем нового админа
            const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
            const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${ADMIN_EMAIL}`;

            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO users (username, password, role, points, avatar, name) VALUES (?, ?, ?, ?, ?, ?)',
                    [ADMIN_EMAIL, hashedPassword, 'admin', 0, avatarUrl, DISPLAY_NAME],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            console.log(`✓ Админ создан успешно!`);
            console.log(`  Email: ${ADMIN_EMAIL}`);
            console.log(`  Password: ${ADMIN_PASSWORD}`);
            console.log(`  Role: admin`);
        }
    } catch (error) {
        console.error('Ошибка:', error);
        process.exit(1);
    } finally {
        db.close();
    }
}

createAdmin().then(() => {
    console.log('\n✅ Готово!');
    process.exit(0);
});
