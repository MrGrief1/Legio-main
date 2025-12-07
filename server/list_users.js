const db = require('./database');

db.all("SELECT id, username, name, role, points FROM users", [], (err, rows) => {
    if (err) {
        throw err;
    }
    rows.forEach((row) => {
        console.log(row);
    });
});
