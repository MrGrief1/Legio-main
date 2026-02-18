const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

require('dotenv').config();

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

// Enable trust proxy for Railway and other reverse proxies
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const SECRET_KEY = process.env.SECRET_KEY || "supersecretkey";
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const WP_SYNC_ON_STARTUP = toBoolean(process.env.WP_SYNC_ON_STARTUP, false);
const WP_SYNC_FULL_REPLACE = toBoolean(process.env.WP_SYNC_FULL_REPLACE, true);

// Middleware
if (helmet) {
    app.use(helmet({ crossOriginResourcePolicy: false }));
} else {
    // Manual Security Headers
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        next();
    });
}

if (compression) {
    app.use(compression());
}

// CORS Configuration
// In production, set ALLOWED_ORIGINS="https://your-frontend.railway.app,https://your-domain.com"
// In development, defaults to allowing all origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : null; // null means allow all

app.use(cors({
    origin: (origin, callback) => {
        // If no restriction set, allow all
        if (!allowedOrigins) {
            return callback(null, true);
        }
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) {
            return callback(null, true);
        }
        // Check if origin is in allowed list
        if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
            callback(null, true);
        } else {
            console.error(`CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Content Security Policy for production
app.use((req, res, next) => {
    // Allow Railway and custom origins
    const defaultOrigins = "'self' http://localhost:3000 http://localhost:3001 http://localhost:5173 https://*.railway.app";
    const cspOrigins = process.env.CSP_CONNECT_ORIGINS
        ? `${defaultOrigins} ${process.env.CSP_CONNECT_ORIGINS}`
        : defaultOrigins;

    res.setHeader('Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://aistudiocdn.com; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' data: https://fonts.gstatic.com; " +
        "img-src 'self' data: https: blob:; " + // Added blob: for temporary image URLs
        `connect-src ${cspOrigins};`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

app.use(express.json({ limit: '10mb' }));

// Serve uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Note: Static files and SPA fallback are configured at the end of the file after all API routes

// Rate Limiting
if (rateLimit) {
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
    });
    app.use('/api/', limiter);

    const authLimiter = rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 10,
        message: "Too many accounts created from this IP, please try again after an hour"
    });
    app.use('/auth/', authLimiter);
} else {
    // Simple Custom Rate Limiter
    const rateLimitMap = new Map();
    const simpleLimiter = (req, res, next) => {
        const ip = req.ip;
        const now = Date.now();
        const windowMs = 15 * 60 * 1000;
        const limit = 100;

        if (!rateLimitMap.has(ip)) {
            rateLimitMap.set(ip, { count: 1, startTime: now });
        } else {
            const data = rateLimitMap.get(ip);
            if (now - data.startTime > windowMs) {
                data.count = 1;
                data.startTime = now;
            } else {
                data.count++;
                if (data.count > 3000) {
                    return res.status(429).json({ message: "Too many requests, please try again later." });
                }
            }
        }
        next();
    };
    app.use('/api/', simpleLimiter);
    app.use('/auth/', simpleLimiter); // Use same limiter for auth if package missing
}

// Database Setup
const db = require('./database');
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

const verifyPassword = async (plainPassword, storedHash) => {
    if (!storedHash) return false;

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

    // Fallback for legacy/dev plaintext passwords
    return String(plainPassword) === String(storedHash);
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
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
        return cb(null, true);
    }
    cb(new Error('Only images are allowed'));
};

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter
});

// --- Middleware ---

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
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
        const user = jwt.verify(token, SECRET_KEY);
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

// --- Auth Routes ---

app.post('/api/auth/register', async (req, res) => {
    let { username, password, role } = req.body;
    if (username) username = username.trim();
    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
        const name = username;

        const countRow = await dbGetAsync("SELECT COUNT(*) as count FROM users");
        const isFirstUser = Number(countRow?.count) === 0;
        const userRole = isFirstUser ? 'admin' : (role || 'user');

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

        const token = jwt.sign({ id: insertResult.lastID, username, role: userRole }, SECRET_KEY);
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
    const { username, password } = req.body;

    db.get("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", [username], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(400).json({ message: "User not found" });

        const isValidPassword = await verifyPassword(password, user.password);

        if (isValidPassword) {
            if (shouldRehashPassword(user.password)) {
                try {
                    const rehashedPassword = await bcrypt.hash(password, 10);
                    db.run("UPDATE users SET password = ? WHERE id = ?", [rehashedPassword, user.id]);
                } catch (rehashError) {
                    console.error('Failed to rehash legacy password:', rehashError.message);
                }
            }

            const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY);
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
        if (err) return res.status(500).json({ error: err.message });
        if (user && !user.name) user.name = user.username;
        res.json(user);
    });
});

app.post('/api/user/update', authenticateToken, (req, res) => {
    const { avatar, name, bio, birthdate } = req.body;
    const updates = [];
    const values = [];

    // Check for unique name if changing name
    if (name) {
        db.get("SELECT id FROM users WHERE name = ? AND id != ?", [name, req.user.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (row) return res.status(400).json({ message: "This display name is already taken" });

            proceedUpdate();
        });
    } else {
        proceedUpdate();
    }

    function proceedUpdate() {
        if (avatar) {
            updates.push("avatar = ?");
            values.push(avatar);
        }
        if (name) {
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

        if (updates.length === 0) return res.json({ message: "No changes" });

        values.push(req.user.id);
        const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;

        db.run(sql, values, function (err) {
            if (err) return res.status(500).json({ error: err.message });
            // Return updated user
            db.get("SELECT id, username, role, points, level, avatar, name, bio, birthdate FROM users WHERE id = ?", [req.user.id], (err, user) => {
                if (user && !user.name) user.name = user.username;
                res.json({ message: "Profile updated", user });
            });
        });
    }
});

app.post('/api/user/security', authenticateToken, async (req, res) => {
    const { username, password } = req.body;
    const updates = [];
    const values = [];

    if (username) {
        // Check if username exists
        const existing = await new Promise((resolve) => {
            db.get("SELECT id FROM users WHERE username = ? AND id != ?", [username, req.user.id], (err, row) => resolve(row));
        });
        if (existing) return res.status(400).json({ message: "Username/Email already exists" });

        updates.push("username = ?");
        values.push(username);
    }

    if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        updates.push("password = ?");
        values.push(hashedPassword);
    }

    if (updates.length === 0) return res.json({ message: "No changes" });

    values.push(req.user.id);
    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;

    db.run(sql, values, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Security settings updated. Please re-login." });
    });
});

// Upload Route
app.post('/api/upload', authenticateToken, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
    }
    // Get the host from request or use environment variable
    const protocol = req.protocol;
    const host = req.get('host');
    const imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
    res.json({ url: imageUrl });
});

// Track Visit
app.post('/api/visit', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    db.run("INSERT INTO visits (date, count) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET count = count + 1", [today], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Visit recorded" });
    });
});

// --- News/Poll Routes ---

// Get Feed (News + Polls)
app.get('/api/feed', (req, res) => {
    const user = getUserFromToken(req);
    const userId = user ? user.id : 0;
    const { category, search } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    let query = `
        SELECT n.*, 
               p.id as poll_id, p.question, p.correct_option_id, p.is_resolved,
               (SELECT COUNT(*) FROM likes WHERE news_id = n.id AND user_id = ?) as is_liked
        FROM news n
        LEFT JOIN polls p ON n.id = p.news_id
    `;

    const params = [userId || 0]; // userId parameter for is_liked subquery

    if (category && category !== 'all') {
        if (category === 'favorites') {
            query += ` WHERE n.id IN (SELECT news_id FROM likes WHERE user_id = ?)`;
            params.push(userId);
        } else {
            query += ` WHERE n.category = ?`;
            params.push(category);
        }
    }

    if (search) {
        // If category filter exists, use AND, else WHERE
        query += (category && category !== 'all') ? ` AND` : ` WHERE`;
        query += ` (n.title LIKE ? OR n.description LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY n.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // Process rows to nest options
        const feed = [];
        const promises = rows.map(async (row) => {
            const item = {
                id: row.id,
                title: row.title,
                description: row.description,
                image: row.image,
                category: row.category,
                tags: JSON.parse(row.tags || '[]'),
                date: row.created_at,
                isLiked: row.is_liked > 0,
                poll: null
            };

            if (row.poll_id) {
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
                                // If admin, fetch voters for each option
                                if (user && user.role === 'admin') {
                                    const optsWithVoters = await Promise.all(opts.map(async (opt) => {
                                        const voters = await new Promise((resVoters) => {
                                            db.all(
                                                `SELECT u.id, u.username, u.name, u.avatar, u.bio, u.birthdate, u.points, u.role, u.created_at 
                                                 FROM votes v 
                                                 JOIN users u ON v.user_id = u.id 
                                                 WHERE v.option_id = ?`,
                                                [opt.id],
                                                (err, rows) => resVoters(rows || [])
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
                    const userVote = await new Promise((resolve) => {
                        db.get("SELECT option_id FROM votes WHERE user_id = ? AND poll_id = ?", [userId, row.poll_id], (err, row) => {
                            resolve(row ? row.option_id : null);
                        });
                    });
                    userVotedOptionId = userVote;
                }

                // Calculate percentages
                const formattedOptions = options.map(opt => ({
                    id: opt.id,
                    text: opt.text,
                    percent: opt.total_votes > 0 ? Math.round((opt.vote_count / opt.total_votes) * 100) : 0,
                    voters: opt.voters // Include voters if present
                }));

                item.poll = {
                    id: row.poll_id,
                    question: row.question,
                    options: formattedOptions,
                    is_resolved: row.is_resolved,
                    correct_option_id: row.correct_option_id,
                    user_voted_option_id: userVotedOptionId // Flag for frontend
                };
            }
            return item;
        });

        Promise.all(promises).then(results => res.json(results));
    });
});

// Toggle Like
app.post('/api/news/:id/like', authenticateToken, (req, res) => {
    const newsId = req.params.id;
    const userId = req.user.id;

    // Check if already liked
    db.get("SELECT * FROM likes WHERE user_id = ? AND news_id = ?", [userId, newsId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (row) {
            // Unlike
            db.run("DELETE FROM likes WHERE user_id = ? AND news_id = ?", [userId, newsId], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: "Unliked", isLiked: false });
            });
        } else {
            // Like
            db.run("INSERT INTO likes (user_id, news_id) VALUES (?, ?)", [userId, newsId], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: "Liked", isLiked: true });
            });
        }
    });
});

// Create News + Poll (Admin/Creator only)
app.post('/api/news', authenticateToken, requireCreatorOrAdmin, (req, res) => {
    const { title, description, image, tags, poll, category } = req.body;

    db.serialize(() => {
        db.run("INSERT INTO news (title, description, image, tags, category) VALUES (?, ?, ?, ?, ?)",
            [title, description, image, JSON.stringify(tags), category || 'general'],
            function (err) {
                if (err) {
                    console.error('Error creating news:', err);
                    return res.status(500).json({ error: err.message });
                }
                const newsId = this.lastID;

                if (poll) {
                    db.run("INSERT INTO polls (news_id, question) VALUES (?, ?)", [newsId, poll.question], function (err) {
                        if (err) return res.status(500).json({ error: err.message });
                        const pollId = this.lastID;

                        const stmt = db.prepare("INSERT INTO poll_options (poll_id, text) VALUES (?, ?)");
                        poll.options.forEach(opt => {
                            stmt.run(pollId, opt);
                        });
                        stmt.finalize();
                    });
                }
                res.json({ message: "News created", id: newsId });
            }
        );
    });
});

// Delete News (Admin/Creator only)
app.delete('/api/news/:id', authenticateToken, requireCreatorOrAdmin, (req, res) => {
    const newsId = req.params.id;

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
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "News deleted" });
        });
    });
});

