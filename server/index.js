const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

require('dotenv').config();

const normalizeLogin = (value) => String(value || '').trim().toLowerCase();

const parseCsvSet = (value) => new Set(
    String(value || '')
        .split(',')
        .map(normalizeLogin)
        .filter(Boolean)
);

const getConfiguredSecretKey = () => {
    const secretKey = String(process.env.SECRET_KEY || '').trim();
    const jwtSecret = String(process.env.JWT_SECRET || '').trim();

    if (secretKey && jwtSecret && secretKey !== jwtSecret) {
        console.warn('Both SECRET_KEY and JWT_SECRET are set. Using SECRET_KEY.');
    }

    return secretKey || jwtSecret || '';
};

const validateEnvironment = (secretKey) => {
    const insecureSecrets = new Set([
        'supersecretkey',
        'changeme',
        'your-super-secret-jwt-key-change-this-in-production',
    ]);

    if (!secretKey) {
        console.error('FATAL: SECRET_KEY environment variable is not set');
        console.error('Set SECRET_KEY (or JWT_SECRET) in your Railway service variables.');
        process.exit(1);
    }

    if (secretKey.length < 32) {
        console.error('FATAL: SECRET_KEY must be at least 32 characters long');
        process.exit(1);
    }

    if (insecureSecrets.has(secretKey)) {
        console.error('FATAL: SECRET_KEY uses an insecure placeholder value');
        process.exit(1);
    }
};

const RESOLVED_SECRET_KEY = getConfiguredSecretKey();
validateEnvironment(RESOLVED_SECRET_KEY);

const {
    DEFAULT_POINTS_SETTINGS,
    calculateLevel,
    isWordpressSyncConfigured,
    syncWordpressToSQLite,
    toBoolean,
} = require('./wordpress_sync');

// Fallback for missing packages
let helmet, rateLimit, compression, PasswordHash;
try { helmet = require('helmet'); } catch (e) { }
try { rateLimit = require('express-rate-limit'); } catch (e) { }
try { compression = require('compression'); } catch (e) { }
try { ({ PasswordHash } = require('phpass')); } catch (e) { }

const app = express();
let server = null;

// Enable trust proxy for Railway and other reverse proxies
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const SECRET_KEY = RESOLVED_SECRET_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const ALLOW_BOOTSTRAP_ADMIN = toBoolean(process.env.ALLOW_BOOTSTRAP_ADMIN, process.env.NODE_ENV !== 'production');
const WP_SYNC_ON_STARTUP = toBoolean(process.env.WP_SYNC_ON_STARTUP, false);
const WP_SYNC_FULL_REPLACE = toBoolean(process.env.WP_SYNC_FULL_REPLACE, true);
const FORCED_ADMIN_LOGINS = parseCsvSet(process.env.FORCED_ADMIN_LOGINS);
const VISITOR_ID_HASH_SALT = process.env.VISITOR_ID_HASH_SALT || SECRET_KEY;
const ALLOW_LEGACY_PLAINTEXT_PASSWORDS = toBoolean(process.env.ALLOW_LEGACY_PLAINTEXT_PASSWORDS, false);
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || '').trim();

// Where uploaded avatars and chat attachments live.
//
// Railway mounts the persistent volume at /app/data — and ONLY there. The previous default,
// <app>/uploads, sat in the container's ephemeral layer, so every deploy silently destroyed every
// uploaded file while the database kept pointing at it: the row still said /uploads/123.png, the
// file was gone, and the avatar fell back to initials. That is the "I saved my profile and it
// reset" symptom. Uploads belong on the volume, next to the database.
const LEGACY_UPLOADS_DIR = path.join(__dirname, 'uploads');
const RAILWAY_VOLUME_DIR = '/app/data';

const resolveUploadsDir = () => {
    if (process.env.UPLOADS_DIR) {
        return path.resolve(process.env.UPLOADS_DIR);
    }

    // Follow the database onto the volume: DATABASE_PATH wins, then the standard Railway mount.
    if (process.env.DATABASE_PATH) {
        return path.join(path.dirname(path.resolve(process.env.DATABASE_PATH)), 'uploads');
    }

    if (fs.existsSync(RAILWAY_VOLUME_DIR)) {
        return path.join(RAILWAY_VOLUME_DIR, 'uploads');
    }

    return LEGACY_UPLOADS_DIR;
};

const uploadsDir = resolveUploadsDir();
// bcrypt work factor. 12 costs roughly 4x more per guess than 10 while staying well under a
// tenth of a second per login, so it slows offline cracking of a leaked table without being
// felt by users. Existing hashes keep verifying: the cost is embedded in each stored hash.
const BCRYPT_ROUNDS = Number.parseInt(process.env.BCRYPT_ROUNDS || '', 10) || 12;

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Middleware
if (helmet) {
    // The CSP is set by the dedicated middleware below (one authority for the policy, so the two
    // can't disagree). Everything else helmet ships — HSTS, nosniff, frameguard, referrer policy,
    // cross-origin isolation — stays on.
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: false,
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        hsts: IS_PRODUCTION ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
    }));
} else {
    // Manual Security Headers
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        if (IS_PRODUCTION) {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        }
        next();
    });
}

if (compression) {
    app.use(compression());
}

// CORS Configuration
// Set ALLOWED_ORIGINS="https://legio.news,https://www.legio.news" in the Railway variables.
// Production deliberately refuses to fall back to "allow every origin": the frontend is served by
// this same process, so browser traffic is same-origin and needs no CORS grant at all. Anything
// cross-origin in production is a third-party site calling the API and must be opted in by name.
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)
    : null;

if (IS_PRODUCTION && !allowedOrigins) {
    console.log('ALLOWED_ORIGINS is not set: only same-origin browser requests are permitted. ' +
        'The bundled frontend is same-origin, so this is the expected configuration.');
}

// The app's own origin, derived per request. `trust proxy` is on, so req.protocol reflects
// X-Forwarded-Proto and this matches the public https:// URL behind Railway's edge.
const getSelfOrigin = (req) => {
    const host = req.get('host');
    return host ? `${req.protocol}://${host}` : null;
};

// Pure policy decision, kept free of req/env so it can be exercised directly for any combination
// of environment and allowlist — including production, which the test process does not run under.
const isOriginAllowed = ({ origin, selfOrigin, allowlist, isProduction }) => {
    // Same origin as the page being served. This case MUST be allowed: Vite marks the bundle and
    // stylesheet with crossorigin, which makes the browser send an Origin header even for
    // same-origin asset loads. Treating those as cross-origin serves the app its own JS/CSS as an
    // error body, and the site renders blank.
    if (selfOrigin && origin === selfOrigin) {
        return true;
    }

    if (allowlist) {
        // A literal "*" alongside credentials:true is not a valid CORS response, so it is
        // treated as an explicit opt-out of origin checks rather than echoed back.
        return allowlist.includes(origin) || allowlist.includes('*');
    }

    // No allowlist configured: permissive in development only.
    return !isProduction;
};

app.use(cors((req, callback) => {
    const origin = req.headers.origin;

    // No Origin header at all: a plain navigation, curl, or a server-to-server call. There is
    // nothing for CORS to decide, and no headers are needed.
    if (!origin) {
        return callback(null, { origin: false, credentials: true });
    }

    const allowed = isOriginAllowed({
        origin,
        selfOrigin: getSelfOrigin(req),
        allowlist: allowedOrigins,
        isProduction: IS_PRODUCTION,
    });

    if (!allowed) {
        // Deny by *omitting* the CORS headers, never by throwing. An error here would reach the
        // error handler and answer with a 500 — turning a policy decision into a broken response
        // for the caller and a spurious server fault in the logs. Without the headers the browser
        // itself refuses to expose the response, which is exactly how CORS is meant to work.
        console.warn(`CORS: not exposing response to origin ${origin}`);
    }

    return callback(null, {
        origin: allowed ? origin : false,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    });
}));

// Content Security Policy
app.use((req, res, next) => {
    // Allow Railway and custom origins
    const defaultOrigins = "'self' http://localhost:3000 http://localhost:3001 http://localhost:5173 https://*.railway.app";
    const cspOrigins = process.env.CSP_CONNECT_ORIGINS
        ? `${defaultOrigins} ${process.env.CSP_CONNECT_ORIGINS}`
        : defaultOrigins;

    res.setHeader('Content-Security-Policy',
        "default-src 'self'; " +
        // No 'unsafe-inline' and no third-party CDN: every script ships from this origin as a
        // bundled file. That is what turns an injected <script> from "executes" into "blocked",
        // so it must not be relaxed to make an inline snippet work — move the snippet to a file.
        "script-src 'self'; " +
        // Inline styles stay allowed: React writes style attributes and Tailwind injects a
        // stylesheet at runtime. Inline CSS cannot execute code, so the risk is far lower.
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' data: https://fonts.gstatic.com; " +
        "img-src 'self' data: https: blob:; " + // blob: for temporary image URLs
        `connect-src ${cspOrigins}; ` +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "frame-ancestors 'none'; " +
        "upgrade-insecure-requests"
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
});

// 10 MB of JSON on every endpoint was a free denial-of-service lever: no route needs it (the
// longest field is a 5 000-character description, and files travel as multipart, not JSON).
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '256kb' }));

// Serve uploads directory. User-supplied bytes are served from the app's own origin, so lock the
// path down: never sniff a declared type, never execute anything the file might contain, and
// never let it be framed.
app.use('/uploads', (req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
}, express.static(uploadsDir, {
    // Uploaded names are server-generated and immutable, so they cache well.
    maxAge: '7d',
    // Don't fall through to the SPA handler for a missing file — that would answer a broken
    // image request with index.html.
    fallthrough: false,
    index: false,
    dotfiles: 'deny',
}));

// Note: Static files and SPA fallback are configured at the end of the file after all API routes

// Rate Limiting
if (rateLimit) {
    // 100 per 15 minutes was far below what one honest visitor generates. Opening the app costs
    // several calls (session, feed, categories, leaders, monthly event), and each of those is
    // re-read while the tab is open — so an ordinary browsing session hit the ceiling and the app
    // locked the user out of their own site with 429s on every panel.
    //
    // 600 per 15 minutes (~40/min) leaves a real user far from the limit while still stopping a
    // scraper. Preflights are excluded: a browser sends them automatically and they carry no cost.
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: Number.parseInt(process.env.RATE_LIMIT_MAX || '', 10) || 600,
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => req.method === 'OPTIONS',
        message: { message: "Too many requests. Please try again later." },
    });
    app.use('/api/', limiter);

    // Only FAILED sign-ins count (skipSuccessfulRequests), so this is a brute-force guard, not a
    // usage cap. 5 per hour punished ordinary typos with an hour-long lockout and, on a shared or
    // mobile-NAT address, locked out everyone behind it. 10 per 15 minutes still caps an attacker
    // at 40 guesses an hour against a password that needs upper, lower and a digit.
    const loginLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: Number.parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '', 10) || 10,
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests: true,
        message: { message: "Слишком много попыток входа. Попробуйте через 15 минут." }
    });
    const registerLimiter = rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests: true,
        message: { message: "Слишком много попыток регистрации. Попробуйте позже." }
    });
    // Changing a password or an email is the step an account takeover has to pass through, and
    // it is also the cheapest place to brute-force a session. Cap it well below the global limit.
    const accountUpdateLimiter = rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: { message: "Too many account update attempts. Please try again later." }
    });
    // Uploads cost disk, not just CPU: 5 MB a piece with no cap would let one account fill the
    // Railway volume.
    const uploadLimiter = rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 40,
        standardHeaders: true,
        legacyHeaders: false,
        message: { message: "Upload limit reached. Please try again later." }
    });

    app.use('/api/auth/login', loginLimiter);
    app.use('/api/auth/register', registerLimiter);
    app.use('/api/user/security', accountUpdateLimiter);
    app.use('/api/upload', uploadLimiter);
} else {
    // Simple Custom Rate Limiter
    const createSimpleLimiter = ({ windowMs, max, message }) => {
        const rateLimitMap = new Map();

        return (req, res, next) => {
            const ip = req.ip;
            const now = Date.now();

            const data = rateLimitMap.get(ip);
            if (!data || now - data.startTime > windowMs) {
                rateLimitMap.set(ip, { count: 1, startTime: now });
                return next();
            }

            if (data.count >= max) {
                return res.status(429).json({ message });
            }

            data.count += 1;
            next();
        };
    };

    // Kept in step with the express-rate-limit values above, for the fallback path where that
    // package isn't installed.
    const simpleLimiter = createSimpleLimiter({
        windowMs: 15 * 60 * 1000,
        max: Number.parseInt(process.env.RATE_LIMIT_MAX || '', 10) || 600,
        message: "Too many requests. Please try again later."
    });
    const simpleAuthLimiter = createSimpleLimiter({
        windowMs: 15 * 60 * 1000,
        max: 10,
        message: "Слишком много попыток входа. Попробуйте через 15 минут."
    });

    app.use('/api/', simpleLimiter);
    app.use('/api/auth/login', simpleAuthLimiter);
    app.use('/api/auth/register', simpleAuthLimiter);
}

const sendValidationError = (res, error) => {
    const payload = { message: error.message || 'Validation failed' };
    if (error.details) {
        payload.errors = error.details;
    }
    return res.status(400).json(payload);
};

// Internal failures are logged in full and reported as a fixed string. Raw driver messages
// describe tables, columns and constraints by name — that is a free schema map for an attacker,
// and it is never actionable for the user. Both keys are kept because clients read either one.
const sendServerError = (res, error, context = 'Request failed') => {
    console.error(`${context}:`, error);
    return res.status(500).json({
        message: 'Internal server error',
        error: 'Internal server error',
    });
};

const createValidationError = (field, message) => {
    const error = new Error('Validation failed');
    error.details = [{ field, message }];
    return error;
};

const throwIfValidationErrors = (errors) => {
    if (errors.length > 0) {
        const error = new Error('Validation failed');
        error.details = errors;
        throw error;
    }
};

const sanitizeTextInput = (value, {
    allowNewlines = false,
    trim = true,
    collapseWhitespace = true,
} = {}) => {
    let normalized = String(value ?? '').normalize('NFKC').replace(/\r\n/g, '\n');
    normalized = normalized.replace(
        allowNewlines ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g,
        ' '
    );
    normalized = normalized.replace(/<[^>]*>/g, '');

    if (allowNewlines) {
        normalized = normalized
            .split('\n')
            .map((line) => collapseWhitespace ? line.replace(/[^\S\n]+/g, ' ').trimEnd() : line)
            .join('\n')
            .replace(/\n{3,}/g, '\n\n');
    } else if (collapseWhitespace) {
        normalized = normalized.replace(/\s+/g, ' ');
    }

    return trim ? normalized.trim() : normalized;
};

const parsePositiveInt = (value, field) => {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw createValidationError(field, `${field} must be a positive integer`);
    }
    return parsed;
};

const parseOptionalPositiveInt = (value, field) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    return parsePositiveInt(value, field);
};

const parseBoundedInt = (value, field, {
    min = 1,
    max = Number.MAX_SAFE_INTEGER,
    defaultValue = min,
} = {}) => {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }

    const parsed = parsePositiveInt(value, field);
    if (parsed < min || parsed > max) {
        throw createValidationError(field, `${field} must be between ${min} and ${max}`);
    }

    return parsed;
};

const escapeSqlLike = (value) => String(value || '').replace(/[\\%_]/g, '\\$&');

// Case-fold for search. `toLowerCase()` on its own leaves "İ"-style edge cases and combining marks
// inconsistent, so normalise first — this is the one place case folding happens, and both the
// stored column and the query pattern must go through it or they will not agree.
const foldForSearch = (value) => String(value ?? '').normalize('NFKC').toLowerCase();

// The haystack a news item is searched by: its title, its body and its tags, folded and flattened
// into one string. Tags are included deliberately — searching "спорт" should find a post tagged
// Спорт even when the word appears nowhere in the text.
//
// See ensureSearchIndex below: a row without this value is effectively invisible to Cyrillic
// search, because SQL has no Unicode-aware fallback to offer.
const buildNewsSearchText = ({ title, description, tags }) => {
    let tagList = [];

    if (Array.isArray(tags)) {
        tagList = tags;
    } else if (typeof tags === 'string' && tags.trim()) {
        try {
            const parsed = JSON.parse(tags);
            if (Array.isArray(parsed)) tagList = parsed;
        } catch {
            // Not JSON (legacy rows may hold a bare string) — treat the whole value as one tag.
            tagList = [tags];
        }
    }

    return foldForSearch([
        title || '',
        description || '',
        tagList.map((tag) => String(tag ?? '')).join(' '),
    ].join(' ')).replace(/\s+/g, ' ').trim();
};

