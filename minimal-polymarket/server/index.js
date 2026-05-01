import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import express from 'express';
import pg from 'pg';

dotenv.config({ quiet: true });

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(__dirname, 'data');
const jsonDbPath = path.join(dataDir, 'db.json');
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const authSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'local-dev-secret-change-before-deploy';
const sessionTtlSeconds = 60 * 60 * 24 * 14;
const marketPrior = 50;

const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    })
  : null;

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function signToken(user) {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    sub: user.id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + sessionTtlSeconds,
  }));
  const signature = crypto
    .createHmac('sha256', authSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  const [header, payload, signature] = token.split('.');

  if (!header || !payload || !signature) return null;

  const expectedSignature = crypto
    .createHmac('sha256', authSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

    if (!session.sub || Number(session.exp) < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(password, salt, 64).toString('base64url');

  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [scheme, salt, hash] = String(storedHash).split(':');

  if (scheme !== 'scrypt' || !salt || !hash) return false;

  const expected = Buffer.from(hash, 'base64url');
  const actual = crypto.scryptSync(password, salt, 64);

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: new Date(user.createdAt).toISOString(),
  };
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function clampPercent(value) {
  return Math.max(1, Math.min(99, Math.round(value)));
}

function getDisplayPrices(market) {
  const yesPrice = clampPercent(market.lastYesPrice ?? 50);

  return {
    yesPrice,
    noPrice: 100 - yesPrice,
    yesPercent: yesPrice,
    noPercent: 100 - yesPrice,
  };
}

function calculateTrade({ amount, currentYesPrice, outcome, totalVolume }) {
  const liquidity = 75 + Math.sqrt(Math.max(0, totalVolume)) * 12;
  const impact = Math.max(1, Math.min(18, Math.round((amount / liquidity) * 8)));
  const yesPriceAfterCents = clampPercent(currentYesPrice + (outcome === 'YES' ? impact : -impact));
  const priceCents = outcome === 'YES' ? yesPriceAfterCents : 100 - yesPriceAfterCents;

  return {
    priceCents,
    yesPriceAfterCents,
    shares: amount / (priceCents / 100),
  };
}

function normalizeMarket(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    category: row.category || 'Общее',
    closeDate: row.close_date || row.closeDate,
    status: row.status || 'open',
    yesPool: asNumber(row.yes_pool ?? row.yesPool),
    noPool: asNumber(row.no_pool ?? row.noPool),
    createdBy: row.created_by || row.createdBy,
    creatorName: row.creator_name || row.creatorName || null,
    createdAt: row.created_at || row.createdAt,
    tradeCount: asNumber(row.trade_count ?? row.tradeCount),
    lastYesPrice: row.last_yes_price == null && row.lastYesPrice == null
      ? null
      : asNumber(row.last_yes_price ?? row.lastYesPrice),
  };
}

function normalizeTrade(row) {
  return {
    id: row.id,
    marketId: row.market_id || row.marketId,
    userId: row.user_id || row.userId,
    userName: row.user_name || row.userName || 'Пользователь',
    outcome: row.outcome,
    amount: roundMoney(asNumber(row.amount)),
    priceCents: asNumber(row.price_cents ?? row.priceCents),
    yesPriceAfterCents: asNumber(row.yes_price_after_cents ?? row.yesPriceAfterCents, 50),
    shares: roundMoney(asNumber(row.shares)),
    createdAt: row.created_at || row.createdAt,
  };
}

function marketDto(market, options = {}) {
  const prices = getDisplayPrices(market);
  const volume = roundMoney(market.yesPool + market.noPool);
  const recentTrades = (options.recentTrades || []).map((trade) => ({
    id: trade.id,
    userId: trade.userId,
    userName: trade.userName,
    outcome: trade.outcome,
    amount: trade.amount,
    priceCents: trade.priceCents,
    shares: trade.shares,
    createdAt: new Date(trade.createdAt).toISOString(),
  }));
  const history = buildHistory(market, options.historyTrades || []);

  return {
    id: market.id,
    title: market.title,
    description: market.description,
    category: market.category,
    closeDate: new Date(market.closeDate).toISOString(),
    status: market.status,
    createdAt: new Date(market.createdAt).toISOString(),
    createdBy: market.createdBy
      ? {
          id: market.createdBy,
          name: market.creatorName || 'Пользователь',
        }
      : null,
    yesPool: roundMoney(market.yesPool),
    noPool: roundMoney(market.noPool),
    volume,
    tradeCount: market.tradeCount,
    ...prices,
    outcomes: [
      { name: 'Да', outcome: 'YES', percent: prices.yesPercent, priceCents: prices.yesPrice, pool: roundMoney(market.yesPool) },
      { name: 'Нет', outcome: 'NO', percent: prices.noPercent, priceCents: prices.noPrice, pool: roundMoney(market.noPool) },
    ],
    recentTrades,
    history,
  };
}

function buildHistory(market, trades) {
  const points = [{
    time: new Date(market.createdAt).toISOString(),
    yesPercent: 50,
  }];

  for (const trade of trades) {
    points.push({
      time: new Date(trade.createdAt).toISOString(),
      yesPercent: trade.yesPriceAfterCents,
    });
  }

  if (points.length === 1) {
    points.push({
    time: new Date().toISOString(),
      yesPercent: getDisplayPrices(market).yesPercent,
    });
  }

  return points.slice(-80);
}

async function initPostgres() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS markets (
      id text PRIMARY KEY,
      title text NOT NULL,
      description text NOT NULL DEFAULT '',
      category text NOT NULL DEFAULT 'Общее',
      close_date timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'open',
      yes_pool numeric NOT NULL DEFAULT 0,
      no_pool numeric NOT NULL DEFAULT 0,
      created_by text REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS votes (
      id text PRIMARY KEY,
      market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
      user_id text REFERENCES users(id) ON DELETE SET NULL,
      outcome text NOT NULL CHECK (outcome IN ('YES', 'NO')),
      amount numeric NOT NULL,
      price_cents numeric NOT NULL,
      yes_price_after_cents numeric NOT NULL DEFAULT 50,
      shares numeric NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS markets_created_at_idx ON markets (created_at DESC);');
  await pool.query('CREATE INDEX IF NOT EXISTS votes_market_created_at_idx ON votes (market_id, created_at DESC);');
}

async function ensureJsonDb() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(jsonDbPath);
  } catch {
    await fs.writeFile(jsonDbPath, JSON.stringify({ users: [], markets: [], votes: [] }, null, 2));
  }
}

