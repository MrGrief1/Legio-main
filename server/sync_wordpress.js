const db = require('./database');
const {
  isWordpressSyncConfigured,
  syncWordpressToSQLite,
  toBoolean,
} = require('./wordpress_sync');

async function main() {
  if (!isWordpressSyncConfigured()) {
    console.error('WordPress sync is not configured. Set WP_DB_HOST, WP_DB_USER, WP_DB_NAME.');
    process.exitCode = 1;
    return;
  }

  const fullReplace = toBoolean(process.env.WP_SYNC_FULL_REPLACE, true);
  const stats = await syncWordpressToSQLite({ db, fullReplace, logger: console });
  console.log('WordPress sync completed:');
  console.log(JSON.stringify(stats, null, 2));
}

main()
  .catch((error) => {
    console.error('WordPress sync failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close((closeErr) => {
      if (closeErr) {
        console.error('Failed to close SQLite connection:', closeErr.message);
      }
    });
  });
