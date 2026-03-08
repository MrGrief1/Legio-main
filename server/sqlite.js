const BetterSqlite3 = require('better-sqlite3');

const OPEN_READONLY = 0x00000001;
const OPEN_READWRITE = 0x00000002;
const OPEN_CREATE = 0x00000004;

const normalizeCallbackArgs = (params, callback) => {
    if (typeof params === 'function') {
        return { params: [], callback: params };
    }

    if (params === undefined) {
        return { params: [], callback };
    }

    return { params, callback };
};

const invokeStatement = (statement, method, params) => {
    if (Array.isArray(params)) {
        return statement[method](...params);
    }

    if (params && typeof params === 'object') {
        return statement[method](params);
    }

    if (params === undefined || params === null || params === '') {
        return statement[method]();
    }

    return statement[method](params);
};

class StatementWrapper {
    constructor(statement) {
        this.statement = statement;
    }

    run(...args) {
        const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;

        try {
            const info = invokeStatement(this.statement, 'run', args);
            if (callback) {
                callback.call({
                    lastID: Number(info.lastInsertRowid || 0),
                    changes: Number(info.changes || 0),
                }, null);
            }
            return this;
        } catch (error) {
            if (callback) {
                callback(error);
                return this;
            }
            throw error;
        }
    }

    get(...args) {
        const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;

        try {
            const row = invokeStatement(this.statement, 'get', args);
            if (callback) {
                callback(null, row);
                return this;
            }
            return row;
        } catch (error) {
            if (callback) {
                callback(error);
                return this;
            }
            throw error;
        }
    }

    all(...args) {
        const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;

        try {
            const rows = invokeStatement(this.statement, 'all', args);
            if (callback) {
                callback(null, rows);
                return this;
            }
            return rows;
        } catch (error) {
            if (callback) {
                callback(error);
                return this;
            }
            throw error;
        }
    }

    finalize(callback) {
        if (callback) {
            callback(null);
        }
        return this;
    }
}

class DatabaseWrapper {
    constructor(filename, modeOrCallback, maybeCallback) {
        const callback = typeof modeOrCallback === 'function' ? modeOrCallback : maybeCallback;
        const mode = typeof modeOrCallback === 'number' ? modeOrCallback : (OPEN_READWRITE | OPEN_CREATE);
        const readonly = mode === OPEN_READONLY || ((mode & OPEN_READONLY) !== 0 && (mode & OPEN_READWRITE) === 0);

        try {
            this.db = new BetterSqlite3(filename, {
                readonly,
                fileMustExist: readonly,
            });
            if (callback) {
                process.nextTick(() => callback(null));
            }
        } catch (error) {
            if (callback) {
                process.nextTick(() => callback(error));
                return;
            }
            throw error;
        }
    }

    serialize(callback) {
        callback();
        return this;
    }

    run(sql, params, callback) {
        const normalized = normalizeCallbackArgs(params, callback);

        try {
            const statement = this.db.prepare(sql);
            const info = invokeStatement(statement, 'run', normalized.params);
            if (normalized.callback) {
                normalized.callback.call({
                    lastID: Number(info.lastInsertRowid || 0),
                    changes: Number(info.changes || 0),
                }, null);
            }
            return this;
        } catch (error) {
            if (normalized.callback) {
                normalized.callback(error);
                return this;
            }
            throw error;
        }
    }

    get(sql, params, callback) {
        const normalized = normalizeCallbackArgs(params, callback);

        try {
            const statement = this.db.prepare(sql);
            const row = invokeStatement(statement, 'get', normalized.params);
            if (normalized.callback) {
                normalized.callback(null, row);
                return this;
            }
            return row;
        } catch (error) {
            if (normalized.callback) {
                normalized.callback(error);
                return this;
            }
            throw error;
        }
    }

    all(sql, params, callback) {
        const normalized = normalizeCallbackArgs(params, callback);

        try {
            const statement = this.db.prepare(sql);
            const rows = invokeStatement(statement, 'all', normalized.params);
            if (normalized.callback) {
                normalized.callback(null, rows);
                return this;
            }
            return rows;
        } catch (error) {
            if (normalized.callback) {
                normalized.callback(error);
                return this;
            }
            throw error;
        }
    }

    prepare(sql) {
        return new StatementWrapper(this.db.prepare(sql));
    }

    exec(sql) {
        this.db.exec(sql);
        return this;
    }

    close(callback) {
        try {
            this.db.close();
            if (callback) {
                callback(null);
            }
        } catch (error) {
            if (callback) {
                callback(error);
                return;
            }
            throw error;
        }
    }

    on() {
        return this;
    }
}

module.exports = {
    Database: DatabaseWrapper,
    OPEN_CREATE,
    OPEN_READONLY,
    OPEN_READWRITE,
    verbose() {
        return module.exports;
    },
};