async function readJsonDb() {
  await ensureJsonDb();
  const content = await fs.readFile(jsonDbPath, 'utf8');

  return JSON.parse(content);
}

async function writeJsonDb(db) {
  await fs.writeFile(jsonDbPath, JSON.stringify(db, null, 2));
}

async function initStorage() {
  if (pool) {
    await initPostgres();
    return;
  }

  await ensureJsonDb();
}

const storage = {
  async createUser({ name, email, passwordHash }) {
    const id = newId('usr');
    const createdAt = new Date().toISOString();

    if (pool) {
      try {
        const result = await pool.query(
          'INSERT INTO users (id, name, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, created_at',
          [id, name, email, passwordHash, createdAt],
        );
        const user = result.rows[0];

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.created_at,
        };
      } catch (error) {
        if (error.code === '23505') {
          const duplicateError = new Error('EMAIL_EXISTS');
          duplicateError.status = 409;
          throw duplicateError;
        }
        throw error;
      }
    }

    const db = await readJsonDb();
    if (db.users.some((user) => user.email === email)) {
      const duplicateError = new Error('EMAIL_EXISTS');
      duplicateError.status = 409;
      throw duplicateError;
    }

    const user = { id, name, email, passwordHash, createdAt };
    db.users.push(user);
    await writeJsonDb(db);

    return user;
  },

  async findUserByEmail(email) {
    if (pool) {
      const result = await pool.query('SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1', [email]);
      const user = result.rows[0];

      return user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
            passwordHash: user.password_hash,
            createdAt: user.created_at,
          }
        : null;
    }

    const db = await readJsonDb();
    return db.users.find((user) => user.email === email) || null;
  },

  async findUserById(id) {
    if (pool) {
      const result = await pool.query('SELECT id, name, email, created_at FROM users WHERE id = $1', [id]);
      const user = result.rows[0];

      return user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.created_at,
          }
        : null;
    }

    const db = await readJsonDb();
    return db.users.find((user) => user.id === id) || null;
  },

  async listMarkets() {
    if (pool) {
      const result = await pool.query(`
        SELECT
          m.*,
          u.name AS creator_name,
          COUNT(v.id)::int AS trade_count,
          (
            SELECT latest.yes_price_after_cents
            FROM votes latest
            WHERE latest.market_id = m.id
            ORDER BY latest.created_at DESC
            LIMIT 1
          ) AS last_yes_price
        FROM markets m
        LEFT JOIN users u ON u.id = m.created_by
        LEFT JOIN votes v ON v.market_id = m.id
        GROUP BY m.id, u.name
        ORDER BY m.created_at DESC
      `);

      return result.rows.map(normalizeMarket);
    }

    const db = await readJsonDb();
    const tradeCounts = db.votes.reduce((counts, vote) => {
      counts[vote.marketId] = (counts[vote.marketId] || 0) + 1;
      return counts;
    }, {});

    return [...db.markets]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .map((market) => normalizeMarket({
        ...market,
        tradeCount: tradeCounts[market.id] || 0,
        lastYesPrice: [...db.votes]
          .filter((vote) => vote.marketId === market.id)
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0]?.yesPriceAfterCents ?? null,
        creatorName: db.users.find((user) => user.id === market.createdBy)?.name || null,
      }));
  },

  async createMarket({ title, description, category, closeDate, createdBy }) {
    const id = newId('mkt');
    const createdAt = new Date().toISOString();
    const market = {
      id,
      title,
      description,
      category,
      closeDate: new Date(closeDate).toISOString(),
      status: 'open',
      yesPool: 0,
      noPool: 0,
      createdBy,
      createdAt,
      tradeCount: 0,
    };

    if (pool) {
      const result = await pool.query(
        `INSERT INTO markets (id, title, description, category, close_date, status, yes_pool, no_pool, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, 'open', 0, 0, $6, $7)
         RETURNING *`,
        [id, title, description, category, market.closeDate, createdBy, createdAt],
      );

      return normalizeMarket({ ...result.rows[0], trade_count: 0, creator_name: null });
    }

    const db = await readJsonDb();
    db.markets.push(market);
    await writeJsonDb(db);

    return normalizeMarket(market);
  },

  async getMarket(id) {
    if (pool) {
      const result = await pool.query(`
        SELECT
          m.*,
          u.name AS creator_name,
          COUNT(v.id)::int AS trade_count,
          (
            SELECT latest.yes_price_after_cents
            FROM votes latest
            WHERE latest.market_id = m.id
            ORDER BY latest.created_at DESC
            LIMIT 1
          ) AS last_yes_price
        FROM markets m
        LEFT JOIN users u ON u.id = m.created_by
        LEFT JOIN votes v ON v.market_id = m.id
        WHERE m.id = $1
        GROUP BY m.id, u.name
      `, [id]);

      return result.rows[0] ? normalizeMarket(result.rows[0]) : null;
    }

    const db = await readJsonDb();
    const market = db.markets.find((item) => item.id === id);

    if (!market) return null;

    return normalizeMarket({
      ...market,
      tradeCount: db.votes.filter((vote) => vote.marketId === id).length,
      lastYesPrice: [...db.votes]
        .filter((vote) => vote.marketId === id)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0]?.yesPriceAfterCents ?? null,
      creatorName: db.users.find((user) => user.id === market.createdBy)?.name || null,
    });
  },

  async getTrades(marketId, order = 'desc', limit = 80) {
    if (pool) {
      const direction = order === 'asc' ? 'ASC' : 'DESC';
      const result = await pool.query(`
        SELECT v.*, u.name AS user_name
        FROM votes v
        LEFT JOIN users u ON u.id = v.user_id
        WHERE v.market_id = $1
        ORDER BY v.created_at ${direction}
        LIMIT $2
      `, [marketId, limit]);

      return result.rows.map(normalizeTrade);
    }

    const db = await readJsonDb();
    const usersById = new Map(db.users.map((user) => [user.id, user]));
    const trades = db.votes
      .filter((vote) => vote.marketId === marketId)
      .sort((left, right) => {
        const diff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        return order === 'asc' ? diff : -diff;
      })
      .slice(0, limit)
      .map((vote) => normalizeTrade({
        ...vote,
        userName: usersById.get(vote.userId)?.name || 'Пользователь',
      }));

    return trades;
  },

  async placeVote({ marketId, userId, outcome, amount }) {
    const createdAt = new Date().toISOString();
    const id = newId('vot');

    if (pool) {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        const marketResult = await client.query('SELECT * FROM markets WHERE id = $1 FOR UPDATE', [marketId]);
        const row = marketResult.rows[0];

        if (!row) {
          const notFoundError = new Error('MARKET_NOT_FOUND');
          notFoundError.status = 404;
          throw notFoundError;
        }

        const market = normalizeMarket(row);
        assertMarketIsOpen(market);

        const latestTradeResult = await client.query(
          'SELECT yes_price_after_cents FROM votes WHERE market_id = $1 ORDER BY created_at DESC LIMIT 1',
          [marketId],
        );
        const currentYesPrice = clampPercent(asNumber(latestTradeResult.rows[0]?.yes_price_after_cents, 50));
        const { priceCents, shares, yesPriceAfterCents } = calculateTrade({
          amount,
          currentYesPrice,
          outcome,
          totalVolume: market.yesPool + market.noPool,
        });
        const yesPool = outcome === 'YES' ? market.yesPool + amount : market.yesPool;
        const noPool = outcome === 'NO' ? market.noPool + amount : market.noPool;

        await client.query(
          `INSERT INTO votes (id, market_id, user_id, outcome, amount, price_cents, yes_price_after_cents, shares, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [id, marketId, userId, outcome, amount, priceCents, yesPriceAfterCents, shares, createdAt],
        );
        await client.query('UPDATE markets SET yes_pool = $1, no_pool = $2 WHERE id = $3', [yesPool, noPool, marketId]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      return;
    }

    const db = await readJsonDb();
    const market = db.markets.find((item) => item.id === marketId);

    if (!market) {
      const notFoundError = new Error('MARKET_NOT_FOUND');
      notFoundError.status = 404;
      throw notFoundError;
    }

    const normalizedMarket = normalizeMarket(market);
    assertMarketIsOpen(normalizedMarket);

    const latestTrade = [...db.votes]
      .filter((vote) => vote.marketId === marketId)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
    const currentYesPrice = clampPercent(asNumber(latestTrade?.yesPriceAfterCents, 50));
    const { priceCents, shares, yesPriceAfterCents } = calculateTrade({
      amount,
      currentYesPrice,
      outcome,
      totalVolume: normalizedMarket.yesPool + normalizedMarket.noPool,
    });

    if (outcome === 'YES') {
      market.yesPool = roundMoney(asNumber(market.yesPool) + amount);
    } else {
      market.noPool = roundMoney(asNumber(market.noPool) + amount);
    }

    db.votes.push({
      id,
      marketId,
      userId,
      outcome,
      amount,
      priceCents,
      yesPriceAfterCents,
      shares: roundMoney(shares),
      createdAt,
    });
    await writeJsonDb(db);
  },
};

function assertMarketIsOpen(market) {
  if (market.status !== 'open' || new Date(market.closeDate).getTime() <= Date.now()) {
    const closedError = new Error('MARKET_CLOSED');
    closedError.status = 409;
    throw closedError;
  }
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseMarketInput(body) {
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const category = String(body.category || 'Общее').trim();
  const closeDate = new Date(body.closeDate);

  if (title.length < 8 || title.length > 180) {
    throw validationError('Вопрос должен быть от 8 до 180 символов.');
  }

  if (description.length > 2000) {
    throw validationError('Описание не должно быть длиннее 2000 символов.');
  }

  if (category.length < 2 || category.length > 48) {
    throw validationError('Категория должна быть от 2 до 48 символов.');
  }

  if (Number.isNaN(closeDate.getTime()) || closeDate.getTime() <= Date.now()) {
    throw validationError('Дата завершения должна быть в будущем.');
  }

  return {
    title,
    description,
    category,
    closeDate: closeDate.toISOString(),
  };
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const session = verifyToken(token);

  if (!session) {
    res.status(401).json({ error: 'Нужно войти в аккаунт.' });
    return;
  }

  const user = await storage.findUserById(session.sub);

  if (!user) {
    res.status(401).json({ error: 'Сессия устарела. Войди заново.' });
    return;
  }

  req.user = publicUser(user);
  next();
}

async function marketDetailResponse(id) {
  const market = await storage.getMarket(id);

  if (!market) return null;

  const [recentTrades, historyTrades] = await Promise.all([
    storage.getTrades(id, 'desc', 8),
    storage.getTrades(id, 'asc', 80),
  ]);

  return marketDto(market, { recentTrades, historyTrades });
}

const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    storage: pool ? 'postgres' : 'json',
    now: new Date().toISOString(),
  });
});

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (name.length < 2 || name.length > 40) {
    throw validationError('Имя должно быть от 2 до 40 символов.');
  }

  if (!validateEmail(email)) {
    throw validationError('Укажи корректный email.');
  }

  if (password.length < 8) {
    throw validationError('Пароль должен быть минимум 8 символов.');
  }

  const user = await storage.createUser({ name, email, passwordHash: hashPassword(password) });
  const publicProfile = publicUser(user);

  res.status(201).json({
    user: publicProfile,
    token: signToken(publicProfile),
  });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const user = await storage.findUserByEmail(email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'Неверный email или пароль.' });
    return;
  }

  const publicProfile = publicUser(user);

  res.json({
    user: publicProfile,
    token: signToken(publicProfile),
  });
}));

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get(['/api/markets', '/api/posts'], asyncRoute(async (req, res) => {
  const markets = await storage.listMarkets();

  res.json({ markets: markets.map((market) => marketDto(market)) });
}));

app.post(['/api/markets', '/api/posts'], requireAuth, asyncRoute(async (req, res) => {
  const input = parseMarketInput(req.body);
  const market = await storage.createMarket({ ...input, createdBy: req.user.id });
  const detail = await marketDetailResponse(market.id);

  res.status(201).json({ market: detail });
}));

app.get(['/api/markets/:id', '/api/posts/:id'], asyncRoute(async (req, res) => {
  const market = await marketDetailResponse(req.params.id);

  if (!market) {
    res.status(404).json({ error: 'Рынок не найден.' });
    return;
  }

  res.json({ market });
}));

app.post(['/api/markets/:id/votes', '/api/posts/:id/votes'], requireAuth, asyncRoute(async (req, res) => {
  const outcome = String(req.body.outcome || '').toUpperCase();
  const amount = roundMoney(Number(req.body.amount));

  if (outcome !== 'YES' && outcome !== 'NO') {
    throw validationError('Выбери Да или Нет.');
  }

  if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
    throw validationError('Сумма должна быть от $1 до $10 000.');
  }

  await storage.placeVote({
    marketId: req.params.id,
    userId: req.user.id,
    outcome,
    amount,
  });

  const market = await marketDetailResponse(req.params.id);
  res.status(201).json({ market });
}));

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const status = error.status || 500;
  const messageByCode = {
    EMAIL_EXISTS: 'Такой email уже зарегистрирован.',
    MARKET_NOT_FOUND: 'Рынок не найден.',
    MARKET_CLOSED: 'Рынок закрыт для новых сделок.',
  };

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    error: messageByCode[error.message] || error.message || 'Что-то пошло не так.',
  });
});

async function attachFrontend() {
  if (isProduction) {
    const distDir = path.join(rootDir, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
    return;
  }

  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root: rootDir,
    appType: 'custom',
    server: {
      middlewareMode: true,
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  });

  app.use(vite.middlewares);
  app.use('*', async (req, res, next) => {
    try {
      const url = req.originalUrl;
      const templatePath = path.join(rootDir, 'index.html');
      const template = await fs.readFile(templatePath, 'utf8');
      const html = await vite.transformIndexHtml(url, template);

      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (error) {
      vite.ssrFixStacktrace(error);
      next(error);
    }
  });
}

await initStorage();
await attachFrontend();

app.listen(port, '0.0.0.0', () => {
  const storageName = pool ? 'Postgres' : 'local JSON';
  console.log(`Legio server running on http://localhost:${port} with ${storageName} storage`);
});
