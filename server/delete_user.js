const db = require('./database');

db.run("DELETE FROM users WHERE id = 4", function(err) {
    if (err) {
        return console.error(err.message);
    }
    console.log(`Row(s) deleted ${this.changes}`);
});
