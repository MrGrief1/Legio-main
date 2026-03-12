#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
DEFAULT_DB_PATH="$ROOT_DIR/server/database.sqlite"
RAILWAY_DB_PATH="/app/data/database.sqlite"

if [ -n "${DATABASE_PATH:-}" ]; then
    DB_PATH="$DATABASE_PATH"
elif [ -f "$RAILWAY_DB_PATH" ]; then
    DB_PATH="$RAILWAY_DB_PATH"
else
    DB_PATH="$DEFAULT_DB_PATH"
fi

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP="$(date '+%Y%m%d_%H%M%S')"

if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "sqlite3 is required to create backups" >&2
    exit 1
fi

if ! command -v gzip >/dev/null 2>&1; then
    echo "gzip is required to compress backups" >&2
    exit 1
fi

if [ ! -f "$DB_PATH" ]; then
    echo "Database file not found: $DB_PATH" >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/legio_backup_$TIMESTAMP.sqlite"

sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
gzip -f "$BACKUP_FILE"

find "$BACKUP_DIR" -type f -name 'legio_backup_*.sqlite.gz' -mtime +"$RETENTION_DAYS" -delete

echo "Backup created: $BACKUP_FILE.gz"
