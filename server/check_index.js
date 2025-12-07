const db = require('./database');

db.all("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_users_name'", [], (err, rows) => {
    if (err) {
        throw err;
    }
    console.log('Indexes found:', rows);
});
