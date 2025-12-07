const sqlite3 = require('sqlite3').verbose();

const checkDb = (filename) => {
    return new Promise((resolve) => {
        const db = new sqlite3.Database(filename, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                console.log(`${filename}: Error opening - ${err.message}`);
                resolve();
                return;
            }
            db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
                if (err) console.log(`${filename}: Error querying users - ${err.message}`);
                else console.log(`${filename}: Users count = ${row.count}`);
                db.close();
                resolve();
            });
        });
    });
};

async function run() {
    console.log("Checking databases...");
    await checkDb('./database.sqlite');
    await checkDb('./legio.db');
}

run();