const validateUrl = (value, field, { allowRelative = false, allowEmpty = true } = {}) => {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return null;
    }

    const rawValue = String(value).trim();
    if (!rawValue) {
        return allowEmpty ? '' : null;
    }

    if (rawValue.length > 500) {
        throw createValidationError(field, `${field} is too long`);
    }

    if (allowRelative && rawValue.startsWith('/')) {
        if (!/^\/[A-Za-z0-9/_\-\\.]+$/.test(rawValue)) {
            throw createValidationError(field, `${field} contains an invalid relative path`);
        }
        return rawValue;
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(rawValue);
    } catch (error) {
        throw createValidationError(field, `${field} must be a valid URL`);
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw createValidationError(field, `${field} must use http or https`);
    }

    return parsedUrl.toString();
};

const validateUsername = (value, { required = true } = {}) => {
    const rawValue = String(value || '').trim().normalize('NFKC');
    if (!rawValue) {
        if (required) {
            throw createValidationError('username', 'Username is required');
        }
        return '';
    }

    if (rawValue.length < 3 || rawValue.length > 80) {
        throw createValidationError('username', 'Username must be between 3 and 80 characters');
    }

    if (!/^[\p{L}\p{N}._@+-]+$/u.test(rawValue)) {
        throw createValidationError('username', 'Username contains unsupported characters');
    }

    return rawValue;
};

const validatePassword = (value, { required = true } = {}) => {
    if (value === undefined || value === null || value === '') {
        if (required) {
            throw createValidationError('password', 'Password is required');
        }
        return '';
    }

    const rawValue = String(value);
    if (rawValue.length < 8 || rawValue.length > 128) {
        throw createValidationError('password', 'Password must be between 8 and 128 characters');
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/.test(rawValue)) {
        throw createValidationError('password', 'Password must include uppercase, lowercase and a number');
    }

    return rawValue;
};

const getClientIp = (req) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    return String(ip).split(',')[0].trim();
};

const buildVisitorId = (req) => crypto
    .createHash('sha256')
    .update(`${VISITOR_ID_HASH_SALT}:${getClientIp(req)}:${req.get('user-agent') || ''}`)
    .digest('hex');

const buildUploadUrl = (req, filename) => {
    const safeFilename = encodeURIComponent(String(filename || ''));
    const relativePath = `/uploads/${safeFilename}`;

    if (PUBLIC_BASE_URL) {
        return new URL(relativePath, PUBLIC_BASE_URL).toString();
    }

    return relativePath;
};

// Database Setup
const db = require('./database');

// Backfill search_text for rows that lack it: everything written before the column existed, and
// anything from an import path that didn't set it.
//
// This is not optional housekeeping. There is no Unicode-aware fallback available in SQL — LOWER()
// and LIKE fold ASCII only — so a row with no search_text simply cannot be found by a Cyrillic
// query. Indexing is therefore a precondition of searching, not an optimisation, and the feed
// awaits it rather than trusting that some startup hook ran.
let searchIndexInFlight = null;

const backfillSearchIndex = async () => {
    const pending = await dbAllAsync(
        `SELECT id, title, description, tags FROM news
          WHERE search_text IS NULL OR search_text = ''`
    );

    if (pending.length === 0) return 0;

    await dbRunAsync('BEGIN IMMEDIATE TRANSACTION');
    try {
        for (const row of pending) {
            await dbRunAsync(
                'UPDATE news SET search_text = ? WHERE id = ?',
                [buildNewsSearchText(row), row.id]
            );
        }
        await dbRunAsync('COMMIT');
    } catch (error) {
        await dbRunAsync('ROLLBACK').catch(() => {});
        throw error;
    }

    console.log(`[Search] Indexed ${pending.length} news item(s) for case-insensitive search`);
    return pending.length;
};

const ensureSearchIndex = async () => {
    // Probe rather than memoise a "done" flag: caching completion forever would leave any row
    // written later by a path that forgets search_text permanently unsearchable until a restart.
    // This is one indexed single-row lookup, and it self-heals instead of relying on every future
    // write site remembering.
    const stale = await dbGetAsync(
        `SELECT id FROM news WHERE search_text IS NULL OR search_text = '' LIMIT 1`
    );
    if (!stale) return 0;

    // Concurrent searches share one backfill instead of each starting their own.
    if (!searchIndexInFlight) {
        searchIndexInFlight = backfillSearchIndex().finally(() => {
            searchIndexInFlight = null;
        });
    }

    return searchIndexInFlight;
};
let wpPasswordHasher = null;
if (PasswordHash) {
    try {
        // Some phpass JS ports throw when portable=true.
        wpPasswordHasher = new PasswordHash(8, false);
    } catch (error) {
        console.warn('phpass init failed, fallback to built-in portable hash verifier:', error.message || error);
        wpPasswordHasher = null;
    }
}

const dbRunAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
        if (err) return reject(err);
        resolve(this);
    });
});

const dbGetAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
    });
});

const dbAllAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
    });
});

const PHPASS_ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const phpPassEncode64 = (inputBuffer, count) => {
    let output = '';
    let i = 0;

    do {
        let value = inputBuffer[i++];
        output += PHPASS_ITOA64[value & 0x3f];

        if (i < count) {
            value |= inputBuffer[i] << 8;
        }
        output += PHPASS_ITOA64[(value >> 6) & 0x3f];

        if (i++ >= count) break;

        if (i < count) {
            value |= inputBuffer[i] << 16;
        }
        output += PHPASS_ITOA64[(value >> 12) & 0x3f];

        if (i++ >= count) break;
        output += PHPASS_ITOA64[(value >> 18) & 0x3f];
    } while (i < count);

    return output;
};

const verifyPortableWordpressHash = (plainPassword, storedHash) => {
    const hash = String(storedHash || '');
    if (!(hash.startsWith('$P$') || hash.startsWith('$H$')) || hash.length < 34) {
        return false;
    }

    const countLog2 = PHPASS_ITOA64.indexOf(hash[3]);
    if (countLog2 < 7 || countLog2 > 30) return false;

    const salt = hash.slice(4, 12);
    if (salt.length !== 8) return false;

    let digest = crypto.createHash('md5').update(salt + plainPassword, 'utf8').digest();
    const iterations = 1 << countLog2;

    for (let i = 0; i < iterations; i += 1) {
        digest = crypto
            .createHash('md5')
            .update(Buffer.concat([digest, Buffer.from(plainPassword, 'utf8')]))
            .digest();
    }

    const encoded = phpPassEncode64(digest, 16);
    const computed = hash.slice(0, 12) + encoded;
    return computed === hash;
};

const normalizeBcryptHash = (hash) => {
    if (!hash) return hash;
    let normalized = String(hash);

    if (normalized.startsWith('$wp$2')) {
        normalized = normalized.replace('$wp$', '$');
    }
    if (normalized.startsWith('$2y$')) {
        normalized = '$2a$' + normalized.slice(4);
    }

    return normalized;
};

const isBcryptHash = (hash) => {
    const normalized = normalizeBcryptHash(hash);
    return typeof normalized === 'string' && /^\$2[abxy]\$/.test(normalized);
};

const isPortableWpHash = (hash) => typeof hash === 'string' && (hash.startsWith('$P$') || hash.startsWith('$H$'));

// WordPress 6.8+ stores passwords as bcrypt over a base64(HMAC-SHA384) pre-hash of
// the password, wrapped with a "$wp$" prefix. The raw password MUST be pre-hashed the
// same way before bcrypt verification — otherwise even the correct password never
// matches. (This is how the vast majority of migrated legio.news users are stored.)
const wpBcryptPrehash = (plainPassword) =>
    crypto.createHmac('sha384', 'wp-sha384')
        .update(String(plainPassword).trim(), 'utf8')
        .digest('base64');

const verifyPassword = async (plainPassword, storedHash) => {
    if (!storedHash) return false;

    if (String(storedHash).startsWith('$wp$')) {
        return bcrypt.compare(wpBcryptPrehash(plainPassword), normalizeBcryptHash(storedHash));
    }

    if (isBcryptHash(storedHash)) {
        return bcrypt.compare(plainPassword, normalizeBcryptHash(storedHash));
    }

    if (isPortableWpHash(storedHash)) {
        if (verifyPortableWordpressHash(plainPassword, storedHash)) {
            return true;
        }

        if (wpPasswordHasher) {
            if (typeof wpPasswordHasher.checkPassword === 'function') {
                return wpPasswordHasher.checkPassword(plainPassword, storedHash);
            }
            if (typeof wpPasswordHasher.CheckPassword === 'function') {
                return wpPasswordHasher.CheckPassword(plainPassword, storedHash);
            }
        }

        return false;
    }

    if (ALLOW_LEGACY_PLAINTEXT_PASSWORDS) {
        return String(plainPassword) === String(storedHash);
    }

    return false;
};

const shouldRehashPassword = (storedHash) => {
    if (!storedHash) return false;
    if (!isBcryptHash(storedHash)) return true;
    return String(storedHash).startsWith('$wp$');
};

const getPointsSettings = async () => {
    const row = await dbGetAsync(
        "SELECT start_points, wins_points, level_points FROM points_settings WHERE id = 1"
    ).catch(() => null);

    return {
        start_points: Number(row?.start_points) || DEFAULT_POINTS_SETTINGS.start_points,
        wins_points: Number(row?.wins_points) || DEFAULT_POINTS_SETTINGS.wins_points,
        level_points: Number(row?.level_points) || DEFAULT_POINTS_SETTINGS.level_points,
    };
};

const syncWordpressIfConfigured = async ({ fullReplace = WP_SYNC_FULL_REPLACE } = {}) => {
    if (!isWordpressSyncConfigured()) {
        return { skipped: true, reason: 'WP_DB_* is not configured' };
    }

    return syncWordpressToSQLite({
        db,
        fullReplace,
        logger: console,
    });
};

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

console.log('Uploads path:', uploadsDir);

// One-time carry-over: anything still in the old ephemeral location is copied onto the volume the
// first time this build boots, so files uploaded before the path changed survive instead of
// disappearing at the next deploy. Copy (not move) and never overwrite — this must be safe to
// re-run, and it must not touch a file the new location already owns.
if (uploadsDir !== LEGACY_UPLOADS_DIR && fs.existsSync(LEGACY_UPLOADS_DIR)) {
    try {
        const legacyFiles = fs.readdirSync(LEGACY_UPLOADS_DIR, { withFileTypes: true })
            .filter((entry) => entry.isFile());
        let migrated = 0;

        for (const entry of legacyFiles) {
            const target = path.join(uploadsDir, entry.name);
            if (fs.existsSync(target)) continue;
            fs.copyFileSync(path.join(LEGACY_UPLOADS_DIR, entry.name), target);
            migrated += 1;
        }

        if (migrated > 0) {
            console.log(`Migrated ${migrated} upload(s) from ${LEGACY_UPLOADS_DIR} to ${uploadsDir}`);
        }
    } catch (error) {
        console.error('Failed to migrate legacy uploads:', error.message);
    }
}

// Multer Setup
const MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024;
const MAX_CHAT_ATTACHMENTS = 4;
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
]);
const ALLOWED_UPLOAD_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        const extension = path.extname(String(file.originalname || '')).toLowerCase();
        const safeExtension = ALLOWED_UPLOAD_EXTENSIONS.has(extension) ? extension : '';
        cb(null, `${uniqueSuffix}${safeExtension}`);
    }
});

const fileFilter = (req, file, cb) => {
    const extension = path.extname(String(file.originalname || '')).toLowerCase();
    // createValidationError so the rejection surfaces as a 400 with the reason, instead of being
    // swallowed by the catch-all handler and answered with an opaque 500.
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
        return cb(createValidationError('file', 'Only JPEG, PNG, GIF and WEBP images are allowed'));
    }
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
        return cb(createValidationError('file', 'Invalid file extension'));
    }
    file.originalname = path.basename(String(file.originalname || '')).replace(/[^A-Za-z0-9._-]/g, '');
    return cb(null, true);
};

const upload = multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_FILE_SIZE, files: MAX_CHAT_ATTACHMENTS },
    fileFilter
});

// --- Middleware ---

// Sessions are bearer tokens held in localStorage, so a leaked token is a usable credential for
// as long as it stays valid. Bounding that window is the only revocation this design has.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_ALGORITHM = 'HS256';

const signAuthToken = ({ id, username, role }) => jwt.sign(
    { id, username, role },
    SECRET_KEY,
    { expiresIn: JWT_EXPIRES_IN, algorithm: JWT_ALGORITHM }
);

// Pinning the algorithm stops a token from choosing its own verification scheme, and requiring a
// live `exp` claim retires the never-expiring tokens issued before expiry existed — those are
// permanent credentials that no password change can revoke. Everyone signs in once more, after
// which the frontend clears the stale token on its own (AuthContext drops it when /auth/me fails).
const verifyAuthToken = (token) => {
    const payload = jwt.verify(token, SECRET_KEY, { algorithms: [JWT_ALGORITHM] });

    if (!payload || typeof payload.exp !== 'number') {
        const error = new Error('Token has no expiry');
        error.name = 'TokenExpiredError';
        throw error;
    }

    return payload;
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    let user;
    try {
        user = verifyAuthToken(token);
    } catch (error) {
        // 401, not 403: the credential is missing/stale and the client should re-authenticate.
        return res.status(401).json({ message: 'Session expired. Please login again.' });
    }

    db.get("SELECT id FROM users WHERE id = ?", [user.id], (dbErr, dbUser) => {
        if (dbErr) return res.status(500).json({ message: "Database error" });
        if (!dbUser) {
            return res.status(401).json({ message: "Token user no longer exists. Please login again." });
        }

        req.user = user;

        // Update last_seen
        db.run("UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?", [user.id]);

        next();
    });
};

const requireAdmin = (req, res, next) => {
    // Check DB for current role to avoid stale token issues
    db.get("SELECT role FROM users WHERE id = ?", [req.user.id], (err, user) => {
        if (err) return res.sendStatus(500);
        if (!user || user.role !== 'admin') return res.sendStatus(403);
        next();
    });
};

const requireCreatorOrAdmin = (req, res, next) => {
    db.get("SELECT role FROM users WHERE id = ?", [req.user.id], (err, user) => {
        if (err) return res.sendStatus(500);
        if (!user || (user.role !== 'admin' && user.role !== 'creator')) return res.sendStatus(403);
        next();
    });
};

const getUserFromToken = (req) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return null;
    try {
        const user = verifyAuthToken(token);
        // Update last_seen
        db.run("UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?", [user.id]);
        return user;
    } catch (e) {
        return null;
    }
};

const getUserIdFromToken = (req) => {
    const user = getUserFromToken(req);
    return user ? user.id : null;
};

const isForcedAdminLogin = (login) => FORCED_ADMIN_LOGINS.has(normalizeLogin(login));

const enforceForcedAdminRoles = async () => {
    for (const forcedLogin of FORCED_ADMIN_LOGINS) {
        await dbRunAsync(
            "UPDATE users SET role = 'admin' WHERE LOWER(username) = LOWER(?)",
            [forcedLogin]
        );
    }
};

const CATEGORY_LABELS_RU = {
    avto: 'Авто',
    'bankovskij-sektor': 'Банковский сектор',
    zhile: 'Жилье',
    zdorove: 'Здоровье',
    kino: 'Кино',
    kriptovalyuta: 'Криптовалюта',
    obshhestvo: 'Общество',
    politika: 'Политика',
    semya: 'Семья',
    sport: 'Спорт',
    turizm: 'Туризм',
    ekologiya: 'Экология',
    ekonomika: 'Экономика',
    blagoustrojstvo: 'Благоустройство',
    'bez-rubriki': 'Без рубрики',
    general: 'Общее',
    auto: 'Авто',
    finance: 'Банковский сектор',
    housing: 'Жилье',
    health: 'Здоровье',
    cinema: 'Кино',
    crypto: 'Криптовалюта',
    society: 'Общество',
    politics: 'Политика',
    family: 'Семья',
    tourism: 'Туризм',
    ecology: 'Экология',
    economy: 'Экономика',
};

const formatCategoryLabel = (categoryId) => {
    const key = String(categoryId || '').trim().toLowerCase();
    if (!key) return 'Общее';
    if (CATEGORY_LABELS_RU[key]) return CATEGORY_LABELS_RU[key];
    return key
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (m) => m.toUpperCase());
};