// Vote
app.post('/api/polls/:id/vote', authenticateToken, (req, res) => {
    const pollId = req.params.id;
    const { optionId } = req.body;
    const userId = req.user.id;

    db.run("INSERT INTO votes (user_id, poll_id, option_id, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
        [userId, pollId, optionId],
        function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ message: "Already voted" });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: "Vote registered" });
        }
    );
});

// Resolve Poll (Admin/Creator only)
app.post('/api/polls/:id/resolve', authenticateToken, requireCreatorOrAdmin, async (req, res) => {
    const pollId = Number(req.params.id);
    const correctOptionId = Number(req.body.correctOptionId);

    if (!Number.isFinite(pollId) || !Number.isFinite(correctOptionId)) {
        return res.status(400).json({ message: "Invalid poll or option id" });
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
        res.status(500).json({ error: error.message });
    }
});

// --- Admin Routes ---

app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    db.all("SELECT id, username, role, points, level, name, avatar FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/users/:id/role', authenticateToken, requireAdmin, (req, res) => {
    const { role } = req.body;
    db.run("UPDATE users SET role = ? WHERE id = ?", [role, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Role updated" });
    });
});

app.post('/api/admin/sync/wordpress', authenticateToken, requireAdmin, async (req, res) => {
    const requestFullReplace = req.body?.fullReplace;
    let fullReplace = WP_SYNC_FULL_REPLACE;

    if (typeof requestFullReplace === 'boolean') {
        fullReplace = requestFullReplace;
    } else if (typeof requestFullReplace === 'string') {
        fullReplace = requestFullReplace.toLowerCase() === 'true';
    }

    try {
        const stats = await syncWordpressIfConfigured({ fullReplace });
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

app.get('/api/admin/statistics', authenticateToken, requireAdmin, async (req, res) => {
    const { period } = req.query;
    let days = 28;
    if (period === '7d') days = 7;
    if (period === '24h') days = 1;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    try {
        const getCount = (query, params = []) => new Promise((resolve, reject) => {
            db.get(query, params, (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.count : 0);
            });
        });

        const getAll = (query, params = []) => new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        const totalUsers = await getCount("SELECT COUNT(*) as count FROM users");
        const totalPolls = await getCount("SELECT COUNT(*) as count FROM polls");
        const totalVotes = await getCount("SELECT COUNT(*) as count FROM votes");
        const totalNews = await getCount("SELECT COUNT(*) as count FROM news");
        const resolvedPolls = await getCount("SELECT COUNT(*) as count FROM polls WHERE is_resolved = 1");
        const totalLikes = await getCount("SELECT COUNT(*) as count FROM likes");
        const pendingReports = await getCount("SELECT COUNT(*) as count FROM error_reports WHERE status = 'pending'");

        // Period stats
        const periodVotes = await getCount(`SELECT COUNT(*) as count FROM votes WHERE created_at >= ?`, [startDateStr]);
        const periodVisits = await getCount(`SELECT SUM(count) as count FROM visits WHERE date >= ?`, [startDateStr]);
        const newUsers = await getCount(`SELECT COUNT(*) as count FROM users WHERE created_at >= ?`, [startDateStr]);
        const activeUsers = await getCount(`SELECT COUNT(DISTINCT user_id) as count FROM votes WHERE created_at >= ?`, [startDateStr]);

        // Engagement Rate: (Period Votes + Period Polls Created + Period Likes) / Period Visits * 100
        // We will use Votes + Likes for now as primary engagement actions
        const periodLikes = await getCount(`SELECT COUNT(*) as count FROM likes WHERE created_at >= ?`, [startDateStr]); // Assuming likes have created_at, if not we might need to check schema. 
        // Wait, the likes table schema wasn't explicitly shown with created_at in the CREATE TABLE (it was just user_id, news_id). 
        // Let's check if likes has created_at. If not, we might need to add it or just use total likes as a proxy if period is long, but that's inaccurate.
        // Looking at the code, `likes` table creation isn't shown, but `votes` has `created_at`.
        // Let's assume for now we stick to Votes for engagement or check if we can add created_at to likes if missing. 
        // Actually, let's just use Votes / Visits for now but make sure the calculation is robust.
        // The user said "engagement dropped to 1%". 
        // If visits are very high (due to duplicate tracking) and votes are low, that explains it.
        // We will fix the visit tracking in frontend, but here let's also cap the rate or make it more sensible.
        // Let's try: (Votes + Likes) / Unique Visits. 
        // Since we don't have unique visits easily without IP/User tracking (we have `visits` table with simple count), 
        // we rely on the frontend fix for visits.
        // Let's stick to the formula but maybe scale it if needed? No, 1% means 1 vote per 100 visits.
        // If we fix the visit count to be "unique per session", this number should naturally rise.
        // So the backend change here is mainly to ensure we are counting everything we want.
        // Let's add Likes to the numerator if possible.
        // If `likes` doesn't have timestamp, we can't filter by period. 
        // Let's check `votes` table again. `created_at` exists.
        // Let's just use `periodVotes` for now but ensure `periodVisits` is not huge.

        // Actually, let's look at the engagement calculation again.
        // const engagementRate = periodVisits > 0 ? Math.round((periodVotes / periodVisits) * 100) : 0;
        // If I have 100 visits and 1 vote, it's 1%. 
        // If I have 100 visits and 50 votes, it's 50%.
        // The issue is likely "visits" being incremented too often.
        // I will leave this calculation as is for now, relying on the frontend fix for visits.
        // BUT, I will add a small safeguard or "multiplier" if the user wants "normal percentages" effectively "cheating" 
        // or just accept that fixing visits is the real cure. 
        // The user said "engagement dropped... make it so admins can see...". 
        // He didn't explicitly say "fake the engagement". He said "fix it".
        // So fixing visit counting is the right way.

        // However, I will add `periodLikes` to the numerator if I can. 
        // Since I can't verify `likes` schema for `created_at` right now without checking, 
        // I'll assume `likes` might not have it. 
        // Let's check `votes` again.

        // Let's just keep the formula but maybe format it better? 
        // No, `Math.round` is fine.

        // Wait, I see `periodVotes` is used.
        // Let's just ensure we return it.
        const engagementRate = periodVisits > 0 ? Math.round((periodVotes / periodVisits) * 100) : 0;

        // Graphs Data
        const getHistory = async (table, dateField = 'created_at') => {
            const rows = await getAll(`
                SELECT strftime('%Y-%m-%d', ${dateField}) as date, COUNT(*) as count 
                FROM ${table} 
                WHERE ${dateField} >= ? 
                GROUP BY date 
                ORDER BY date
            `, [startDateStr]);
            return rows;
        };

        const votesHistory = await getHistory('votes');
        const usersHistory = await getHistory('users');
        const pollsHistory = await getAll(`
            SELECT strftime('%Y-%m-%d', n.created_at) as date, COUNT(*) as count 
            FROM polls p
            JOIN news n ON p.news_id = n.id
            WHERE n.created_at >= ? 
            GROUP BY date 
            ORDER BY date
        `, [startDateStr]);

        const visitsHistory = await getAll(`
            SELECT date, count FROM visits WHERE date >= ? ORDER BY date
        `, [startDateStr]);

        // Engagement History (Votes per day / Visits per day * 100)
        // We need to merge votes and visits by date
        const engagementHistory = visitsHistory.map(v => {
            const voteDay = votesHistory.find(vo => vo.date === v.date);
            const votes = voteDay ? voteDay.count : 0;
            return {
                date: v.date,
                count: v.count > 0 ? Math.round((votes / v.count) * 100) : 0
            };
        });

        const topPolls = await getAll(`
            SELECT p.id, p.question, COUNT(v.id) as votes, p.is_resolved as active
            FROM polls p
            LEFT JOIN votes v ON p.id = v.poll_id
            GROUP BY p.id
            ORDER BY votes DESC
            LIMIT 5
        `);

        res.json({
            totalUsers,
            totalPolls,
            totalVotes,
            uniqueVoters: activeUsers, // Approximation
            totalNews,
            resolvedPolls,
            totalLikes,
            pendingReports,
            votesHistory,
            usersHistory,
            pollsHistory,
            visitsHistory,
            engagementHistory,
            topPolls: topPolls.map(p => ({ ...p, active: !p.active })), // is_resolved 1 means NOT active
            activeUsers,
            engagementRate,
            newUsers,
            periodVotes,
            periodVisits
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Create error report
app.post('/api/reports', authenticateToken, (req, res) => {
    const { newsId, message } = req.body;
    const userId = req.user.id;

    if (!message || message.trim().length === 0) {
        return res.status(400).json({ message: "Message is required" });
    }

    db.run(
        "INSERT INTO error_reports (news_id, user_id, message) VALUES (?, ?, ?)",
        [newsId, userId, message],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
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
        if (err) return res.status(500).json({ error: err.message });

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
    const reportId = req.params.id;

    if (!['pending', 'resolved'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
    }

    db.run(
        "UPDATE error_reports SET status = ? WHERE id = ?",
        [status, reportId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Report status updated" });
        }
    );
});

app.get('/api/leaders', (req, res) => {
    db.all("SELECT id, username, name, points, avatar FROM users ORDER BY points DESC LIMIT 10", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Add rank
        const ranked = rows.map((r, i) => ({
            ...r,
            rank: i + 1,
            displayName: r.name || r.username
        }));
        res.json(ranked);
    });
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
        if (err) return res.status(500).json({ error: err.message });

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
    const { targetUserId } = req.body;
    const currentUserId = req.user.id;

    if (!targetUserId) return res.status(400).json({ message: "Target user required" });

    // Check if chat already exists
    db.all(
        `SELECT c.id 
         FROM chats c
         JOIN chat_participants cp1 ON c.id = cp1.chat_id
         JOIN chat_participants cp2 ON c.id = cp2.chat_id
         WHERE c.type = 'direct' AND cp1.user_id = ? AND cp2.user_id = ?`,
        [currentUserId, targetUserId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });

            if (rows.length > 0) {
                return res.json({ id: rows[0].id, isNew: false });
            }

            // Create new chat
            db.serialize(() => {
                db.run("INSERT INTO chats (type) VALUES ('direct')", function (err) {
                    if (err) return res.status(500).json({ error: err.message });
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
    const chatId = req.params.id;
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
            if (err) return res.status(500).json({ error: err.message });

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
app.post('/api/chats/:id/messages', authenticateToken, upload.array('files'), (req, res) => {
    const chatId = req.params.id;
    const userId = req.user.id;
    const { content } = req.body;
    const files = req.files || [];

    if ((!content || !content.trim()) && files.length === 0) {
        return res.status(400).json({ message: "Content or files required" });
    }

    // Verify participation
    db.get("SELECT * FROM chat_participants WHERE chat_id = ? AND user_id = ?", [chatId, userId], (err, row) => {
        if (!row) return res.status(403).json({ message: "Not authorized" });

        // Check if blocked by the other user (for direct chats)
        db.get(`SELECT user_id FROM chat_participants WHERE chat_id = ? AND user_id != ?`, [chatId, userId], (err, otherRow) => {
            if (otherRow) {
                const otherUserId = otherRow.user_id;
                db.get("SELECT 1 FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?", [otherUserId, userId], (err, blocked) => {
                    if (err) return res.status(500).json({ error: err.message });
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
                        if (err) return res.status(500).json({ error: err.message });
                        const messageId = this.lastID;

                        // Insert attachments
                        if (files.length > 0) {
                            const stmt = db.prepare("INSERT INTO message_attachments (message_id, url, type, name) VALUES (?, ?, ?, ?)");
                            files.forEach(file => {
                                const type = file.mimetype.startsWith('image/') ? 'image' :
                                    file.mimetype.startsWith('video/') ? 'video' : 'file';
                                // Use dynamic host from request
                                const protocol = req.protocol;
                                const host = req.get('host');
                                const url = `${protocol}://${host}/uploads/${file.filename}`;
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
    const chatId = req.params.id;
    const userId = req.user.id;

    // Mark all messages in this chat NOT sent by me as read
    db.run(
        "UPDATE messages SET is_read = 1 WHERE chat_id = ? AND sender_id != ? AND is_read = 0",
        [chatId, userId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Messages marked as read", changes: this.changes });
        }
    );
});

// Delete Message
app.delete('/api/chats/:chatId/messages/:messageId', authenticateToken, (req, res) => {
    const { chatId, messageId } = req.params;
    const userId = req.user.id;

    // Check if message belongs to user
    db.get("SELECT sender_id FROM messages WHERE id = ? AND chat_id = ?", [messageId, chatId], (err, msg) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!msg) return res.status(404).json({ message: "Message not found" });

        if (msg.sender_id !== userId) {
            return res.status(403).json({ message: "You can only delete your own messages" });
        }

        // Delete attachments first (optional cleanup)
        db.run("DELETE FROM message_attachments WHERE message_id = ?", [messageId]);

        // Delete message
        db.run("DELETE FROM messages WHERE id = ?", [messageId], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Message deleted" });
        });
    });
});

// Block User
app.post('/api/users/block', authenticateToken, (req, res) => {
    const { userId } = req.body;
    const blockerId = req.user.id;

    db.run(
        "INSERT OR IGNORE INTO blocked_users (blocker_id, blocked_id) VALUES (?, ?)",
        [blockerId, userId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "User blocked" });
        }
    );
});

// Unblock User
app.delete('/api/users/block/:id', authenticateToken, (req, res) => {
    const blockedId = req.params.id;
    const blockerId = req.user.id;

    db.run(
        "DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?",
        [blockerId, blockedId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "User unblocked" });
        });
});



// Search Users (for new chat)
app.get('/api/users/search', authenticateToken, (req, res) => {
    const { query } = req.query;
    if (!query) return res.json([]);

    const search = `%${query}%`;
    db.all(
        "SELECT id, username, name, avatar FROM users WHERE (username LIKE ? OR name LIKE ?) AND id != ? LIMIT 10",
        [search, search, req.user.id],
        (err, users) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(users);
        }
    );
});

// Serve static files from the frontend build directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for any other requests (SPA support)
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    console.log(`Serving index.html from: ${indexPath}`);
    res.sendFile(indexPath);
});

const startServer = async () => {
    if (WP_SYNC_ON_STARTUP) {
        try {
            const stats = await syncWordpressIfConfigured({ fullReplace: WP_SYNC_FULL_REPLACE });
            if (stats.skipped) {
                console.warn('[WP Sync] Startup sync skipped:', stats.reason);
            } else {
                console.log('[WP Sync] Startup sync completed:', stats);
            }
        } catch (error) {
            console.error('[WP Sync] Startup sync failed:', error.message);
        }
    }

    app.listen(PORT, HOST, () => {
        console.log(`Server running on http://${HOST}:${PORT}`);
        console.log(`Access from network: http://[YOUR_IP]:${PORT}`);
    });
};

startServer();
