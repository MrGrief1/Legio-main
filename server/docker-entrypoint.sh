#!/bin/sh
set -eu

DATA_DIR="${DATABASE_DIR:-}"
UPLOADS_DIR="${UPLOADS_DIR:-/app/uploads}"

if [ -z "$DATA_DIR" ]; then
    if [ -n "${DATABASE_PATH:-}" ]; then
        DATA_DIR="$(dirname "$DATABASE_PATH")"
    else
        DATA_DIR="/app/data"
    fi
fi

ensure_dir() {
    dir_path="$1"
    if [ ! -d "$dir_path" ]; then
        mkdir -p "$dir_path"
    fi
}

fix_permissions() {
    target_path="$1"
    ensure_dir "$target_path"

    chown -R node:node "$target_path"
    chmod -R u+rwX,go+rX "$target_path"
}

if [ "$(id -u)" = "0" ]; then
    fix_permissions "$DATA_DIR"
    fix_permissions "$UPLOADS_DIR"

    exec gosu node "$@"
fi

exec "$@"