const ALLOWED_ROLE_UPDATES = new Set(['user', 'creator', 'admin']);
const ALLOWED_NEWS_CATEGORIES = new Set(Object.keys(CATEGORY_LABELS_RU));

const validateDisplayName = (value, field = 'name') => {
    if (value === undefined) {
        return undefined;
    }

    if (value === null || String(value).trim() === '') {
        return null;
    }

    const sanitized = sanitizeTextInput(value);
    if (sanitized.length < 2 || sanitized.length > 50) {
        throw createValidationError(field, `${field} must be between 2 and 50 characters`);
    }

    return sanitized;
};

const validateBirthdate = (value) => {
    if (value === undefined) {
        return undefined;
    }

    if (value === null || String(value).trim() === '') {
        return null;
    }

    const rawValue = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
        throw createValidationError('birthdate', 'Birthdate must use YYYY-MM-DD format');
    }

    const parsedDate = new Date(`${rawValue}T00:00:00.000Z`);
    if (Number.isNaN(parsedDate.getTime())) {
        throw createValidationError('birthdate', 'Birthdate is invalid');
    }

    const now = new Date();
    if (parsedDate > now) {
        throw createValidationError('birthdate', 'Birthdate cannot be in the future');
    }

    return rawValue;
};

const validateCategory = (value) => {
    const normalized = sanitizeTextInput(value || 'general').toLowerCase();
    if (!normalized || !ALLOWED_NEWS_CATEGORIES.has(normalized)) {
        throw createValidationError('category', 'Category is invalid');
    }
    return normalized;
};

const validateFeedCategory = (value) => {
    if (value === undefined || value === null || value === '') {
        return 'all';
    }

    const normalized = sanitizeTextInput(value).toLowerCase();
    if (normalized === 'all' || normalized === 'favorites') {
        return normalized;
    }

    return validateCategory(normalized);
};

// The feed can be narrowed to posts whose poll is still open (the "Незавершённые опросы" tab,
// where anyone can still cast a vote) or to posts whose poll already has a verdict.
const FEED_POLL_STATUSES = new Set(['all', 'open', 'resolved']);

const validateFeedPollStatus = (value) => {
    if (value === undefined || value === null || value === '') {
        return 'all';
    }

    const normalized = sanitizeTextInput(value).toLowerCase();
    if (!FEED_POLL_STATUSES.has(normalized)) {
        throw createValidationError('pollStatus', 'pollStatus must be one of: all, open, resolved');
    }

    return normalized;
};

// Who voted for what is admin-only information: creators can create and resolve polls, but they
// must not be able to tie a vote back to a person. Everyone (creators included) still gets the
// aggregated counts/percentages.
const canViewVoters = (role) => role === 'admin';

// Each period declares the bucket granularity and how many buckets to render.
const STATISTICS_PERIODS = new Map([
    ['24h', { granularity: 'hour', buckets: 24 }],
    ['7d', { granularity: 'day', buckets: 7 }],
    ['30d', { granularity: 'day', buckets: 30 }],
    ['12m', { granularity: 'month', buckets: 12 }],
]);

const validateStatisticsPeriod = (value) => {
    if (value === undefined || value === null || value === '') {
        return '30d';
    }

    const normalized = sanitizeTextInput(value).toLowerCase();
    if (!STATISTICS_PERIODS.has(normalized)) {
        throw createValidationError('period', 'Period is invalid');
    }

    return normalized;
};

// Whitelisted sort keys for the admin user table. The key is mapped to a fixed SQL
// expression at the call site — user input never reaches the ORDER BY clause.
const ADMIN_USER_SORTS = new Set(['created_at', 'last_seen', 'points', 'username', 'name', 'role']);

const validateAdminUserSort = (value) => {
    if (value === undefined || value === null || value === '') {
        return 'created_at';
    }

    const normalized = sanitizeTextInput(value).toLowerCase();
    if (!ADMIN_USER_SORTS.has(normalized)) {
        throw createValidationError('sort', `sort must be one of: ${[...ADMIN_USER_SORTS].join(', ')}`);
    }

    return normalized;
};

const validateSortOrder = (value, fallback = 'desc') => {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    const normalized = sanitizeTextInput(value).toLowerCase();
    if (normalized !== 'asc' && normalized !== 'desc') {
        throw createValidationError('order', 'order must be asc or desc');
    }

    return normalized;
};

const validateBooleanFlag = (value, field, fallback = false) => {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true') {
        return true;
    }
    if (normalized === 'false') {
        return false;
    }

    throw createValidationError(field, `${field} must be true or false`);
};

const validateTags = (value) => {
    if (value === undefined || value === null || value === '') {
        return [];
    }

    if (!Array.isArray(value)) {
        throw createValidationError('tags', 'Tags must be an array');
    }

    const uniqueTags = [];
    const seenTags = new Set();

    for (const tag of value) {
        const sanitized = sanitizeTextInput(tag);
        if (!sanitized) {
            throw createValidationError('tags', 'Tags cannot be empty');
        }
        if (sanitized.length > 30) {
            throw createValidationError('tags', 'Each tag must be 30 characters or less');
        }
        if (!/^[\p{L}\p{N} ._#-]+$/u.test(sanitized)) {
            throw createValidationError('tags', 'Tag contains unsupported characters');
        }

        const normalized = sanitized.toLowerCase();
        if (!seenTags.has(normalized)) {
            seenTags.add(normalized);
            uniqueTags.push(sanitized);
        }
    }

    return uniqueTags;
};

const validatePoll = (poll) => {
    if (poll === undefined || poll === null || poll === '') {
        return null;
    }

    if (typeof poll !== 'object' || Array.isArray(poll)) {
        throw createValidationError('poll', 'Poll must be an object');
    }

    const question = sanitizeTextInput(poll.question);
    if (question.length < 5 || question.length > 200) {
        throw createValidationError('poll.question', 'Poll question must be between 5 and 200 characters');
    }

    if (!Array.isArray(poll.options)) {
        throw createValidationError('poll.options', 'Poll options must be an array');
    }

    if (poll.options.length < 2) {
        throw createValidationError('poll.options', 'Poll must contain at least 2 options');
    }

    const options = poll.options.map((option) => {
        const sanitized = sanitizeTextInput(option);
        if (sanitized.length < 1 || sanitized.length > 200) {
            throw createValidationError('poll.options', 'Each poll option must be between 1 and 200 characters');
        }
        return sanitized;
    });

    const uniqueOptions = new Set(options.map((option) => option.toLowerCase()));
    if (uniqueOptions.size !== options.length) {
        throw createValidationError('poll.options', 'Poll options must be unique');
    }

    // Optional poll end date (okonchanie_oprosa) — ported from the old WordPress version.
    let endsAt = null;
    if (poll.endDate !== undefined && poll.endDate !== null && String(poll.endDate).trim() !== '') {
        const raw = String(poll.endDate).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            throw createValidationError('poll.endDate', 'Poll end date must use YYYY-MM-DD format');
        }
        endsAt = raw;
    }

    return { question, options, endsAt };
};

const validateEmail = (value) => {
    const email = String(value ?? '').trim();
    if (!email) {
        throw createValidationError('email', 'Email обязателен');
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw createValidationError('email', 'Укажите корректный email');
    }
    return email;
};

// Registration keeps the email (login identifier, stored in `username`) and the display
// `name` separate — like the original site. They must not be identical.
const validateRegisterPayload = (body = {}) => {
    const email = validateEmail(body.email ?? body.username);
    const password = validatePassword(body.password);
    const name = validateDisplayName(body.name, 'name');
    if (!name) {
        throw createValidationError('name', 'Имя обязательно');
    }
    if (name.trim().toLowerCase() === email.toLowerCase()) {
        throw createValidationError('name', 'Имя и email не должны совпадать');
    }
    return { username: email, name, password };
};

const validateLoginPayload = (body = {}) => ({
    username: validateUsername(body.username),
    password: (() => {
        const password = String(body.password ?? '');
        if (!password) {
            throw createValidationError('password', 'Password is required');
        }
        if (password.length > 128) {
            throw createValidationError('password', 'Password is too long');
        }
        return password;
    })(),
});

const validateProfileUpdatePayload = (body = {}) => {
    const errors = [];
    let avatar;
    let name;
    let bio;
    let birthdate;

    try {
        avatar = validateUrl(body.avatar, 'avatar', { allowRelative: true });
    } catch (error) {
        errors.push(...(error.details || []));
    }

    try {
        name = validateDisplayName(body.name);
    } catch (error) {
        errors.push(...(error.details || []));
    }

    try {
        if (body.bio !== undefined) {
            bio = body.bio === null ? null : sanitizeTextInput(body.bio, { allowNewlines: true });
            if (bio !== null && bio.length > 500) {
                throw createValidationError('bio', 'Bio must be 500 characters or less');
            }
        }
    } catch (error) {
        errors.push(...(error.details || []));
    }

    try {
        birthdate = validateBirthdate(body.birthdate);
    } catch (error) {
        errors.push(...(error.details || []));
    }

    throwIfValidationErrors(errors);

    return { avatar, name, bio, birthdate };
};

const validateSecurityUpdatePayload = (body = {}) => {
    const errors = [];
    let username;
    let password;

    try {
        if (body.username !== undefined) {
            username = validateUsername(body.username);
        }
    } catch (error) {
        errors.push(...(error.details || []));
    }

    try {
        if (body.password !== undefined && body.password !== '') {
            password = validatePassword(body.password);
        }
    } catch (error) {
        errors.push(...(error.details || []));
    }

    if (body.username === undefined && (body.password === undefined || body.password === '')) {
        errors.push({ field: 'body', message: 'At least one field must be provided' });
    }

    throwIfValidationErrors(errors);

    return { username, password };
};

const validateNewsPayload = (body = {}) => ({
    title: (() => {
        const title = sanitizeTextInput(body.title);
        if (title.length < 5 || title.length > 200) {
            throw createValidationError('title', 'Title must be between 5 and 200 characters');
        }
        return title;
    })(),
    description: (() => {
        const description = sanitizeTextInput(body.description, { allowNewlines: true });
        if (description.length < 10 || description.length > 5000) {
            throw createValidationError('description', 'Description must be between 10 and 5000 characters');
        }
        return description;
    })(),
    image: validateUrl(body.image, 'image', { allowRelative: true }) ?? '',
    // Source (istochnik) — optional link to the news source, ported from the old version.
    source: validateUrl(body.source, 'source', { allowRelative: false }) ?? '',
    tags: validateTags(body.tags),
    poll: validatePoll(body.poll),
    category: validateCategory(body.category),
});

const validateReportPayload = (body = {}) => {
    const message = sanitizeTextInput(body.message, { allowNewlines: true });
    if (message.length < 5 || message.length > 1000) {
        throw createValidationError('message', 'Message must be between 5 and 1000 characters');
    }

    return {
        newsId: parseOptionalPositiveInt(body.newsId, 'newsId'),
        message,
    };
};

const validateDirectChatPayload = (body = {}) => ({
    targetUserId: parsePositiveInt(body.targetUserId, 'targetUserId'),
});

const validateChatMessagePayload = (body = {}, files = []) => {
    const content = body.content === undefined ? '' : sanitizeTextInput(body.content, { allowNewlines: true });
    if (content.length > 4000) {
        throw createValidationError('content', 'Content must be 4000 characters or less');
    }
    if (!content && files.length === 0) {
        throw createValidationError('content', 'Content or files required');
    }
    return { content };
};

const validateRolePayload = (body = {}) => {
    const role = sanitizeTextInput(body.role).toLowerCase();
    if (!ALLOWED_ROLE_UPDATES.has(role)) {
        throw createValidationError('role', 'Role is invalid');
    }
    return { role };
};

// --- Auth Routes ---

app.post('/api/auth/register', async (req, res) => {
    let username;
    let name;
    let password;

    try {
        ({ username, name, password } = validateRegisterPayload(req.body));
    } catch (error) {
        return sendValidationError(res, error);
    }

    try {
        const existingUser = await dbGetAsync(
            "SELECT id FROM users WHERE LOWER(username) = LOWER(?)",
            [username]
        );
        if (existingUser) {
            return res.status(400).json({ message: "Пользователь с таким email уже существует" });
        }

        const existingName = await dbGetAsync(
            "SELECT id FROM users WHERE LOWER(name) = LOWER(?)",
            [name]
        );
        if (existingName) {
            return res.status(400).json({ message: "Это имя уже занято, выберите другое" });
        }

        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`;

        const countRow = await dbGetAsync("SELECT COUNT(*) as count FROM users");
        const isFirstUser = Number(countRow?.count) === 0;
        const userRole = ((ALLOW_BOOTSTRAP_ADMIN && isFirstUser) || isForcedAdminLogin(username))
            ? 'admin'
            : 'user';

        const pointsSettings = await getPointsSettings();
        const startPoints = pointsSettings.start_points;
        const level = calculateLevel(startPoints);

        const insertResult = await dbRunAsync(
            "INSERT INTO users (username, password, role, points, level, avatar, name) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [username, hashedPassword, userRole, startPoints, level, avatarUrl, name]
        );

        await dbRunAsync(
            "INSERT INTO points_history (user_id, points, calculation_date, comment) VALUES (?, ?, CURRENT_TIMESTAMP, ?)",
            [insertResult.lastID, startPoints, "Начисление баллов за регистрацию"]
        );

        const token = signAuthToken({ id: insertResult.lastID, username, role: userRole });
        res.json({
            token, user: {
                id: insertResult.lastID,
                username,
                role: userRole,
                points: startPoints,
                level,
                avatar: avatarUrl,
                name,
                bio: null,
                birthdate: null
            }
        });
    } catch (error) {
        if (error && error.message && error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ message: "Email or Nickname already exists" });
        }
        console.error('Failed to register user:', error);
        res.status(500).json({ message: "Failed to register user" });
    }
});

app.post('/api/auth/login', (req, res) => {
    let username;
    let password;

    try {
        ({ username, password } = validateLoginPayload(req.body));
    } catch (error) {
        return sendValidationError(res, error);
    }

    db.get(
        `SELECT * FROM users
         WHERE LOWER(username) = LOWER(?) OR LOWER(name) = LOWER(?)
         ORDER BY CASE WHEN LOWER(username) = LOWER(?) THEN 0 ELSE 1 END
         LIMIT 1`,
        [username, username, username],
        async (err, user) => {
        if (err) return sendServerError(res, err);
        if (!user) return res.status(400).json({ message: "Invalid credentials" });

        const isValidPassword = await verifyPassword(password, user.password);

        if (isValidPassword) {
            if (isForcedAdminLogin(user.username) && user.role !== 'admin') {
                await dbRunAsync("UPDATE users SET role = 'admin' WHERE id = ?", [user.id]);
                user.role = 'admin';
            }

            if (shouldRehashPassword(user.password)) {
                try {
                    const rehashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
                    db.run("UPDATE users SET password = ? WHERE id = ?", [rehashedPassword, user.id]);
                } catch (rehashError) {
                    console.error('Failed to rehash legacy password:', rehashError.message);
                }
            }

            const token = signAuthToken({ id: user.id, username: user.username, role: user.role });
            // If name is null (old users), fallback to username
            const name = user.name || user.username;
            res.json({
                token, user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    points: user.points,
                    level: user.level || calculateLevel(user.points || 0),
                    avatar: user.avatar,
                    name,
                    bio: user.bio,
                    birthdate: user.birthdate,
                    created_at: user.created_at
                }
            });
        } else {
            res.status(400).json({ message: "Invalid credentials" });
        }
    });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    db.get("SELECT id, username, role, points, level, avatar, name, bio, birthdate, created_at FROM users WHERE id = ?", [req.user.id], (err, user) => {
        if (err) return sendServerError(res, err);
        if (!user) return res.status(401).json({ message: "User not found for token. Please login again." });
        if (user && !user.name) user.name = user.username;
        res.json(user);
    });
});

app.post('/api/user/update', authenticateToken, async (req, res) => {
    let avatar;
    let name;
    let bio;
    let birthdate;

    try {
        ({ avatar, name, bio, birthdate } = validateProfileUpdatePayload(req.body));
    } catch (error) {
        return sendValidationError(res, error);
    }

    const updates = [];
    const values = [];

    try {
        if (name !== undefined && name !== null) {
            const existingName = await dbGetAsync(
                "SELECT id FROM users WHERE LOWER(name) = LOWER(?) AND id != ?",
                [name, req.user.id]
            );
            if (existingName) {
                return res.status(400).json({ message: "This display name is already taken" });
            }
        }

        if (avatar !== undefined) {
            updates.push("avatar = ?");
            values.push(avatar);
        }
        if (name !== undefined) {
            updates.push("name = ?");
            values.push(name);
        }
        if (bio !== undefined) {
            updates.push("bio = ?");
            values.push(bio);
        }
        if (birthdate !== undefined) {
            updates.push("birthdate = ?");
            values.push(birthdate);
        }

        if (updates.length === 0) {
            return res.json({ message: "No changes" });
        }

        values.push(req.user.id);
        const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;

        await dbRunAsync(sql, values);

        const user = await dbGetAsync(
            "SELECT id, username, role, points, level, avatar, name, bio, birthdate FROM users WHERE id = ?",
            [req.user.id]
        );
        if (user && !user.name) user.name = user.username;
        res.json({ message: "Profile updated", user });
    } catch (error) {
        console.error('Failed to update profile:', error);
        res.status(500).json({ message: "Failed to update profile" });
    }
});

app.post('/api/user/security', authenticateToken, async (req, res) => {
    let username;
    let password;

    try {
        ({ username, password } = validateSecurityUpdatePayload(req.body));
    } catch (error) {
        return sendValidationError(res, error);
    }

    const updates = [];
    const values = [];

    try {
        if (username !== undefined) {
            const existing = await dbGetAsync(
                "SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?",
                [username, req.user.id]
            );
            if (existing) {
                return res.status(400).json({ message: "Username/Email already exists" });
            }

            updates.push("username = ?");
            values.push(username);
        }

        if (password) {
            const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
            updates.push("password = ?");
            values.push(hashedPassword);
        }

        if (updates.length === 0) {
            return res.json({ message: "No changes" });
        }

        values.push(req.user.id);
        const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        await dbRunAsync(sql, values);

        if (username && isForcedAdminLogin(username)) {
            await dbRunAsync("UPDATE users SET role = 'admin' WHERE id = ?", [req.user.id]);
        }

        res.json({ message: "Security settings updated. Please re-login." });
    } catch (error) {
        console.error('Failed to update security settings:', error);
        res.status(500).json({ message: "Failed to update security settings" });
    }
});

// Upload Route
app.post('/api/upload', authenticateToken, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
    }

    res.json({ url: buildUploadUrl(req, req.file.filename) });
});

// Track Visit
app.post('/api/visit', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const visitorId = buildVisitorId(req);

    db.run(
        "INSERT OR IGNORE INTO visitor_sessions (visitor_id, date) VALUES (?, ?)",
        [visitorId, today],
        function (err) {
            if (err) return sendServerError(res, err);
            if (this.changes === 0) {
                return res.json({ message: "Visit already recorded" });
            }

            db.run(
                "INSERT INTO visits (date, count) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET count = count + 1",
                [today],
                (visitErr) => {
                    if (visitErr) return res.status(500).json({ error: visitErr.message });
                    res.json({ message: "Visit recorded" });
                }
            );
        }
    );
});

// --- News/Poll Routes ---

// Get Feed (News + Polls)
// Build a single feed item (news + nested poll) in the exact shape the feed returns.
// Shared by GET /api/feed and GET /api/news/:id so a shared link renders identically.
// `showVoters` must come from canViewVoters() — voter identities never leave the server for
// anyone else, so a non-admin client cannot reveal them by tweaking the UI.
async function buildFeedItem(row, userId, showVoters) {
    const item = {
        id: row.id,
        title: row.title,
        description: row.description,
        image: row.image,
        category: row.category,
        tags: JSON.parse(row.tags || '[]'),
        source: row.source || '',
        date: row.created_at,
        isLiked: row.is_liked > 0,
        poll: null
    };

    if (!row.poll_id) return item;

    // Get options for this poll
    const options = await new Promise((resolve, reject) => {
        db.all(
            `SELECT po.id, po.text,
        (SELECT COUNT(*) FROM votes v WHERE v.option_id = po.id) as vote_count,
        (SELECT COUNT(*) FROM votes v WHERE v.poll_id = po.poll_id) as total_votes
        FROM poll_options po
        WHERE po.poll_id = ?`,
            [row.poll_id],
            async (err, opts) => {
                if (err) reject(err);
                else {
                    // Admins only: attach the list of people behind each option.
                    if (showVoters) {
                        const optsWithVoters = await Promise.all(opts.map(async (opt) => {
                            const voters = await new Promise((resVoters) => {
                                db.all(
                                    `SELECT v.user_id as voter_user_id,
                                            u.id, u.username, u.name, u.avatar, u.bio, u.birthdate, u.points, u.role, u.created_at
                                     FROM votes v
                                     LEFT JOIN users u ON v.user_id = u.id
                                     WHERE v.option_id = ?`,
                                    [opt.id],
                                    (err, rows) => {
                                        const safeRows = (rows || []).map((row) => {
                                            const fallbackId = Number(row?.voter_user_id) || 0;
                                            const safeId = Number(row?.id) || fallbackId;
                                            const safeUsername = row?.username || `user_${fallbackId || 'unknown'}`;
                                            const safeName = row?.name || safeUsername;

                                            return {
                                                id: safeId,
                                                username: safeUsername,
                                                name: safeName,
                                                avatar: row?.avatar || '',
                                                bio: row?.bio || '',
                                                birthdate: row?.birthdate || null,
                                                points: Number(row?.points) || 0,
                                                role: row?.role || 'user',
                                                created_at: row?.created_at || null
                                            };
                                        });
                                        resVoters(safeRows);
                                    }
                                );
                            });
                            return { ...opt, voters };
                        }));
                        resolve(optsWithVoters);
                    } else {
                        resolve(opts);
                    }
                }
            }
        );
    });

    // Check if user voted
    let userVotedOptionId = null;
    if (userId) {
        userVotedOptionId = await new Promise((resolve) => {
            db.get("SELECT option_id FROM votes WHERE user_id = ? AND poll_id = ?", [userId, row.poll_id], (err, voteRow) => {
                resolve(voteRow ? voteRow.option_id : null);
            });
        });
    }

    // Calculate percentages
    const formattedOptions = options.map(opt => ({
        id: opt.id,
        text: opt.text,
        percent: opt.total_votes > 0 ? Math.round((opt.vote_count / opt.total_votes) * 100) : 0,
        // Left out of the payload entirely for non-admins (JSON drops undefined keys).
        voters: showVoters ? (opt.voters || []) : undefined
    }));

    item.poll = {
        id: row.poll_id,
        question: row.question,
        options: formattedOptions,
        is_resolved: row.is_resolved,
        correct_option_id: row.correct_option_id,
        ends_at: row.ends_at || null,
        user_voted_option_id: userVotedOptionId // Flag for frontend
    };

    return item;
}

app.get('/api/feed', (req, res) => {
    const user = getUserFromToken(req);
    const userId = user ? user.id : 0;
    let category;
    let search;
    let page;
    let limit;
    let pollStatus;

    try {
        category = validateFeedCategory(req.query.category);
        search = req.query.search === undefined || req.query.search === null || req.query.search === ''
            ? ''
            : sanitizeTextInput(req.query.search);

        if (search.length > 100) {
            throw createValidationError('search', 'Search must be 100 characters or less');
        }

        page = parseBoundedInt(req.query.page, 'page', { min: 1, max: 100000, defaultValue: 1 });
        limit = parseBoundedInt(req.query.limit, 'limit', { min: 1, max: 100, defaultValue: 20 });
        pollStatus = validateFeedPollStatus(req.query.pollStatus);
    } catch (error) {
        return sendValidationError(res, error);
    }

    const offset = (page - 1) * limit;

    // Attach exactly one poll per post. A plain `ON n.id = p.news_id` join duplicates the
    // news row once per poll, which silently corrupts LIMIT/OFFSET paging (the same post
    // eats two slots on one page and the tail of the page is pushed into the next one).
    // Picking a single poll id keeps one row per post; when the feed is filtered by poll
    // state, pick the poll that actually matches the filter.
    const pollFilterClause = pollStatus === 'open'
        ? ' AND is_resolved = 0'
        : pollStatus === 'resolved'
            ? ' AND is_resolved = 1'
            : '';

    let query = `
        SELECT n.*,
               p.id as poll_id, p.question, p.correct_option_id, p.is_resolved, p.ends_at,
               (SELECT COUNT(*) FROM likes WHERE news_id = n.id AND user_id = ?) as is_liked
        FROM news n
        LEFT JOIN polls p
               ON p.id = (SELECT MIN(id) FROM polls WHERE news_id = n.id${pollFilterClause})
    `;

    const params = [userId || 0]; // userId parameter for is_liked subquery
    const conditions = [];

    if (category && category !== 'all') {
        if (category === 'favorites') {
            conditions.push(`n.id IN (SELECT news_id FROM likes WHERE user_id = ?)`);
            params.push(userId);
        } else {
            conditions.push(`n.category = ?`);
            params.push(category);
        }
    }

    if (search) {
        // Every whitespace-separated word must appear somewhere in the item (AND, not OR), so
        // "рубль курс" narrows the result instead of widening it.
        //
        // Matching runs against the pre-folded search_text column: SQLite's LIKE/LOWER only fold
        // ASCII, so comparing Cyrillic here directly would only match when the typed case happened
        // to equal the stored case. COALESCE keeps rows usable if the backfill has not reached them
        // yet — they fall back to the raw title, which is better than vanishing from search.
        const words = search.split(/\s+/).filter(Boolean).slice(0, 6);

        for (const word of words) {
            conditions.push(`COALESCE(n.search_text, LOWER(n.title)) LIKE ? ESCAPE '\\'`);
            params.push(`%${escapeSqlLike(foldForSearch(word))}%`);
        }
    }

    // Both poll filters imply "this post actually has a poll" — the join above already
    // narrowed the poll to one in the requested state, so a NULL means no such poll.
    if (pollStatus === 'open' || pollStatus === 'resolved') {
        conditions.push(`p.id IS NOT NULL`);
    }

    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // "Latest news" has to mean latest. created_at is TEXT and holds two shapes: SQLite's
    // "YYYY-MM-DD HH:MM:SS" (posts created here) and whatever the WordPress import carried
    // over (ISO strings with a "T", sometimes empty). Sorting those as raw strings misorders
    // same-day posts, because "T" sorts after " ". datetime() normalises both to one format;
    // the raw value is kept only as a fallback for anything unparseable, and n.id breaks ties
    // so paging stays stable when timestamps are identical (bulk imports share a timestamp —
    // without a unique tiebreaker LIMIT/OFFSET can repeat or skip rows between pages).
    const newsDateSort = `COALESCE(datetime(n.created_at), n.created_at, '0000-00-00')`;

    // Open polls are the ones people can still vote in, so lead with the ones closing soonest,
    // then the ones without a deadline, and push the ones already past their date to the end.
    query += pollStatus === 'open'
        ? ` ORDER BY CASE
                        WHEN p.ends_at IS NULL THEN 1
                        WHEN p.ends_at >= date('now') THEN 0
                        ELSE 2
                    END ASC,
                    p.ends_at ASC,
                    ${newsDateSort} DESC,
                    n.id DESC`
        : ` ORDER BY ${newsDateSort} DESC, n.id DESC`;

    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const continueWithViewerRole = (showVoters) => {
        db.all(query, params, (err, rows) => {
            if (err) return sendServerError(res, err);

            Promise.all(rows.map((row) => buildFeedItem(row, userId, showVoters)))
                .then(results => res.json(results))
                .catch(buildErr => sendServerError(res, buildErr, 'Failed to build feed'));
        });
    };

    const resolveViewerAndRespond = () => {
        if (!userId) {
            continueWithViewerRole(false);
            return;
        }

        db.get("SELECT role FROM users WHERE id = ?", [userId], (roleErr, dbUser) => {
            if (roleErr) {
                continueWithViewerRole(false);
                return;
            }
            continueWithViewerRole(canViewVoters(dbUser?.role));
        });
    };

    // A search can only match rows that have been indexed, so make sure they are before querying.
    // Memoised: this awaits real work on the first search after a deploy and is a no-op afterwards.
    if (search) {
        ensureSearchIndex()
            .then(resolveViewerAndRespond)
            .catch((error) => sendServerError(res, error, 'Failed to prepare search index'));
        return;
    }

    resolveViewerAndRespond();
});

// Fetch a single news item by id (used by shared /?news=<id> links to open the post directly)
app.get('/api/news/:id', (req, res) => {
    const user = getUserFromToken(req);
    const userId = user ? user.id : 0;

    let newsId;
    try {
        newsId = parsePositiveInt(req.params.id, 'id');
    } catch (error) {
        return sendValidationError(res, error);
    }

    // Pin the poll selection the same way the feed does, so a shared link and the feed
    // card always show the same poll instead of whichever row SQLite happens to return.
    const query = `
        SELECT n.*,
               p.id as poll_id, p.question, p.correct_option_id, p.is_resolved, p.ends_at,
               (SELECT COUNT(*) FROM likes WHERE news_id = n.id AND user_id = ?) as is_liked
        FROM news n
        LEFT JOIN polls p ON p.id = (SELECT MIN(id) FROM polls WHERE news_id = n.id)
        WHERE n.id = ?
    `;

    const respond = (showVoters) => {
        db.get(query, [userId || 0, newsId], (err, row) => {
            if (err) return sendServerError(res, err);
            if (!row) return res.status(404).json({ error: 'News not found' });

            buildFeedItem(row, userId, showVoters)
                .then(item => res.json(item))
                .catch(buildErr => res.status(500).json({ error: buildErr.message }));
        });
    };

    if (!userId) {
        respond(false);
        return;
    }

    db.get("SELECT role FROM users WHERE id = ?", [userId], (roleErr, dbUser) => {
        respond(!roleErr && canViewVoters(dbUser?.role));
    });
});

app.get('/api/categories', (req, res) => {
    db.all(
        `SELECT category, COUNT(*) AS count
         FROM news
         WHERE category IS NOT NULL AND TRIM(category) != ''
         GROUP BY category
         ORDER BY count DESC, category ASC`,
        [],
        (err, rows) => {
            if (err) return sendServerError(res, err);
            const categories = (rows || []).map((row) => ({
                id: row.category,
                name: formatCategoryLabel(row.category),
                count: Number(row.count) || 0,
            }));
            res.json(categories);
        }
    );
});

// Toggle Like
app.post('/api/news/:id/like', authenticateToken, (req, res) => {
    let newsId;

    try {
        newsId = parsePositiveInt(req.params.id, 'id');
    } catch (error) {
        return sendValidationError(res, error);
    }

    const userId = req.user.id;

    // Check if already liked
    db.get("SELECT * FROM likes WHERE user_id = ? AND news_id = ?", [userId, newsId], (err, row) => {
        if (err) return sendServerError(res, err);

        if (row) {
            // Unlike
            db.run("DELETE FROM likes WHERE user_id = ? AND news_id = ?", [userId, newsId], (deleteErr) => {
                if (deleteErr) return res.status(500).json({ error: deleteErr.message });
                res.json({ message: "Unliked", isLiked: false });
            });
        } else {
            // Like
            db.run("INSERT INTO likes (user_id, news_id) VALUES (?, ?)", [userId, newsId], (insertErr) => {
                if (insertErr) return res.status(500).json({ error: insertErr.message });
                res.json({ message: "Liked", isLiked: true });
            });
        }
    });
});

// Create News + Poll (Admin/Creator only)
app.post('/api/news', authenticateToken, requireCreatorOrAdmin, async (req, res) => {
    let payload;

    try {
        payload = validateNewsPayload(req.body);
    } catch (error) {
        return sendValidationError(res, error);
    }

    try {
        await dbRunAsync('BEGIN TRANSACTION');

        const newsResult = await dbRunAsync(
            "INSERT INTO news (title, description, image, tags, category, source, search_text) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                payload.title,
                payload.description,
                payload.image,
                JSON.stringify(payload.tags),
                payload.category,
                payload.source,
                // Folded once here so search never has to fold at query time.
                buildNewsSearchText(payload),
            ]
        );

        if (payload.poll) {
            const pollResult = await dbRunAsync(
                "INSERT INTO polls (news_id, question, ends_at) VALUES (?, ?, ?)",
                [newsResult.lastID, payload.poll.question, payload.poll.endsAt]
            );

            for (const option of payload.poll.options) {
                await dbRunAsync(
                    "INSERT INTO poll_options (poll_id, text) VALUES (?, ?)",
                    [pollResult.lastID, option]
                );
            }
        }

        await dbRunAsync('COMMIT');
        res.json({ message: "News created", id: newsResult.lastID });
    } catch (error) {
        await dbRunAsync('ROLLBACK').catch(() => null);
        console.error('Error creating news:', error);
        res.status(500).json({ message: "Failed to create news" });
    }
});

// Delete News (Admin/Creator only)
app.delete('/api/news/:id', authenticateToken, requireCreatorOrAdmin, (req, res) => {
    let newsId;

    try {
        newsId = parsePositiveInt(req.params.id, 'id');
    } catch (error) {
        return sendValidationError(res, error);
    }

    db.serialize(() => {
        // Delete related data first (optional if CASCADE is not set, but good practice)
        // Get poll id first
        db.get("SELECT id FROM polls WHERE news_id = ?", [newsId], (err, poll) => {
            if (poll) {
                db.run("DELETE FROM votes WHERE poll_id = ?", [poll.id]);
                db.run("DELETE FROM poll_options WHERE poll_id = ?", [poll.id]);
                db.run("DELETE FROM polls WHERE id = ?", [poll.id]);
            }
        });

        db.run("DELETE FROM likes WHERE news_id = ?", [newsId]);

        db.run("DELETE FROM news WHERE id = ?", [newsId], function (err) {
            if (err) return sendServerError(res, err);
            res.json({ message: "News deleted" });
        });
    });
});

// Vote
app.post('/api/polls/:id/vote', authenticateToken, (req, res) => {
    let pollId;
    let optionId;

    try {
        pollId = parsePositiveInt(req.params.id, 'id');
        optionId = parsePositiveInt(req.body.optionId, 'optionId');
    } catch (error) {
        return sendValidationError(res, error);
    }

    const userId = req.user.id;

    db.run("INSERT INTO votes (user_id, poll_id, option_id, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
        [userId, pollId, optionId],
        function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ message: "Already voted" });
                }
                return sendServerError(res, err);
            }
            res.json({ message: "Vote registered" });
        }
    );
});

// Resolve Poll (Admin/Creator only)
app.post('/api/polls/:id/resolve', authenticateToken, requireCreatorOrAdmin, async (req, res) => {
    let pollId;
    let correctOptionId;

    try {
        pollId = parsePositiveInt(req.params.id, 'id');
        correctOptionId = parsePositiveInt(req.body.correctOptionId, 'correctOptionId');
    } catch (error) {
        return sendValidationError(res, error);
    }

    try {
        const poll = await dbGetAsync(
            "SELECT id, is_resolved FROM polls WHERE id = ?",
            [pollId]
        );

        if (!poll) {
            return res.status(404).json({ message: "Poll not found" });
        }

        if (Number(poll.is_resolved) === 1) {
            return res.status(400).json({ message: "Poll already resolved" });
        }

        const option = await dbGetAsync(
            "SELECT id FROM poll_options WHERE id = ? AND poll_id = ?",
            [correctOptionId, pollId]
        );

        if (!option) {
            return res.status(400).json({ message: "Option does not belong to this poll" });
        }

        const settings = await getPointsSettings();
        const totalVotesRow = await dbGetAsync(
            "SELECT COUNT(*) as total FROM votes WHERE poll_id = ?",
            [pollId]
        );
        const totalVotes = Number(totalVotesRow?.total) || 0;

        const winners = await dbAllAsync(
            "SELECT user_id FROM votes WHERE poll_id = ? AND option_id = ?",
            [pollId, correctOptionId]
        );
        const winnersCount = winners.length;

        // Legacy formula from the old WordPress project:
        // points = wins_points + (100 - (user_vote_count / total_votes) * 100)
        let pointsToAward = 0;
        if (totalVotes > 0 && winnersCount > 0) {
            const rarityCoefficient = (winnersCount / totalVotes) * 100;
            pointsToAward = Math.max(0, Math.floor(settings.wins_points + (100 - rarityCoefficient)));
        }

        await dbRunAsync('BEGIN TRANSACTION');
        try {
            await dbRunAsync(
                "UPDATE polls SET correct_option_id = ?, is_resolved = 1 WHERE id = ?",
                [correctOptionId, pollId]
            );

            if (pointsToAward > 0 && winnersCount > 0) {
                for (const winner of winners) {
                    const winnerId = Number(winner.user_id);
                    if (!winnerId) continue;

                    await dbRunAsync(
                        "UPDATE users SET points = points + ? WHERE id = ?",
                        [pointsToAward, winnerId]
                    );

                    const updatedUser = await dbGetAsync(
                        "SELECT points FROM users WHERE id = ?",
                        [winnerId]
                    );
                    const updatedLevel = calculateLevel(updatedUser?.points || 0);
                    await dbRunAsync(
                        "UPDATE users SET level = ? WHERE id = ?",
                        [updatedLevel, winnerId]
                    );

                    await dbRunAsync(
                        "INSERT INTO points_history (user_id, points, calculation_date, comment) VALUES (?, ?, CURRENT_TIMESTAMP, ?)",
                        [winnerId, pointsToAward, `Начисление баллов за победу в опросе № ${pollId}`]
                    );
                }
            }

            await dbRunAsync('COMMIT');
        } catch (transactionError) {
            await dbRunAsync('ROLLBACK');
            throw transactionError;
        }

        res.json({
            message: "Poll resolved and points awarded",
            pointsAwarded: pointsToAward,
            winners: winnersCount,
            totalVotes
        });
    } catch (error) {
        console.error('Failed to resolve poll:', error);
        sendServerError(res, error);
    }
});

// List polls that still need a correct answer (Admin/Creator only).
// Lets moderators find & resolve open polls from one place instead of hunting
// through the feed.
app.get('/api/polls/pending', authenticateToken, requireCreatorOrAdmin, async (req, res) => {
    try {
        const polls = await dbAllAsync(
            `SELECT p.id as poll_id, p.question, p.ends_at, p.news_id,
                    n.title as news_title, n.image as news_image, n.category as news_category,
                    (SELECT COUNT(*) FROM votes v WHERE v.poll_id = p.id) as total_votes
             FROM polls p
             LEFT JOIN news n ON p.news_id = n.id
             WHERE p.is_resolved = 0
             ORDER BY (p.ends_at IS NULL), p.ends_at ASC, p.id DESC`,
            []
        );

        const result = await Promise.all(polls.map(async (poll) => {
            const options = await dbAllAsync(
                `SELECT po.id, po.text,
                        (SELECT COUNT(*) FROM votes v WHERE v.option_id = po.id) as vote_count
                 FROM poll_options po
                 WHERE po.poll_id = ?`,
                [poll.poll_id]
            );

            return {
                id: poll.poll_id,
                question: poll.question,
                news_id: poll.news_id,
                news_title: poll.news_title || '',
                news_image: poll.news_image || '',
                news_category: poll.news_category || '',
                ends_at: poll.ends_at || null,
                total_votes: Number(poll.total_votes) || 0,
                options: options.map((opt) => ({
                    id: opt.id,
                    text: opt.text,
                    vote_count: Number(opt.vote_count) || 0,
                })),
            };
        }));

        res.json(result);
    } catch (error) {
        console.error('Failed to list pending polls:', error);
        sendServerError(res, error);
    }
});

// --- Admin Routes ---

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    let sort;
    let order;

    try {
        sort = validateAdminUserSort(req.query.sort);
        order = validateSortOrder(req.query.order, sort === 'username' || sort === 'name' ? 'asc' : 'desc');
    } catch (error) {
        return sendValidationError(res, error);
    }

    // created_at is TEXT and mixes SQLite's "YYYY-MM-DD HH:MM:SS" with whatever the
    // WordPress import carried over, so sort on the parsed datetime and keep the raw
    // string only as a last-resort fallback. NULLs are pushed to the end either way.
    const sortExpressions = {
        created_at: "COALESCE(datetime(u.created_at), u.created_at, '0000-00-00')",
        last_seen: "COALESCE(datetime(u.last_seen), u.last_seen, '0000-00-00')",
        points: 'u.points',
        username: 'LOWER(u.username)',
        name: 'LOWER(COALESCE(NULLIF(u.name, \'\'), u.username))',
        role: 'LOWER(u.role)',
    };

    const direction = order === 'asc' ? 'ASC' : 'DESC';

    try {
        const rows = await dbAllAsync(
            `SELECT u.id, u.username, u.role, u.points, u.level, u.name, u.avatar,
                    u.created_at, u.last_seen,
                    (SELECT COUNT(*) FROM votes v WHERE v.user_id = u.id) AS votes_count
               FROM users u
              ORDER BY ${sortExpressions[sort]} ${direction}, u.id ASC`
        );

        res.json(rows);
    } catch (error) {
        console.error('Failed to list users:', error);
        sendServerError(res, error);
    }
});

// Everything the admin panel shows when a user row is opened: profile fields, activity
// counters, prediction accuracy, leaderboard standing and the recent points ledger.
app.get('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    let userId;

    try {
        userId = parsePositiveInt(req.params.id, 'id');
    } catch (error) {
        return sendValidationError(res, error);
    }

    try {
        const user = await dbGetAsync(
            `SELECT id, username, name, avatar, bio, birthdate, role, points, level,
                    created_at, last_seen
               FROM users
              WHERE id = ?`,
            [userId]
        );

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const month = getMonthWindow();
        const scalar = async (sql, params = [], field = 'value') => {
            const row = await dbGetAsync(sql, params);
            return Number(row?.[field]) || 0;
        };

        // A vote only counts as right/wrong once its poll has a verdict; everything
        // else is still pending and must not drag the accuracy down.
        const [
            votesTotal,
            votesCorrect,
            votesResolved,
            likesGiven,
            likesReceivedOnVotedNews,
            reportsSubmitted,
            messagesSent,
            monthlyPoints,
            monthlyWins,
            allTimeRank,
            pointsAwardsTotal,
        ] = await Promise.all([
            scalar('SELECT COUNT(*) AS value FROM votes WHERE user_id = ?', [userId]),
            scalar(
                `SELECT COUNT(*) AS value
                   FROM votes v
                   JOIN polls p ON p.id = v.poll_id
                  WHERE v.user_id = ? AND p.is_resolved = 1 AND p.correct_option_id = v.option_id`,
                [userId]
            ),
            scalar(
                `SELECT COUNT(*) AS value
                   FROM votes v
                   JOIN polls p ON p.id = v.poll_id
                  WHERE v.user_id = ? AND p.is_resolved = 1`,
                [userId]
            ),
            scalar('SELECT COUNT(*) AS value FROM likes WHERE user_id = ?', [userId]),
            scalar(
                `SELECT COUNT(*) AS value
                   FROM likes l
                  WHERE l.news_id IN (SELECT p.news_id FROM votes v JOIN polls p ON p.id = v.poll_id WHERE v.user_id = ?)`,
                [userId]
            ),
            scalar('SELECT COUNT(*) AS value FROM error_reports WHERE user_id = ?', [userId]),
            scalar('SELECT COUNT(*) AS value FROM messages WHERE sender_id = ?', [userId]),
            scalar(
                `SELECT COALESCE(SUM(points), 0) AS value
                   FROM points_history
                  WHERE user_id = ? AND calculation_date >= ? AND calculation_date < ?
                    AND COALESCE(kind, 'poll') <> 'prize'`,
                [userId, month.startSql, month.endSql]
            ),
            scalar(
                `SELECT COUNT(*) AS value
                   FROM points_history
                  WHERE user_id = ? AND calculation_date >= ? AND calculation_date < ?
                    AND COALESCE(kind, 'poll') <> 'prize'`,
                [userId, month.startSql, month.endSql]
            ),
            scalar(
                'SELECT COUNT(*) + 1 AS value FROM users WHERE points > (SELECT points FROM users WHERE id = ?)',
                [userId]
            ),
            scalar('SELECT COUNT(*) AS value FROM points_history WHERE user_id = ?', [userId]),
        ]);

        const monthlyRows = await getMonthlyLeaderRows(month);
        const monthlyRankIndex = monthlyRows.findIndex((row) => Number(row.id) === userId);

        const [lastVote, firstVote, topCategories, pointsHistory, totalUsers] = await Promise.all([
            dbGetAsync('SELECT created_at FROM votes WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [userId]),
            dbGetAsync('SELECT created_at FROM votes WHERE user_id = ? ORDER BY created_at ASC LIMIT 1', [userId]),
            dbAllAsync(
                `SELECT COALESCE(NULLIF(n.category, ''), 'general') AS category, COUNT(*) AS count
                   FROM votes v
                   JOIN polls p ON p.id = v.poll_id
                   JOIN news n ON n.id = p.news_id
                  WHERE v.user_id = ?
                  GROUP BY category
                  ORDER BY count DESC
                  LIMIT 5`,
                [userId]
            ),
            dbAllAsync(
                `SELECT id, points, calculation_date, comment
                   FROM points_history
                  WHERE user_id = ?
                  ORDER BY calculation_date DESC, id DESC
                  LIMIT 20`,
                [userId]
            ),
            dbGetAsync('SELECT COUNT(*) AS value FROM users'),
        ]);

        res.json({
            ...user,
            displayName: user.name || user.username,
            stats: {
                votesTotal,
                votesCorrect,
                votesWrong: Math.max(0, votesResolved - votesCorrect),
                votesPending: Math.max(0, votesTotal - votesResolved),
                votesResolved,
                accuracy: votesResolved > 0 ? Math.round((votesCorrect / votesResolved) * 100) : null,
                likesGiven,
                likesOnVotedNews: likesReceivedOnVotedNews,
                reportsSubmitted,
                messagesSent,
                pointsAwardsTotal,
                monthlyPoints,
                monthlyWins,
                allTimeRank,
                monthlyRank: monthlyRankIndex >= 0 ? monthlyRankIndex + 1 : null,
                totalUsers: Number(totalUsers?.value) || 0,
                firstVoteAt: firstVote?.created_at || null,
                lastVoteAt: lastVote?.created_at || null,
                month: month.key,
            },
            topCategories: topCategories.map((row) => ({
                id: row.category,
                label: formatCategoryLabel(row.category),
                count: Number(row.count) || 0,
            })),
            pointsHistory: pointsHistory.map((row) => ({
                id: row.id,
                points: Number(row.points) || 0,
                date: row.calculation_date,
                comment: row.comment,
            })),
        });
    } catch (error) {
        console.error('Failed to load user details:', error);
        sendServerError(res, error);
    }
});

app.post('/api/admin/users/:id/role', authenticateToken, requireAdmin, async (req, res) => {
    let role;
    let userId;

    try {
        ({ role } = validateRolePayload(req.body));
        userId = parsePositiveInt(req.params.id, 'id');
    } catch (error) {
        return sendValidationError(res, error);
    }

    try {
        const target = await dbGetAsync('SELECT id, role FROM users WHERE id = ?', [userId]);
        if (!target) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Demoting the only remaining admin locks everyone out of the panel permanently — there
        // is no recovery path short of editing the database by hand.
        if (target.role === 'admin' && role !== 'admin') {
            const admins = await dbGetAsync("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
            if ((Number(admins?.count) || 0) <= 1) {
                return res.status(400).json({
                    message: 'Нельзя снять роль администратора с последнего администратора. Сначала назначьте другого.',
                });
            }
        }

        await dbRunAsync('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
        res.json({ message: 'Role updated' });
    } catch (error) {
        console.error('Failed to update role:', error);
        res.status(500).json({ message: 'Failed to update role' });
    }
});

app.post('/api/admin/sync/wordpress', authenticateToken, requireAdmin, async (req, res) => {
    let fullReplace;

    try {
        fullReplace = validateBooleanFlag(req.body?.fullReplace, 'fullReplace', WP_SYNC_FULL_REPLACE);
    } catch (error) {
        return sendValidationError(res, error);
    }

    try {
        const stats = await syncWordpressIfConfigured({ fullReplace });
        await enforceForcedAdminRoles();
        if (stats.skipped) {
            return res.status(400).json({ message: stats.reason });
        }

        res.json({
            message: "WordPress sync completed",
            stats
        });
    } catch (error) {
        console.error('WordPress sync failed:', error);
        res.status(500).json({ message: error.message });
    }
});

// ---- Statistics helpers ------------------------------------------------

const STAT_PAD = (n) => String(n).padStart(2, '0');

// Format a Date as the exact string SQLite stores for CURRENT_TIMESTAMP
// ("YYYY-MM-DD HH:MM:SS", UTC) so lexicographic range comparisons line up.
const toSqlUtc = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
const toDateStr = (date) => date.toISOString().slice(0, 10);

const RU_MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

// Genitive: reads correctly in "ивент за июля"-style sentences written server-side.
const MONTH_NAMES_GENITIVE_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// ---- Monthly leaderboard ("event") helpers -----------------------------
//
// The monthly contest runs over a whole UTC calendar month: it opens at 00:00:00 on
// the 1st and the winner is locked in the moment the next month starts. Points earned
// inside the window come from points_history (written whenever a poll is resolved),
// NOT from users.points — that column is an all-time running total and can never be
// sliced by date.
const getMonthWindow = (now = new Date(), monthOffset = 0) => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset + 1, 1));

    return {
        start,
        end,
        // "YYYY-MM" — matches how points_history rows are grouped for display.
        key: `${start.getUTCFullYear()}-${STAT_PAD(start.getUTCMonth() + 1)}`,
        startSql: toSqlUtc(start),
        endSql: toSqlUtc(end),
    };
};

// The flat reward the monthly winner receives. Deliberately unrelated to how much they scored:
// the monthly total only decides WHO wins, the prize itself is a fixed amount.
const MONTHLY_PRIZE_POINTS = Number.parseInt(process.env.MONTHLY_PRIZE_POINTS || '', 10) || 5000;

// Sum every user's points inside [startSql, endSql). Returns rows ordered by the
// monthly total, so row 0 is the current leader of the event.
//
// Only 'poll' rows count. Prize rows are excluded on purpose — a 5000-point prize paid at the
// start of a month would otherwise dominate that month's own standings and re-elect its recipient.
const getMonthlyLeaderRows = async ({ startSql, endSql }, limit = null) => {
    const params = [startSql, endSql];
    let sql = `
        SELECT u.id,
               u.username,
               u.name,
               u.avatar,
               u.points AS total_points,
               u.level,
               COALESCE(SUM(ph.points), 0) AS monthly_points,
               COUNT(ph.id) AS monthly_wins,
               MAX(ph.calculation_date) AS last_award_at
        FROM points_history ph
        JOIN users u ON u.id = ph.user_id
        WHERE ph.calculation_date >= ? AND ph.calculation_date < ?
          AND COALESCE(ph.kind, 'poll') <> 'prize'
        GROUP BY u.id
        HAVING monthly_points > 0
        ORDER BY monthly_points DESC, monthly_wins DESC, u.points DESC, u.id ASC
    `;

    if (limit) {
        sql += ' LIMIT ?';
        params.push(limit);
    }

    return dbAllAsync(sql, params);
};

// Pay out the prize for every month that has finished and has not been settled yet.
//
// Idempotency comes from the monthly_prizes primary key: the INSERT is attempted first, and points
// are credited only if that INSERT actually created the row. Two concurrent callers therefore
// cannot both award the same month, and a restart mid-way cannot double-pay.
const settleFinishedMonths = async (now = new Date()) => {
    const settled = [];

    // Look back a year: enough to catch a deployment that was down for a while, bounded so this
    // can never turn into an unbounded scan.
    for (let monthsAgo = 12; monthsAgo >= 1; monthsAgo -= 1) {
        const month = getMonthWindow(now, -monthsAgo);

        const already = await dbGetAsync('SELECT month FROM monthly_prizes WHERE month = ?', [month.key]);
        if (already) continue;

        // Nothing happened that month at all — record it as settled with no winner so the month is
        // never rescanned, and so a late-arriving points row cannot retroactively win a past month.
        const rows = await getMonthlyLeaderRows(month, 1);
        const winner = rows[0] || null;

        const claim = await dbRunAsync(
            `INSERT OR IGNORE INTO monthly_prizes (month, user_id, points, monthly_points)
             VALUES (?, ?, ?, ?)`,
            [
                month.key,
                winner ? winner.id : null,
                winner ? MONTHLY_PRIZE_POINTS : 0,
                winner ? Number(winner.monthly_points) || 0 : 0,
            ]
        );

        // changes === 0 means another caller claimed this month first; leave it to them.
        if (!claim || claim.changes === 0 || !winner) continue;

        await dbRunAsync('BEGIN IMMEDIATE TRANSACTION');
        try {
            await dbRunAsync(
                'UPDATE users SET points = points + ? WHERE id = ?',
                [MONTHLY_PRIZE_POINTS, winner.id]
            );

            const updated = await dbGetAsync('SELECT points FROM users WHERE id = ?', [winner.id]);
            await dbRunAsync(
                'UPDATE users SET level = ? WHERE id = ?',
                [calculateLevel(updated?.points || 0), winner.id]
            );

            await dbRunAsync(
                `INSERT INTO points_history (user_id, points, calculation_date, comment, kind)
                 VALUES (?, ?, CURRENT_TIMESTAMP, ?, 'prize')`,
                [winner.id, MONTHLY_PRIZE_POINTS, `Приз призёра месяца ${month.key}`]
            );

            // Tell the winner. Settlement runs when the month turns over, which is almost never
            // while they happen to be on the page, so this waits for them. INSERT OR IGNORE plus the
            // unique (user, type, meta) index means a re-run can't produce a duplicate.
            await dbRunAsync(
                `INSERT OR IGNORE INTO notifications (user_id, type, title, body, points, meta)
                 VALUES (?, 'monthly_prize', ?, ?, ?, ?)`,
                [
                    winner.id,
                    'Вы призёр месяца!',
                    // "в ивенте июня", not "за июня" — the genitive month name needs the noun in
                    // front of it, otherwise the preposition demands a different case.
                    `Вы заняли 1-е место в ивенте ${MONTH_NAMES_GENITIVE_RU[month.start.getUTCMonth()]} и получили приз.`,
                    MONTHLY_PRIZE_POINTS,
                    JSON.stringify({ month: month.key, monthlyPoints: Number(winner.monthly_points) || 0 }),
                ]
            );

            await dbRunAsync('COMMIT');
            settled.push({ month: month.key, userId: winner.id, points: MONTHLY_PRIZE_POINTS });
            console.log(`[Monthly prize] ${month.key}: awarded ${MONTHLY_PRIZE_POINTS} to user ${winner.id}`);
        } catch (error) {
            await dbRunAsync('ROLLBACK').catch(() => {});
            // Drop the claim so the month is retried instead of being marked paid without payment.
            await dbRunAsync('DELETE FROM monthly_prizes WHERE month = ?', [month.key]).catch(() => {});
            throw error;
        }
    }

    return settled;
};

// Settling is triggered by traffic (no scheduler in this deployment), so keep it cheap: at most one
// pass per hour, and never let a failure here break the request that happened to trigger it.
let lastSettlementAttempt = 0;
const settleFinishedMonthsThrottled = async () => {
    const now = Date.now();
    if (now - lastSettlementAttempt < 3_600_000) return;
    lastSettlementAttempt = now;

    try {
        await settleFinishedMonths();
    } catch (error) {
        console.error('[Monthly prize] Settlement failed:', error.message);
    }
};

const toMonthlyLeader = (row, index) => ({
    id: row.id,
    username: row.username,
    name: row.name,
    displayName: row.name || row.username,
    avatar: row.avatar,
    rank: index + 1,
    // `points` stays the monthly score so the leaderboard can render one shape for
    // both tabs; the all-time total travels alongside it.
    points: Number(row.monthly_points) || 0,
    monthlyPoints: Number(row.monthly_points) || 0,
    totalPoints: Number(row.total_points) || 0,
    monthlyWins: Number(row.monthly_wins) || 0,
    level: Number(row.level) || 1,
    lastAwardAt: row.last_award_at || null,
});

// Build the ordered, gap-free list of buckets for a period. Every bucket carries
// the strftime key it will be matched against, a display label, and an ISO start.
const buildStatBuckets = (granularity, count, now) => {
    const buckets = [];

    if (granularity === 'hour') {
        const anchor = new Date(Date.UTC(
            now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()
        ));
        for (let i = count - 1; i >= 0; i--) {
            const d = new Date(anchor.getTime() - i * 3600_000);
            const key = `${d.getUTCFullYear()}-${STAT_PAD(d.getUTCMonth() + 1)}-${STAT_PAD(d.getUTCDate())} ${STAT_PAD(d.getUTCHours())}`;
            buckets.push({ key, iso: d.toISOString(), label: `${STAT_PAD(d.getUTCHours())}:00` });
        }
    } else if (granularity === 'day') {
        const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        for (let i = count - 1; i >= 0; i--) {
            const d = new Date(anchor.getTime() - i * 86_400_000);
            const key = toDateStr(d);
            buckets.push({ key, iso: d.toISOString(), label: `${STAT_PAD(d.getUTCDate())}.${STAT_PAD(d.getUTCMonth() + 1)}` });
        }
    } else { // month
        for (let i = count - 1; i >= 0; i--) {
            const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
            const key = `${d.getUTCFullYear()}-${STAT_PAD(d.getUTCMonth() + 1)}`;
            buckets.push({ key, iso: d.toISOString(), label: RU_MONTHS_SHORT[d.getUTCMonth()] });
        }
    }

    return buckets;
};

app.get('/api/admin/statistics', authenticateToken, requireAdmin, async (req, res) => {
    let period;

    try {
        period = validateStatisticsPeriod(req.query.period);
    } catch (error) {
        return sendValidationError(res, error);
    }

    const { granularity, buckets: bucketCount } = STATISTICS_PERIODS.get(period);

    try {
        const getCount = (query, params = []) => new Promise((resolve, reject) => {
            db.get(query, params, (err, row) => {
                if (err) reject(err);
                else resolve(row && row.count != null ? Number(row.count) : 0);
            });
        });

        const getRow = (query, params = []) => new Promise((resolve, reject) => {
            db.get(query, params, (err, row) => (err ? reject(err) : resolve(row || {})));
        });

        const getAll = (query, params = []) => new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
        });

        const now = new Date();
        const buckets = buildStatBuckets(granularity, bucketCount, now);

        // Window bounds (UTC). The window starts at the first bucket's start.
        const windowStart = new Date(buckets[0].iso);
        const windowMs = now.getTime() - windowStart.getTime();
        const prevStart = new Date(windowStart.getTime() - windowMs);

        const startStr = toSqlUtc(windowStart);
        const nowStr = toSqlUtc(now);
        const prevStartStr = toSqlUtc(prevStart);
        const startDateStr = toDateStr(windowStart);

        // strftime pattern per granularity.
        const gran = granularity === 'hour' ? '%Y-%m-%d %H' : (granularity === 'month' ? '%Y-%m' : '%Y-%m-%d');
        const hasVisitSeries = granularity !== 'hour'; // visits are only stored per day

        // ---- All-time totals ----
        const totals = {
            users: await getCount('SELECT COUNT(*) as count FROM users'),
            news: await getCount('SELECT COUNT(*) as count FROM news'),
            polls: await getCount('SELECT COUNT(*) as count FROM polls'),
            votes: await getCount('SELECT COUNT(*) as count FROM votes'),
            likes: await getCount('SELECT COUNT(*) as count FROM likes'),
            messages: await getCount('SELECT COUNT(*) as count FROM messages'),
            resolvedPolls: await getCount('SELECT COUNT(*) as count FROM polls WHERE is_resolved = 1'),
            activePolls: await getCount('SELECT COUNT(*) as count FROM polls WHERE is_resolved = 0'),
            uniqueVoters: await getCount('SELECT COUNT(DISTINCT user_id) as count FROM votes'),
            pendingReports: await getCount("SELECT COUNT(*) as count FROM error_reports WHERE status = 'pending'"),
        };

        // ---- Period metrics + previous window (for deltas) ----
        const rangeCount = (table, field, from, to) =>
            getCount(`SELECT COUNT(*) as count FROM ${table} WHERE ${field} >= ? AND ${field} < ?`, [from, to]);
        const rangeDistinct = (table, distinctField, field, from, to) =>
            getCount(`SELECT COUNT(DISTINCT ${distinctField}) as count FROM ${table} WHERE ${field} >= ? AND ${field} < ?`, [from, to]);

        // Visits/sessions are stored per UTC calendar day. KPI visit windows must be
        // whole days AND symmetric with the previous window, otherwise the 24h view
        // compares 2 calendar days against 1 (over-counting + a bogus +100% delta).
        const VISIT_DAYS = { '24h': 1, '7d': 7, '30d': 30, '12m': 365 };
        const visitDays = VISIT_DAYS[period];
        const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        const todayStr = toDateStr(now);
        const visitStartStr = toDateStr(new Date(todayUTC - (visitDays - 1) * 86_400_000));
        const prevVisitStartStr = toDateStr(new Date(todayUTC - (2 * visitDays - 1) * 86_400_000));

        const cur = {
            votes: await rangeCount('votes', 'created_at', startStr, nowStr),
            likes: await rangeCount('likes', 'created_at', startStr, nowStr),
            newUsers: await rangeCount('users', 'created_at', startStr, nowStr),
            activeUsers: await rangeDistinct('votes', 'user_id', 'created_at', startStr, nowStr),
            visits: await getCount('SELECT SUM(count) as count FROM visits WHERE date >= ? AND date <= ?', [visitStartStr, todayStr]),
            uniqueVisitors: await getCount('SELECT COUNT(DISTINCT visitor_id) as count FROM visitor_sessions WHERE date >= ? AND date <= ?', [visitStartStr, todayStr]),
        };
        const prev = {
            votes: await rangeCount('votes', 'created_at', prevStartStr, startStr),
            newUsers: await rangeCount('users', 'created_at', prevStartStr, startStr),
            activeUsers: await rangeDistinct('votes', 'user_id', 'created_at', prevStartStr, startStr),
            visits: await getCount('SELECT SUM(count) as count FROM visits WHERE date >= ? AND date < ?', [prevVisitStartStr, visitStartStr]),
        };

        const pctDelta = (curVal, prevVal) => {
            if (!prevVal) return curVal > 0 ? 100 : 0;
            return Math.round(((curVal - prevVal) / prevVal) * 100);
        };

        const engagementRate = cur.visits > 0
            ? Math.round(((cur.votes + cur.likes) / cur.visits) * 100)
            : 0;

        const periodMetrics = {
            visits: cur.visits,
            uniqueVisitors: cur.uniqueVisitors,
            newUsers: cur.newUsers,
            activeUsers: cur.activeUsers,
            votes: cur.votes,
            likes: cur.likes,
            engagementRate,
            deltas: {
                visits: pctDelta(cur.visits, prev.visits),
                newUsers: pctDelta(cur.newUsers, prev.newUsers),
                votes: pctDelta(cur.votes, prev.votes),
                activeUsers: pctDelta(cur.activeUsers, prev.activeUsers),
            },
        };

        // ---- Time series (bucketed + gap-filled) ----
        const bucketMap = async (query, params) => {
            const rows = await getAll(query, params);
            const map = new Map();
            for (const r of rows) map.set(String(r.k), Number(r.c) || 0);
            return map;
        };

        const votesByBucket = await bucketMap(
            `SELECT strftime('${gran}', created_at) as k, COUNT(*) as c FROM votes WHERE created_at >= ? GROUP BY k`, [startStr]);
        const usersByBucket = await bucketMap(
            `SELECT strftime('${gran}', created_at) as k, COUNT(*) as c FROM users WHERE created_at >= ? GROUP BY k`, [startStr]);
        const likesByBucket = await bucketMap(
            `SELECT strftime('${gran}', created_at) as k, COUNT(*) as c FROM likes WHERE created_at >= ? GROUP BY k`, [startStr]);
        const pollsByBucket = await bucketMap(
            `SELECT strftime('${gran}', n.created_at) as k, COUNT(*) as c FROM polls p JOIN news n ON p.news_id = n.id WHERE n.created_at >= ? GROUP BY k`, [startStr]);

        let visitsByBucket = new Map();
        let uniqueVisitorsByBucket = new Map();
        if (hasVisitSeries) {
            visitsByBucket = await bucketMap(
                `SELECT strftime('${gran}', date) as k, SUM(count) as c FROM visits WHERE date >= ? GROUP BY k`, [startDateStr]);
            uniqueVisitorsByBucket = await bucketMap(
                `SELECT strftime('${gran}', date) as k, COUNT(DISTINCT visitor_id) as c FROM visitor_sessions WHERE date >= ? GROUP BY k`, [startDateStr]);
        }

        const series = buckets.map((b) => {
            const votes = votesByBucket.get(b.key) || 0;
            const likes = likesByBucket.get(b.key) || 0;
            const visits = visitsByBucket.get(b.key) || 0;
            return {
                label: b.label,
                iso: b.iso,
                votes,
                newUsers: usersByBucket.get(b.key) || 0,
                likes,
                polls: pollsByBucket.get(b.key) || 0,
                visits,
                uniqueVisitors: uniqueVisitorsByBucket.get(b.key) || 0,
                engagement: hasVisitSeries && visits > 0 ? Math.round(((votes + likes) / visits) * 100) : 0,
            };
        });

        // ---- Activity by hour of day (all-time distribution; the dataset is largely
        // imported/historical, so a recent window would usually be empty) ----
        const activityRows = await getAll(
            `SELECT strftime('%H', created_at) as h, COUNT(*) as c FROM votes GROUP BY h`);
        const activityMap = new Map(activityRows.map((r) => [String(r.h), Number(r.c) || 0]));
        const activityByHour = Array.from({ length: 24 }, (_, h) => ({
            hour: h,
            label: `${STAT_PAD(h)}:00`,
            votes: activityMap.get(STAT_PAD(h)) || 0,
        }));

        // ---- Prediction accuracy across resolved polls ----
        const predRow = await getRow(`
            SELECT
                SUM(CASE WHEN p.is_resolved = 1 AND p.correct_option_id IS NOT NULL AND v.option_id = p.correct_option_id THEN 1 ELSE 0 END) as correct,
                SUM(CASE WHEN p.is_resolved = 1 AND p.correct_option_id IS NOT NULL AND v.option_id <> p.correct_option_id THEN 1 ELSE 0 END) as incorrect,
                SUM(CASE WHEN p.is_resolved = 0 OR p.correct_option_id IS NULL THEN 1 ELSE 0 END) as pending
            FROM votes v JOIN polls p ON v.poll_id = p.id
        `);
        const correct = Number(predRow.correct) || 0;
        const incorrect = Number(predRow.incorrect) || 0;
        const pending = Number(predRow.pending) || 0;
        const prediction = {
            correct,
            incorrect,
            pending,
            accuracy: (correct + incorrect) > 0 ? Math.round((correct / (correct + incorrect)) * 100) : 0,
        };

        // ---- Category breakdown ----
        const categories = (await getAll(`
            SELECT COALESCE(NULLIF(n.category, ''), 'general') as category,
                   COUNT(DISTINCT p.id) as polls,
                   COUNT(v.id) as votes
            FROM news n
            LEFT JOIN polls p ON p.news_id = n.id
            LEFT JOIN votes v ON v.poll_id = p.id
            GROUP BY category
            HAVING polls > 0
            ORDER BY votes DESC, polls DESC
            LIMIT 8
        `)).map((r) => ({ category: r.category, label: formatCategoryLabel(r.category), polls: Number(r.polls) || 0, votes: Number(r.votes) || 0 }));

        // ---- Top polls ----
        const topPolls = (await getAll(`
            SELECT p.id, p.question, COUNT(v.id) as votes, p.is_resolved,
                   COALESCE(NULLIF(n.category, ''), 'general') as category
            FROM polls p
            LEFT JOIN votes v ON p.id = v.poll_id
            LEFT JOIN news n ON p.news_id = n.id
            GROUP BY p.id
            ORDER BY votes DESC
            LIMIT 5
        `)).map((p) => ({
            id: p.id,
            question: p.question,
            votes: Number(p.votes) || 0,
            active: !p.is_resolved,
            category: formatCategoryLabel(p.category),
        }));

        // ---- Top users ----
        const topUsers = (await getAll(`
            SELECT id, COALESCE(NULLIF(name, ''), username) as name, username, points, avatar
            FROM users
            ORDER BY points DESC, id ASC
            LIMIT 5
        `)).map((u) => ({
            id: u.id,
            name: u.name,
            username: u.username,
            points: Number(u.points) || 0,
            avatar: u.avatar,
        }));

        // ---- Role distribution ----
        const roleRows = await getAll('SELECT role, COUNT(*) as count FROM users GROUP BY role');
        const roles = { admin: 0, creator: 0, user: 0 };
        for (const r of roleRows) {
            const key = r.role || 'user';
            roles[key] = (roles[key] || 0) + (Number(r.count) || 0);
        }

        res.json({
            period,
            granularity,
            hasVisitSeries,
            generatedAt: now.toISOString(),
            totals,
            periodMetrics,
            series,
            activityByHour,
            prediction,
            categories,
            topPolls,
            topUsers,
            roles,
        });

    } catch (err) {
        console.error('Statistics error:', err);
        sendServerError(res, err);
    }
});

// Create error report
app.post('/api/reports', authenticateToken, (req, res) => {
    let newsId;
    let message;

    try {
        ({ newsId, message } = validateReportPayload(req.body));
    } catch (error) {
        return sendValidationError(res, error);
    }

    const userId = req.user.id;

    db.run(
        "INSERT INTO error_reports (news_id, user_id, message) VALUES (?, ?, ?)",
        [newsId, userId, message],
        function (err) {
            if (err) return sendServerError(res, err);
            res.json({ message: "Report submitted successfully", id: this.lastID });
        }
    );
});

// Get all error reports (Admin only)
app.get('/api/admin/reports', authenticateToken, requireAdmin, (req, res) => {
    const { status } = req.query;

    let query = `
        SELECT 
            er.id,
            er.message,
            er.status,
            er.created_at,
            er.news_id,
            n.title as news_title,
            u.username as reporter_username,
            u.name as reporter_name
        FROM error_reports er
        LEFT JOIN news n ON er.news_id = n.id
        LEFT JOIN users u ON er.user_id = u.id
    `;

    const params = [];
    if (status && status !== 'all') {
        query += " WHERE er.status = ?";
        params.push(status);
    }

    query += " ORDER BY er.created_at DESC";

    db.all(query, params, (err, rows) => {
        if (err) return sendServerError(res, err);

        // Format the rows
        const reports = rows.map(row => ({
            ...row,
            reporter_display_name: row.reporter_name || row.reporter_username
        }));

        res.json(reports);
    });
});

// Update error report status (Admin only)
app.patch('/api/admin/reports/:id/status', authenticateToken, requireAdmin, (req, res) => {
    const { status } = req.body;
    let reportId;

    try {
        reportId = parsePositiveInt(req.params.id, 'id');
    } catch (error) {
        return sendValidationError(res, error);
    }

    if (!['pending', 'resolved'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
    }

    db.run(
        "UPDATE error_reports SET status = ? WHERE id = ?",
        [status, reportId],
        function (err) {
            if (err) return sendServerError(res, err);
            res.json({ message: "Report status updated" });
        }
    );
});

// All-time leaderboard. Each row also carries the points the user collected during the
// current monthly event, so a single fetch can drive both leaderboard tabs.
app.get('/api/leaders', async (req, res) => {
    let limit;

    try {
        limit = parseBoundedInt(req.query.limit, 'limit', { min: 1, max: 500, defaultValue: 100 });
    } catch (error) {
        return sendValidationError(res, error);
    }

    try {
        const month = getMonthWindow();

        const rows = await dbAllAsync(
            `SELECT u.id,
                    u.username,
                    u.name,
                    u.points,
                    u.avatar,
                    u.level,
                    (SELECT COALESCE(SUM(ph.points), 0)
                       FROM points_history ph
                      WHERE ph.user_id = u.id
                        AND ph.calculation_date >= ?
                        AND ph.calculation_date < ?
                        AND COALESCE(ph.kind, 'poll') <> 'prize') AS monthly_points
               FROM users u
              ORDER BY u.points DESC, u.id ASC
              LIMIT ?`,
            [month.startSql, month.endSql, limit]
        );

        res.json(rows.map((row, index) => ({
            ...row,
            points: Number(row.points) || 0,
            monthlyPoints: Number(row.monthly_points) || 0,
            rank: index + 1,
            displayName: row.name || row.username,
        })));
    } catch (error) {
        console.error('Failed to load leaders:', error);
        sendServerError(res, error);
    }
});

// What the signed-in user has not been told yet. Called on page load, so it settles any finished
// month first — otherwise a winner returning right after the month turned over would be told
// nothing until some other request happened to trigger the payout.
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        await settleFinishedMonthsThrottled();

        const rows = await dbAllAsync(
            `SELECT id, type, title, body, points, meta, created_at
               FROM notifications
              WHERE user_id = ? AND read_at IS NULL
              ORDER BY created_at DESC, id DESC
              LIMIT 20`,
            [req.user.id]
        );

        res.json(rows.map((row) => {
            let meta = null;
            try {
                meta = row.meta ? JSON.parse(row.meta) : null;
            } catch {
                meta = null; // A malformed meta blob must not break the whole list.
            }

            return {
                id: row.id,
                type: row.type,
                title: row.title,
                body: row.body,
                points: Number(row.points) || 0,
                createdAt: row.created_at,
                meta,
            };
        }));
    } catch (error) {
        sendServerError(res, error, 'Failed to load notifications');
    }
});

// Dismiss one notification. Scoped to the caller's own rows, so an id from someone else's account
// simply matches nothing.
app.post('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    let notificationId;

    try {
        notificationId = parsePositiveInt(req.params.id, 'id');
    } catch (error) {
        return sendValidationError(res, error);
    }

    try {
        await dbRunAsync(
            'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND read_at IS NULL',
            [notificationId, req.user.id]
        );
        res.json({ message: 'Notification marked as read' });
    } catch (error) {
        sendServerError(res, error, 'Failed to mark notification as read');
    }
});

// Monthly event leaderboard — a standalone table scored only on points earned this
// calendar month, plus the timing the UI needs to count down to the next winner.
app.get('/api/leaders/monthly', async (req, res) => {
    let limit;
    let monthOffset;

    try {
        limit = parseBoundedInt(req.query.limit, 'limit', { min: 1, max: 500, defaultValue: 100 });
        // 0 = the running month, 1 = last month (used to show who actually won it).
        monthOffset = parseBoundedInt(req.query.monthsAgo, 'monthsAgo', { min: 1, max: 24, defaultValue: 1 }) - 1;
    } catch (error) {
        return sendValidationError(res, error);
    }

    try {
        // Pay out any month that closed while nothing was polling for it.
        await settleFinishedMonthsThrottled();

        const now = new Date();
        const month = getMonthWindow(now, -monthOffset);
        const rows = await getMonthlyLeaderRows(month, limit);
        const leaders = rows.map(toMonthlyLeader);
        const isCurrentMonth = monthOffset === 0;
        const settlement = await dbGetAsync(
            'SELECT user_id, points, awarded_at FROM monthly_prizes WHERE month = ?',
            [month.key]
        );

        res.json({
            month: month.key,
            // The prize is a flat amount, not the winner's score. The UI shows this; the scores
            // below only establish the ranking.
            prizePoints: MONTHLY_PRIZE_POINTS,
            // Set once the month has closed and the prize has actually been credited.
            awardedAt: settlement?.awarded_at || null,
            awardedUserId: settlement?.user_id ?? null,
            monthIndex: month.start.getUTCMonth(),
            year: month.start.getUTCFullYear(),
            isCurrentMonth,
            periodStart: month.start.toISOString(),
            // The instant the current winner is locked in and a fresh event begins.
            periodEnd: month.end.toISOString(),
            serverTime: now.toISOString(),
            // Server-side remainder, so a wrong clock on the client can't skew the countdown.
            msRemaining: isCurrentMonth ? Math.max(0, month.end.getTime() - now.getTime()) : 0,
            participants: leaders.length,
            winner: leaders[0] || null,
            leaders,
        });
    } catch (error) {
        console.error('Failed to load monthly leaders:', error);
        sendServerError(res, error);
    }
});

// --- Chat Routes ---

// Get all chats for current user
app.get('/api/chats', authenticateToken, (req, res) => {
    const userId = req.user.id;

    const query = `
        SELECT c.id, c.type, c.name, c.updated_at,
               (SELECT content FROM messages m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
               (SELECT created_at FROM messages m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_time,
               (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id AND m.is_read = 0 AND m.sender_id != ?) as unread_count
        FROM chats c
        JOIN chat_participants cp ON c.id = cp.chat_id
        WHERE cp.user_id = ?
        ORDER BY c.updated_at DESC
    `;

    db.all(query, [userId, userId], async (err, chats) => {
        if (err) return sendServerError(res, err);

        const formattedChats = await Promise.all(chats.map(async (chat) => {
            // For direct chats, get the other user's info
            if (chat.type === 'direct') {
                const otherUser = await new Promise((resolve) => {
                    db.get(
                        `SELECT u.id, u.name, u.username, u.avatar, u.bio, u.birthdate, u.last_seen,
                        (SELECT 1 FROM blocked_users WHERE blocker_id = ? AND blocked_id = u.id) as is_blocked
                         FROM users u 
                         JOIN chat_participants cp ON u.id = cp.user_id 
                         WHERE cp.chat_id = ? AND u.id != ?`,
                        [userId, chat.id, userId],
                        (err, row) => resolve(row)
                    );
                });

                if (otherUser) {
                    // Determine online status (seen within last 5 minutes)
                    let isOnline = false;
                    if (otherUser.last_seen) {
                        const lastSeen = new Date(otherUser.last_seen + 'Z'); // Append Z to treat as UTC if stored as such, or just parse
                        // SQLite CURRENT_TIMESTAMP is UTC. Javascript Date() is local or UTC depending on parsing.
                        // It's safest to compare timestamps.

                        // Actually, SQLite CURRENT_TIMESTAMP is UTC string "YYYY-MM-DD HH:MM:SS".
                        // We should treat it as UTC.
                        const lastSeenTime = new Date(otherUser.last_seen + "Z").getTime();
                        const now = new Date().getTime();
                        const diff = now - lastSeenTime;

                        // 1 minute = 60000 ms
                        if (diff < 60000) {
                            isOnline = true;
                        }
                    }

                    return {
                        ...chat,
                        name: otherUser.name || otherUser.username,
                        avatar: otherUser.avatar,
                        otherUserId: otherUser.id,
                        bio: otherUser.bio,
                        birthdate: otherUser.birthdate,
                        online: isOnline,
                        is_blocked: !!otherUser.is_blocked
                    };
                }
            }
            return chat;
        }));

        res.json(formattedChats);
    });
});

// Create or Get Direct Chat
app.post('/api/chats', authenticateToken, (req, res) => {
    let targetUserId;

    try {
        ({ targetUserId } = validateDirectChatPayload(req.body));
    } catch (error) {
        return sendValidationError(res, error);
    }

    const currentUserId = req.user.id;

    if (targetUserId === currentUserId) {
        return res.status(400).json({ message: "Cannot create chat with yourself" });
    }

    // Check if chat already exists
    db.all(
        `SELECT c.id 
         FROM chats c
         JOIN chat_participants cp1 ON c.id = cp1.chat_id
         JOIN chat_participants cp2 ON c.id = cp2.chat_id
         WHERE c.type = 'direct' AND cp1.user_id = ? AND cp2.user_id = ?`,
        [currentUserId, targetUserId],
        (err, rows) => {
            if (err) return sendServerError(res, err);

            if (rows.length > 0) {
                return res.json({ id: rows[0].id, isNew: false });
            }

            // Create new chat
            db.serialize(() => {
                db.run("INSERT INTO chats (type) VALUES ('direct')", function (err) {
                    if (err) return sendServerError(res, err);
                    const chatId = this.lastID;

                    const stmt = db.prepare("INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)");
                    stmt.run(chatId, currentUserId);
                    stmt.run(chatId, targetUserId);
                    stmt.finalize();

                    res.json({ id: chatId, isNew: true });
                });
            });
        }
    );
});

// Get Messages
app.get('/api/chats/:id/messages', authenticateToken, (req, res) => {
    let chatId;

    try {
        chatId = parsePositiveInt(req.params.id, 'id');
    } catch (error) {
        return sendValidationError(res, error);
    }

    const userId = req.user.id;
    const afterId = parseInt(req.query.afterId) || 0;

    // Verify participation
    db.get("SELECT * FROM chat_participants WHERE chat_id = ? AND user_id = ?", [chatId, userId], (err, row) => {
        if (!row) return res.status(403).json({ message: "Not authorized" });

        let query = `SELECT m.*, u.name, u.username, u.avatar
             FROM messages m
             LEFT JOIN users u ON m.sender_id = u.id
             WHERE m.chat_id = ?`;
        const params = [chatId];

        if (afterId > 0) {
            query += ` AND m.id > ?`;
            params.push(afterId);
        }

        query += ` ORDER BY m.created_at ASC`;

        // Safety limit for initial load (if afterId is 0, maybe limit to 100? But for now let's keep full history to not break UI expectations unless it's huge)
        // If we limit, we need frontend pagination. For now, incremental update is the big win.

        db.all(query, params, async (err, messages) => {
            if (err) return sendServerError(res, err);

            // Fetch attachments for each message
            const messagesWithAttachments = await Promise.all(messages.map(async (msg) => {
                const attachments = await new Promise((resolve) => {
                    db.all("SELECT * FROM message_attachments WHERE message_id = ?", [msg.id], (err, rows) => {
                        resolve(rows || []);
                    });
                });
                return { ...msg, attachments };
            }));

            res.json(messagesWithAttachments);
        }
        );
    });
});

// Send Message (with optional files)
app.post('/api/chats/:id/messages', authenticateToken, upload.array('files', MAX_CHAT_ATTACHMENTS), (req, res) => {
    let chatId;

    try {
        chatId = parsePositiveInt(req.params.id, 'id');
    } catch (error) {
        return sendValidationError(res, error);
    }

    const userId = req.user.id;
    const files = req.files || [];
    let content;

    try {
        ({ content } = validateChatMessagePayload(req.body, files));
    } catch (error) {
        return sendValidationError(res, error);
    }

    // Verify participation
    db.get("SELECT * FROM chat_participants WHERE chat_id = ? AND user_id = ?", [chatId, userId], (err, row) => {
        if (!row) return res.status(403).json({ message: "Not authorized" });

        // Check if blocked by the other user (for direct chats)
        db.get(`SELECT user_id FROM chat_participants WHERE chat_id = ? AND user_id != ?`, [chatId, userId], (err, otherRow) => {
            if (otherRow) {
                const otherUserId = otherRow.user_id;
                db.get("SELECT 1 FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?", [otherUserId, userId], (err, blocked) => {
                    if (err) return sendServerError(res, err);
                    if (blocked) return res.status(403).json({ message: "You have been blocked by this user" });

                    sendMessage();
                });
            } else {
                // Group chat or self? proceed
                sendMessage();
            }
        });

        function sendMessage() {
            db.serialize(() => {
                db.run(
                    "INSERT INTO messages (chat_id, sender_id, content) VALUES (?, ?, ?)",
                    [chatId, userId, content || ''],
                    function (err) {
                        if (err) return sendServerError(res, err);
                        const messageId = this.lastID;

                        // Insert attachments
                        if (files.length > 0) {
                            const stmt = db.prepare("INSERT INTO message_attachments (message_id, url, type, name) VALUES (?, ?, ?, ?)");
                            files.forEach(file => {
                                const type = file.mimetype.startsWith('image/') ? 'image' :
                                    file.mimetype.startsWith('video/') ? 'video' : 'file';
                                const url = buildUploadUrl(req, file.filename);
                                stmt.run(messageId, url, type, file.originalname);
                            });
                            stmt.finalize();
                        }

                        // Update chat updated_at
                        db.run("UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [chatId]);

                        // Return the new message with attachments
                        db.get("SELECT * FROM messages WHERE id = ?", [messageId], async (err, msg) => {
                            const attachments = await new Promise((resolve) => {
                                db.all("SELECT * FROM message_attachments WHERE message_id = ?", [messageId], (err, rows) => {
                                    resolve(rows || []);
                                });
                            });
                            res.json({ ...msg, attachments });
                        });
                    }
                );
            });
        }
    });
});

// Mark messages as read
app.post('/api/chats/:id/read', authenticateToken, (req, res) => {
    let chatId;

    try {
        chatId = parsePositiveInt(req.params.id, 'id');
    } catch (error) {
        return sendValidationError(res, error);
    }

    const userId = req.user.id;

    // Mark all messages in this chat NOT sent by me as read
    db.run(
        "UPDATE messages SET is_read = 1 WHERE chat_id = ? AND sender_id != ? AND is_read = 0",
        [chatId, userId],
        function (err) {
            if (err) return sendServerError(res, err);
            res.json({ message: "Messages marked as read", changes: this.changes });
        }
    );
});

// Delete Message
app.delete('/api/chats/:chatId/messages/:messageId', authenticateToken, (req, res) => {
    let chatId;
    let messageId;

    try {
        chatId = parsePositiveInt(req.params.chatId, 'chatId');
        messageId = parsePositiveInt(req.params.messageId, 'messageId');
    } catch (error) {
        return sendValidationError(res, error);
    }

    const userId = req.user.id;

    // Check if message belongs to user
    db.get("SELECT sender_id FROM messages WHERE id = ? AND chat_id = ?", [messageId, chatId], (err, msg) => {
        if (err) return sendServerError(res, err);
        if (!msg) return res.status(404).json({ message: "Message not found" });

        if (msg.sender_id !== userId) {
            return res.status(403).json({ message: "You can only delete your own messages" });
        }

        // Delete attachments first (optional cleanup)
        db.run("DELETE FROM message_attachments WHERE message_id = ?", [messageId]);

        // Delete message
        db.run("DELETE FROM messages WHERE id = ?", [messageId], function (err) {
            if (err) return sendServerError(res, err);
            res.json({ message: "Message deleted" });
        });
    });
});

// Block User
app.post('/api/users/block', authenticateToken, (req, res) => {
    let userId;

    try {
        userId = parsePositiveInt(req.body.userId, 'userId');
    } catch (error) {
        return sendValidationError(res, error);
    }

    const blockerId = req.user.id;

    if (userId === blockerId) {
        return res.status(400).json({ message: "You cannot block yourself" });
    }

    db.run(
        "INSERT OR IGNORE INTO blocked_users (blocker_id, blocked_id) VALUES (?, ?)",
        [blockerId, userId],
        function (err) {
            if (err) return sendServerError(res, err);
            res.json({ message: "User blocked" });
        }
    );
});

// Unblock User
app.delete('/api/users/block/:id', authenticateToken, (req, res) => {
    let blockedId;

    try {
        blockedId = parsePositiveInt(req.params.id, 'id');
    } catch (error) {
        return sendValidationError(res, error);
    }

    const blockerId = req.user.id;

    db.run(
        "DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?",
        [blockerId, blockedId],
        function (err) {
            if (err) return sendServerError(res, err);
            res.json({ message: "User unblocked" });
        });
});



// Search Users (for new chat)
app.get('/api/users/search', authenticateToken, (req, res) => {
    const rawQuery = sanitizeTextInput(req.query.query);
    if (!rawQuery || rawQuery.length < 2) return res.json([]);
    if (rawQuery.length > 80) {
        return sendValidationError(res, createValidationError('query', 'Query must be 80 characters or less'));
    }

    const normalize = (value) => String(value || '')
        .toLocaleLowerCase('ru-RU')
        .replace(/ё/g, 'е')
        .trim();

    const needle = normalize(rawQuery);
    if (!needle) return res.json([]);
    const likeNeedle = `%${escapeSqlLike(needle)}%`;

    db.all(
        `SELECT id, username, name, avatar
         FROM users
         WHERE id != ?
           AND (
                REPLACE(LOWER(username), 'ё', 'е') LIKE ? ESCAPE '\\'
                OR REPLACE(LOWER(COALESCE(name, '')), 'ё', 'е') LIKE ? ESCAPE '\\'
           )
         LIMIT 100`,
        [req.user.id, likeNeedle, likeNeedle],
        (err, users) => {
            if (err) return sendServerError(res, err);

            const ranked = (users || [])
                .map((u) => {
                    const usernameNorm = normalize(u.username);
                    const nameNorm = normalize(u.name);
                    const inUsername = usernameNorm.includes(needle);
                    const inName = nameNorm.includes(needle);
                    const startsUsername = usernameNorm.startsWith(needle);
                    const startsName = nameNorm.startsWith(needle);

                    const matched = inUsername || inName;
                    const score =
                        (startsName ? 8 : 0) +
                        (startsUsername ? 6 : 0) +
                        (inName ? 4 : 0) +
                        (inUsername ? 2 : 0);

                    return { ...u, matched, score };
                })
                .filter((u) => u.matched)
                .sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    return String(a.name || a.username).localeCompare(String(b.name || b.username), 'ru-RU');
                })
                .slice(0, 30)
                .map(({ matched, score, ...user }) => user);

            res.json(ranked);
        }
    );
});

// Public profile card. Carries the same headline stats the leaderboard ranks on — predictions,
// accuracy, standings — but none of the moderation-only data (last_seen, reports, messages,
// the points ledger); that stays behind /api/admin/users/:id.
app.get('/api/users/:id/profile', authenticateToken, async (req, res) => {
    let userId;

    try {
        userId = parsePositiveInt(req.params.id, 'id');
    } catch (error) {
        return sendValidationError(res, error);
    }

    try {
        const user = await dbGetAsync(
            `SELECT id, username, name, avatar, bio, birthdate, points, level, role, created_at
               FROM users
              WHERE id = ?`,
            [userId]
        );

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const month = getMonthWindow();
        const scalar = async (sql, params = []) => {
            const row = await dbGetAsync(sql, params);
            return Number(row?.value) || 0;
        };

        const [votesTotal, votesResolved, votesCorrect, monthlyPoints, allTimeRank] = await Promise.all([
            scalar('SELECT COUNT(*) AS value FROM votes WHERE user_id = ?', [userId]),
            scalar(
                `SELECT COUNT(*) AS value
                   FROM votes v JOIN polls p ON p.id = v.poll_id
                  WHERE v.user_id = ? AND p.is_resolved = 1`,
                [userId]
            ),
            scalar(
                `SELECT COUNT(*) AS value
                   FROM votes v JOIN polls p ON p.id = v.poll_id
                  WHERE v.user_id = ? AND p.is_resolved = 1 AND p.correct_option_id = v.option_id`,
                [userId]
            ),
            scalar(
                `SELECT COALESCE(SUM(points), 0) AS value
                   FROM points_history
                  WHERE user_id = ? AND calculation_date >= ? AND calculation_date < ?
                    AND COALESCE(kind, 'poll') <> 'prize'`,
                [userId, month.startSql, month.endSql]
            ),
            scalar(
                'SELECT COUNT(*) + 1 AS value FROM users WHERE points > (SELECT points FROM users WHERE id = ?)',
                [userId]
            ),
        ]);

        const monthlyRows = await getMonthlyLeaderRows(month);
        const monthlyRankIndex = monthlyRows.findIndex((row) => Number(row.id) === userId);

        res.json({
            ...user,
            displayName: user.name || user.username,
            stats: {
                votesTotal,
                votesResolved,
                votesCorrect,
                votesWrong: Math.max(0, votesResolved - votesCorrect),
                votesPending: Math.max(0, votesTotal - votesResolved),
                accuracy: votesResolved > 0 ? Math.round((votesCorrect / votesResolved) * 100) : null,
                monthlyPoints,
                allTimeRank,
                monthlyRank: monthlyRankIndex >= 0 ? monthlyRankIndex + 1 : null,
                month: month.key,
            },
        });
    } catch (error) {
        console.error('Failed to load profile:', error);
        sendServerError(res, error);
    }
});

app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: "File is too large. Maximum size is 5 MB." });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ message: `Too many files uploaded. Maximum is ${MAX_CHAT_ATTACHMENTS}.` });
        }
        return res.status(400).json({ message: err.message });
    }

    if (err?.details) {
        return sendValidationError(res, err);
    }

    // Errors raised by express itself carry the right status — body-parser's 413 for an oversized
    // payload, its 400 for malformed JSON. Reporting those as 500 tells the caller "server fault,
    // retry" when the request is what needs fixing, and retrying never helps.
    const clientStatus = Number(err?.status || err?.statusCode);
    if (Number.isInteger(clientStatus) && clientStatus >= 400 && clientStatus < 500) {
        if (clientStatus === 413) {
            return res.status(413).json({ message: 'Request body is too large.' });
        }
        if (err?.type === 'entity.parse.failed') {
            return res.status(400).json({ message: 'Malformed JSON body.' });
        }
        return res.status(clientStatus).json({ message: 'Request rejected.' });
    }

    console.error('Unhandled request error:', err);
    return res.status(500).json({ message: "Internal server error" });
});

// Serve static files from the frontend build directory
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, { dotfiles: 'deny' }));

// Serve index.html for any other requests (SPA support)
app.get('*', (req, res) => {
    // An unmatched /api/* path is a missing endpoint, not a page: answering it with the SPA shell
    // hands a client HTML where it expects JSON, which surfaces as an unexplained parse error.
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ message: 'Not found' });
    }

    // No per-request logging here: this handler runs for every page load, and the path is a
    // constant — the log line only bloats the deployment output.
    res.sendFile(path.join(publicDir, 'index.html'));
});

let isShuttingDown = false;

const shutdown = (signal, exitCode = 0) => {
    if (isShuttingDown) {
        return;
    }

    isShuttingDown = true;
    console.log(`[Shutdown] ${signal} received`);

    const closeDatabase = () => {
        db.close((dbError) => {
            if (dbError) {
                console.error('[Shutdown] Failed to close database:', dbError);
                process.exit(1);
                return;
            }
            process.exit(exitCode);
        });
    };

    if (server) {
        server.close((serverError) => {
            if (serverError) {
                console.error('[Shutdown] Failed to close server:', serverError);
                process.exit(1);
                return;
            }
            closeDatabase();
        });
        return;
    }

    closeDatabase();
};

// Ensure the admin configured via INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD can log
// in. Runs on startup: creates the account if missing, otherwise guarantees the admin
// role and sets the configured password ONLY when the current one doesn't already match
// (so it doesn't clobber a password changed later in-app on every redeploy). Remove
// INITIAL_ADMIN_PASSWORD once you've logged in if you don't want it reset on deploys.
const ensureConfiguredAdmin = async () => {
    const email = String(process.env.INITIAL_ADMIN_EMAIL || '').trim();
    const password = String(process.env.INITIAL_ADMIN_PASSWORD || '');
    if (!email) return;

    const existing = await dbGetAsync(
        `SELECT id, password, role FROM users
         WHERE LOWER(username) = LOWER(?) OR LOWER(name) = LOWER(?)
         ORDER BY CASE WHEN LOWER(username) = LOWER(?) THEN 0 ELSE 1 END
         LIMIT 1`,
        [email, email, email]
    );

    if (existing) {
        if (existing.role !== 'admin') {
            await dbRunAsync("UPDATE users SET role = 'admin' WHERE id = ?", [existing.id]);
        }
        if (password) {
            const alreadyMatches = await verifyPassword(password, existing.password);
            if (!alreadyMatches) {
                const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
                await dbRunAsync("UPDATE users SET password = ? WHERE id = ?", [hashed, existing.id]);
                console.log('[Admin Bootstrap] Password set for configured admin:', email);
            }
        }
        return;
    }

    if (!password) return;
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const settings = await getPointsSettings();
    const startPoints = settings.start_points;
    const level = calculateLevel(startPoints);
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`;
    await dbRunAsync(
        "INSERT INTO users (username, password, role, points, level, avatar, name) VALUES (?, ?, 'admin', ?, ?, ?, ?)",
        [email, hashed, startPoints, level, avatarUrl, email]
    );
    console.log('[Admin Bootstrap] Created configured admin:', email);
};

const startServer = async () => {
    await db.ready;

    if (WP_SYNC_ON_STARTUP) {
        try {
            const stats = await syncWordpressIfConfigured({ fullReplace: WP_SYNC_FULL_REPLACE });
            await enforceForcedAdminRoles();
            if (stats.skipped) {
                console.warn('[WP Sync] Startup sync skipped:', stats.reason);
            } else {
                console.log('[WP Sync] Startup sync completed:', stats);
            }
        } catch (error) {
            console.error('[WP Sync] Startup sync failed:', error.message);
        }
    }

    try {
        await enforceForcedAdminRoles();
    } catch (error) {
        console.error('[Admin Override] Failed to enforce forced admin roles:', error.message);
    }

    try {
        await ensureConfiguredAdmin();
    } catch (error) {
        console.error('[Admin Bootstrap] Failed to ensure configured admin:', error.message);
    }

    try {
        await ensureSearchIndex();
    } catch (error) {
        console.error('[Search] Failed to build search index:', error.message);
    }

    // Catch up on any month that finished while the service was down.
    try {
        lastSettlementAttempt = Date.now();
        const settled = await settleFinishedMonths();
        if (settled.length > 0) {
            console.log('[Monthly prize] Settled on startup:', settled);
        }
    } catch (error) {
        console.error('[Monthly prize] Startup settlement failed:', error.message);
    }

    server = app.listen(PORT, HOST, () => {
        console.log(`Server running on http://${HOST}:${PORT}`);
        console.log(`Access from network: http://[YOUR_IP]:${PORT}`);
    });

    return server;
};

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    shutdown('uncaughtException', 1);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (require.main === module) {
    startServer().catch((error) => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}

module.exports = { app, startServer, isOriginAllowed };
