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
const configuredJsonDataDir = cleanEnvValue(
  process.env.LEGIO_DATA_DIR
  || process.env.DATA_DIR
  || process.env.RAILWAY_VOLUME_MOUNT_PATH
  || '',
);
const dataDir = configuredJsonDataDir ? path.resolve(configuredJsonDataDir) : path.join(__dirname, 'data');
const jsonDbPath = path.join(dataDir, 'db.json');
const isProduction = process.env.NODE_ENV === 'production';
const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);
const port = Number(process.env.PORT || 3000);
const sessionTtlSeconds = 60 * 60 * 24 * 14;
const sessionCookieName = 'legio_session';
const secureCookies = (isProduction || isRailway) && process.env.COOKIE_SECURE !== 'false';
const allowBearerTokens = process.env.ALLOW_BEARER_TOKENS === 'true';
const minPasswordLength = 12;
const maxPasswordLength = 128;
const defaultStartingBalance = 10000;
const defaultMarketLiquidity = 1000;
const defaultMinOrderSize = 1;
const defaultTickSize = 1;
const marketStatuses = new Set(['open', 'paused', 'resolved', 'canceled']);
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const configuredAppOrigin = normalizeOrigin(cleanEnvValue(process.env.APP_ORIGIN));
const configuredAllowedOrigins = new Set(
  cleanEnvValue(process.env.ALLOWED_ORIGINS)
    .split(',')
    .map((origin) => normalizeOrigin(cleanEnvValue(origin)))
    .filter(Boolean),
);
const authSecret = resolveAuthSecret();
const bootstrapAdminEmail = normalizeEmail(cleanEnvValue(process.env.INITIAL_ADMIN_EMAIL));
const bootstrapAdminPassword = cleanEnvValue(process.env.INITIAL_ADMIN_PASSWORD);
const bootstrapAdminName = cleanEnvValue(process.env.INITIAL_ADMIN_NAME || 'Legio Admin') || 'Legio Admin';

const databaseUrl =
  cleanEnvValue(process.env.DATABASE_URL)
  || cleanEnvValue(process.env.POSTGRES_URL)
  || cleanEnvValue(process.env.DATABASE_PRIVATE_URL)
  || cleanEnvValue(process.env.POSTGRES_PRIVATE_URL)
  || '';
const hasPgEnvironment = Boolean(process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER);
const hasPersistentJsonStorage = Boolean(configuredJsonDataDir);
const allowJsonStorage = cleanEnvValue(process.env.ALLOW_JSON_STORAGE) === 'true' || hasPersistentJsonStorage;
const shouldRequirePersistentStorage = !allowJsonStorage && (isProduction || isRailway);
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    })
  : hasPgEnvironment
  ? new Pool({
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    })
  : null;

function cleanEnvValue(value) {
  let result = String(value ?? '').trim();

  for (let i = 0; i < 2; i += 1) {
    const first = result[0];
    const last = result.at(-1);

    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
      result = result.slice(1, -1).trim();
    }
  }

  return result;
}

function resolveAuthSecret() {
  const secret = cleanEnvValue(process.env.JWT_SECRET || process.env.SESSION_SECRET || '');
  const weakSecrets = new Set([
    'change-me',
    'change-me-to-a-long-random-secret',
    'local-dev-secret-change-before-deploy',
  ]);

  if (!secret) {
    if (isProduction || isRailway) {
      throw new Error('JWT_SECRET must be set to a long random value in production.');
    }

    const devSecret = crypto.randomBytes(32).toString('base64url');
    console.warn('JWT_SECRET is not set. Using an ephemeral development secret; sessions will reset on restart.');
    return devSecret;
  }

  if (secret.length < 32 || weakSecrets.has(secret)) {
    if (isProduction || isRailway) {
      throw new Error('JWT_SECRET is too weak. Use at least 32 random characters.');
    }

    console.warn('JWT_SECRET is weak. Replace it with at least 32 random characters before deployment.');
  }

  return secret;
}

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function signToken(user) {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64Url(JSON.stringify({
    sub: String(user.id),
    email: String(user.email),
    iat: now,
    exp: now + sessionTtlSeconds,
    iss: 'legio-markets',
    aud: 'legio-web',
  }));
  const signature = crypto
    .createHmac('sha256', authSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  const parts = String(token || '').split('.');

  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;

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
    const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const exp = Number(session.exp);
    const now = Math.floor(Date.now() / 1000);

    if (decodedHeader.alg !== 'HS256' || decodedHeader.typ !== 'JWT') {
      return null;
    }

    if (
      typeof session.sub !== 'string'
      || !/^usr_[a-f0-9]{32}$/.test(session.sub)
      || !Number.isFinite(exp)
      || exp < now
      || session.iss !== 'legio-markets'
      || session.aud !== 'legio-web'
    ) {
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

function normalizeOrigin(origin) {
  const value = String(origin || '').trim();

  if (!value) return '';

  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

function parseCookies(header) {
  const cookies = {};

  for (const part of String(header || '').split(';')) {
    const [rawName, ...rawValue] = part.split('=');
    const name = rawName?.trim();

    if (!name || rawValue.length === 0) continue;

    const value = rawValue.join('=').trim();

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }

  return cookies;
}

function serializeSessionCookie(value, maxAgeSeconds) {
  const parts = [
    `${sessionCookieName}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (secureCookies) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', serializeSessionCookie(token, sessionTtlSeconds));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${serializeSessionCookie('', 0)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

function getRequestToken(req) {
  const cookies = parseCookies(req.get('cookie'));

  if (cookies[sessionCookieName]) {
    return cookies[sessionCookieName];
  }

  if (!allowBearerTokens) return '';

  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
}

function getExpectedOrigin(req) {
  if (configuredAppOrigin) return configuredAppOrigin;

  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0]?.trim();
  const protocol = forwardedProto || req.protocol;
  const host = req.get('host');

  return host ? normalizeOrigin(`${protocol}://${host}`) : '';
}

function isTrustedOrigin(req) {
  const origin = normalizeOrigin(req.get('origin') || '');

  if (!origin) {
    return !(isProduction || isRailway);
  }

  if (origin === configuredAppOrigin || configuredAllowedOrigins.has(origin)) {
    return true;
  }

  return origin === getExpectedOrigin(req);
}

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function createRateLimiter({ windowMs, max, key, message }) {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const identifier = key(req);
    const bucket = buckets.get(identifier);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(identifier, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (bucket.count >= max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ error: message });
      return;
    }

    bucket.count += 1;

    if (buckets.size > 10000) {
      for (const [bucketKey, current] of buckets) {
        if (current.resetAt <= now) {
          buckets.delete(bucketKey);
        }
      }
    }

    next();
  };
}

function validateId(value, prefix) {
  const id = String(value || '');
  const pattern = new RegExp(`^${prefix}_[a-f0-9]{32}$`);

  if (!pattern.test(id)) {
    throw validationError('Некорректный идентификатор.');
  }

  return id;
}

function validatePasswordForRegistration(password) {
  if (password.length < minPasswordLength) {
    throw validationError(`Пароль должен быть минимум ${minPasswordLength} символов.`);
  }

  if (password.length > maxPasswordLength) {
    throw validationError(`Пароль должен быть не длиннее ${maxPasswordLength} символов.`);
  }

  if (!/[a-zа-я]/iu.test(password) || !/[0-9]/.test(password)) {
    throw validationError('Пароль должен содержать буквы и цифры.');
  }
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isAdmin: Boolean(user.isAdmin ?? user.is_admin),
    balance: roundMoney(asNumber(user.balance ?? user.pointsBalance ?? user.points_balance, defaultStartingBalance)),
    createdAt: new Date(user.createdAt ?? user.created_at).toISOString(),
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

function clampPriceCents(value) {
  return Math.max(1, Math.min(99, value));
}

function roundPriceToTick(value, market) {
  const tickSize = Math.max(0.1, asNumber(market.tickSize, defaultTickSize));
  const price = Math.round(clampPriceCents(value) / tickSize) * tickSize;

  return roundMoney(clampPriceCents(price));
}

function roundDeltaToTick(value, market) {
  const tickSize = Math.max(0.1, asNumber(market.tickSize, defaultTickSize));

  return roundMoney(Math.min(12, Math.max(0, Math.round(value / tickSize) * tickSize)));
}

function getDisplayPrices(market) {
  const initialYes = clampPercent(market.initialProbability ?? 50);
  const initialNo = clampPercent(100 - initialYes);
  const yesPrice = roundPriceToTick(market.lastYesPrice ?? initialYes, market);
  const noPrice = roundPriceToTick(market.lastNoPrice ?? initialNo, market);

  return {
    yesPrice,
    noPrice,
    yesPercent: yesPrice,
    noPercent: noPrice,
  };
}

function getQuote({ market, outcome, side, yesPrice, noPrice }) {
  const liquidity = Math.max(100, asNumber(market.liquidity, defaultMarketLiquidity));
  const baseSpread = liquidity >= 5000 ? 2 : liquidity >= 2000 ? 3 : 4;
  const fairPrice = outcome === 'YES' ? yesPrice : noPrice;
  const price = side === 'BUY' ? fairPrice + baseSpread : fairPrice - baseSpread;

  return roundPriceToTick(price, market);
}

function calculateTrade({
  market,
  side,
  outcome,
  spendAmount,
  shareAmount,
  currentYesPrice,
  currentNoPrice,
  totalVolume,
}) {
  const quotedPrice = getQuote({
    market,
    outcome,
    side,
    yesPrice: currentYesPrice,
    noPrice: currentNoPrice,
  });
  const shares = side === 'BUY'
    ? spendAmount / (quotedPrice / 100)
    : shareAmount;
  const amount = side === 'BUY'
    ? spendAmount
    : shareAmount * (quotedPrice / 100);
  const liquidity = Math.max(100, asNumber(market.liquidity, defaultMarketLiquidity))
    + Math.sqrt(Math.max(0, totalVolume)) * 10;
  const impactBase = side === 'BUY' ? amount : shareAmount * quotedPrice / 100;
  const impact = roundDeltaToTick((impactBase / liquidity) * 80, market);
  const counterImpact = roundDeltaToTick(impact * 0.35, market);
  const direction = side === 'BUY' ? 1 : -1;
  const yesPriceAfterCents = roundPriceToTick(currentYesPrice + (
    outcome === 'YES' ? impact * direction : -counterImpact * direction
  ), market);
  const noPriceAfterCents = roundPriceToTick(currentNoPrice + (
    outcome === 'NO' ? impact * direction : -counterImpact * direction
  ), market);

  return {
    amount: roundMoney(amount),
    priceCents: quotedPrice,
    yesPriceAfterCents,
    noPriceAfterCents,
    shares,
  };
}

function inferNoPriceAfter(row) {
  if (!row) return null;

  const explicit = row.no_price_after_cents ?? row.noPriceAfterCents;

  if (explicit != null) return asNumber(explicit, 50);
  if (row.outcome === 'NO') return asNumber(row.price_cents ?? row.priceCents, 50);

  return null;
}

function normalizeMarket(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    category: row.category || 'Общее',
    resolutionSource: row.resolution_source || row.resolutionSource || '',
    resolutionRules: row.resolution_rules || row.resolutionRules || row.description || '',
    closeDate: row.close_date || row.closeDate,
    startDate: row.start_date || row.startDate || row.created_at || row.createdAt,
    status: row.status || 'open',
    yesPool: asNumber(row.yes_pool ?? row.yesPool),
    noPool: asNumber(row.no_pool ?? row.noPool),
    liquidity: asNumber(row.liquidity, defaultMarketLiquidity),
    initialProbability: clampPercent(asNumber(row.initial_probability ?? row.initialProbability, 50)),
    tickSize: asNumber(row.tick_size ?? row.tickSize, defaultTickSize),
    minOrderSize: asNumber(row.min_order_size ?? row.minOrderSize, defaultMinOrderSize),
    createdBy: row.created_by || row.createdBy,
    creatorName: row.creator_name || row.creatorName || null,
    createdAt: row.created_at || row.createdAt,
    tradeCount: asNumber(row.trade_count ?? row.tradeCount),
    lastYesPrice: row.last_yes_price == null && row.lastYesPrice == null
      ? null
      : asNumber(row.last_yes_price ?? row.lastYesPrice),
    lastNoPrice: row.last_no_price == null && row.lastNoPrice == null
      ? null
      : asNumber(row.last_no_price ?? row.lastNoPrice),
  };
}

function normalizeTrade(row) {
  const yesPriceAfterCents = asNumber(row.yes_price_after_cents ?? row.yesPriceAfterCents, 50);

  return {
    id: row.id,
    marketId: row.market_id || row.marketId,
    userId: row.user_id || row.userId,
    userName: row.user_name || row.userName || 'Пользователь',
    outcome: row.outcome,
    side: row.side || row.action || 'BUY',
    amount: roundMoney(asNumber(row.amount)),
    priceCents: asNumber(row.price_cents ?? row.priceCents),
    yesPriceAfterCents,
    noPriceAfterCents: inferNoPriceAfter(row),
    shares: roundMoney(asNumber(row.shares)),
    createdAt: row.created_at || row.createdAt,
  };
}

function adminUserDto(row) {
  return {
    ...publicUser(row),
    marketCount: asNumber(row.market_count ?? row.marketCount),
    tradeCount: asNumber(row.trade_count ?? row.tradeCount),
    positionCount: asNumber(row.position_count ?? row.positionCount),
  };
}

function adminTradeDto(row) {
  return {
    id: row.id,
    marketId: row.market_id || row.marketId,
    marketTitle: row.market_title || row.marketTitle || 'Рынок',
    userId: row.user_id || row.userId,
    userName: row.user_name || row.userName || 'Пользователь',
    outcome: row.outcome,
    side: row.side || 'BUY',
    amount: roundMoney(asNumber(row.amount)),
    priceCents: asNumber(row.price_cents ?? row.priceCents),
    shares: roundMoney(asNumber(row.shares)),
    createdAt: new Date(row.created_at || row.createdAt).toISOString(),
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
    side: trade.side,
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
    resolutionSource: market.resolutionSource,
    resolutionRules: market.resolutionRules,
    closeDate: new Date(market.closeDate).toISOString(),
    startDate: new Date(market.startDate || market.createdAt).toISOString(),
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
    liquidity: market.liquidity,
    initialProbability: market.initialProbability,
    tickSize: market.tickSize,
    minOrderSize: market.minOrderSize,
    ...prices,
    quotes: {
      YES: {
        bid: getQuote({ market, outcome: 'YES', side: 'SELL', yesPrice: prices.yesPrice, noPrice: prices.noPrice }),
        ask: getQuote({ market, outcome: 'YES', side: 'BUY', yesPrice: prices.yesPrice, noPrice: prices.noPrice }),
      },
      NO: {
        bid: getQuote({ market, outcome: 'NO', side: 'SELL', yesPrice: prices.yesPrice, noPrice: prices.noPrice }),
        ask: getQuote({ market, outcome: 'NO', side: 'BUY', yesPrice: prices.yesPrice, noPrice: prices.noPrice }),
      },
    },
    outcomes: [
      { name: 'Да', outcome: 'YES', percent: prices.yesPercent, priceCents: prices.yesPrice, pool: roundMoney(market.yesPool) },
      { name: 'Нет', outcome: 'NO', percent: prices.noPercent, priceCents: prices.noPrice, pool: roundMoney(market.noPool) },
    ],
    recentTrades,
    history,
    viewer: options.viewer || null,
  };
}

function buildHistory(market, trades) {
  let latestYes = clampPercent(market.initialProbability ?? 50);
  let latestNo = clampPercent(100 - latestYes);
  const points = [{
    time: new Date(market.createdAt).toISOString(),
    yesPercent: latestYes,
    noPercent: latestNo,
  }];

  for (const trade of trades) {
    latestYes = trade.yesPriceAfterCents;

    if (trade.noPriceAfterCents != null) {
      latestNo = trade.noPriceAfterCents;
    }

    points.push({
      time: new Date(trade.createdAt).toISOString(),
      yesPercent: latestYes,
      noPercent: latestNo,
    });
  }

  if (points.length === 1) {
    const prices = getDisplayPrices(market);

    points.push({
      time: new Date().toISOString(),
      yesPercent: prices.yesPercent,
      noPercent: prices.noPercent,
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
      is_admin boolean NOT NULL DEFAULT false,
      points_balance numeric NOT NULL DEFAULT 10000,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS markets (
      id text PRIMARY KEY,
      title text NOT NULL,
      description text NOT NULL DEFAULT '',
      category text NOT NULL DEFAULT 'Общее',
      resolution_source text NOT NULL DEFAULT '',
      resolution_rules text NOT NULL DEFAULT '',
      start_date timestamptz,
      close_date timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'open',
      yes_pool numeric NOT NULL DEFAULT 0,
      no_pool numeric NOT NULL DEFAULT 0,
      liquidity numeric NOT NULL DEFAULT 1000,
      initial_probability numeric NOT NULL DEFAULT 50,
      tick_size numeric NOT NULL DEFAULT 1,
      min_order_size numeric NOT NULL DEFAULT 1,
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
      side text NOT NULL DEFAULT 'BUY',
      amount numeric NOT NULL,
      price_cents numeric NOT NULL,
      yes_price_after_cents numeric NOT NULL DEFAULT 50,
      no_price_after_cents numeric,
      shares numeric NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS positions (
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
      outcome text NOT NULL CHECK (outcome IN ('YES', 'NO')),
      shares numeric NOT NULL DEFAULT 0,
      avg_price_cents numeric NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, market_id, outcome)
    );
  `);
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS points_balance numeric NOT NULL DEFAULT 10000;');
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS resolution_source text NOT NULL DEFAULT \'\';');
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS resolution_rules text NOT NULL DEFAULT \'\';');
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS start_date timestamptz;');
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS liquidity numeric NOT NULL DEFAULT 1000;');
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS initial_probability numeric NOT NULL DEFAULT 50;');
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS tick_size numeric NOT NULL DEFAULT 1;');
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS min_order_size numeric NOT NULL DEFAULT 1;');
  await pool.query('ALTER TABLE votes ADD COLUMN IF NOT EXISTS side text NOT NULL DEFAULT \'BUY\';');
  await pool.query('ALTER TABLE votes ADD COLUMN IF NOT EXISTS no_price_after_cents numeric;');
  await pool.query('CREATE INDEX IF NOT EXISTS markets_created_at_idx ON markets (created_at DESC);');
  await pool.query('CREATE INDEX IF NOT EXISTS votes_market_created_at_idx ON votes (market_id, created_at DESC);');
}

async function ensureJsonDb() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(jsonDbPath);
  } catch {
    await fs.writeFile(jsonDbPath, JSON.stringify({ users: [], markets: [], votes: [], positions: [] }, null, 2));
  }
}

async function readJsonDb() {
  await ensureJsonDb();
  const content = await fs.readFile(jsonDbPath, 'utf8');

  const db = JSON.parse(content);
  let changed = false;

  db.users ||= [];
  db.markets ||= [];
  db.votes ||= [];
  db.positions ||= [];

  for (const user of db.users) {
    if (typeof user.isAdmin !== 'boolean') {
      user.isAdmin = Boolean(user.is_admin);
      changed = true;
    }
  }

  if (changed) {
    await writeJsonDb(db);
  }

  return db;
}

async function writeJsonDb(db) {
  await fs.writeFile(jsonDbPath, JSON.stringify(db, null, 2));
}

async function initStorage() {
  if (pool) {
    await initPostgres();
    return;
  }

  if (shouldRequirePersistentStorage) {
    throw new Error(
      'Persistent database is required in production/Railway. Add Railway Postgres and expose DATABASE_URL, or attach a Railway Volume so RAILWAY_VOLUME_MOUNT_PATH is available.',
    );
  }

  if ((isProduction || isRailway) && !hasPersistentJsonStorage) {
    console.warn('Using JSON storage outside a persistent volume. Data can be lost after redeploys.');
  }

  await readJsonDb();
}

async function ensureConfiguredAdmin() {
  if (!bootstrapAdminEmail && !bootstrapAdminPassword) return;

  if (!bootstrapAdminEmail || !bootstrapAdminPassword) {
    throw new Error('Set both INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD, or remove both.');
  }

  if (!validateEmail(bootstrapAdminEmail)) {
    throw new Error('INITIAL_ADMIN_EMAIL must be a valid email address.');
  }

  validatePasswordForRegistration(bootstrapAdminPassword);

  await storage.ensureBootstrapAdmin({
    name: bootstrapAdminName.slice(0, 40),
    email: bootstrapAdminEmail,
    passwordHash: hashPassword(bootstrapAdminPassword),
  });

  console.log(`Configured admin account is enforced for ${bootstrapAdminEmail}`);
}

const storage = {
  async createUser({ name, email, passwordHash }) {
    const id = newId('usr');
    const createdAt = new Date().toISOString();

    if (pool) {
      try {
        const result = await pool.query(
          'INSERT INTO users (id, name, email, password_hash, is_admin, points_balance, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, email, is_admin, points_balance, created_at',
          [id, name, email, passwordHash, false, defaultStartingBalance, createdAt],
        );
        const user = result.rows[0];

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          isAdmin: user.is_admin,
          balance: user.points_balance,
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

    const user = {
      id,
      name,
      email,
      passwordHash,
      isAdmin: false,
      balance: defaultStartingBalance,
      createdAt,
    };
    db.users.push(user);
    await writeJsonDb(db);

    return user;
  },

  async ensureBootstrapAdmin({ name, email, passwordHash }) {
    const id = newId('usr');
    const createdAt = new Date().toISOString();

    if (pool) {
      await pool.query(
        `INSERT INTO users (id, name, email, password_hash, is_admin, points_balance, created_at)
         VALUES ($1, $2, $3, $4, true, $5, $6)
         ON CONFLICT (email)
         DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, is_admin = true`,
        [id, name, email, passwordHash, defaultStartingBalance, createdAt],
      );
      return;
    }

    const db = await readJsonDb();
    const user = db.users.find((item) => item.email === email);

    if (user) {
      user.name = name;
      user.passwordHash = passwordHash;
      user.isAdmin = true;
      user.balance = asNumber(user.balance, defaultStartingBalance);
    } else {
      db.users.push({
        id,
        name,
        email,
        passwordHash,
        isAdmin: true,
        balance: defaultStartingBalance,
        createdAt,
      });
    }

    await writeJsonDb(db);
  },

  async findUserByEmail(email) {
    if (pool) {
      const result = await pool.query('SELECT id, name, email, password_hash, is_admin, points_balance, created_at FROM users WHERE email = $1', [email]);
      const user = result.rows[0];

      return user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
            passwordHash: user.password_hash,
            isAdmin: user.is_admin,
            balance: user.points_balance,
            createdAt: user.created_at,
          }
        : null;
    }

    const db = await readJsonDb();
    return db.users.find((user) => user.email === email) || null;
  },

  async findUserById(id) {
    if (pool) {
      const result = await pool.query('SELECT id, name, email, is_admin, points_balance, created_at FROM users WHERE id = $1', [id]);
      const user = result.rows[0];

      return user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
            isAdmin: user.is_admin,
            balance: user.points_balance,
            createdAt: user.created_at,
          }
        : null;
    }

    const db = await readJsonDb();
    return db.users.find((user) => user.id === id) || null;
  },

  async listUsersForAdmin() {
    if (pool) {
      const result = await pool.query(`
        SELECT
          u.id,
          u.name,
          u.email,
          u.is_admin,
          u.points_balance,
          u.created_at,
          (
            SELECT COUNT(*)::int
            FROM markets m
            WHERE m.created_by = u.id
          ) AS market_count,
          (
            SELECT COUNT(*)::int
            FROM votes v
            WHERE v.user_id = u.id
          ) AS trade_count,
          (
            SELECT COUNT(*)::int
            FROM positions p
            WHERE p.user_id = u.id AND p.shares > 0
          ) AS position_count
        FROM users u
        ORDER BY u.created_at ASC
      `);

      return result.rows.map(adminUserDto);
    }

    const db = await readJsonDb();
    return [...db.users]
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      .map((user) => adminUserDto({
        ...user,
        marketCount: db.markets.filter((market) => market.createdBy === user.id).length,
        tradeCount: db.votes.filter((vote) => vote.userId === user.id).length,
        positionCount: db.positions.filter((position) => position.userId === user.id && asNumber(position.shares) > 0).length,
      }));
  },

  async setUserAdmin({ userId, isAdmin, actorUserId }) {
    if (!isAdmin && userId === actorUserId) {
      const selfError = new Error('CANNOT_DEMOTE_SELF');
      selfError.status = 409;
      throw selfError;
    }

    if (pool) {
      const targetResult = await pool.query('SELECT id, is_admin FROM users WHERE id = $1', [userId]);
      const target = targetResult.rows[0];

      if (!target) {
        const notFoundError = new Error('USER_NOT_FOUND');
        notFoundError.status = 404;
        throw notFoundError;
      }

      if (!isAdmin && target.is_admin) {
        const adminCountResult = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE is_admin = true');

        if (asNumber(adminCountResult.rows[0]?.count) <= 1) {
          const lastAdminError = new Error('LAST_ADMIN');
          lastAdminError.status = 409;
          throw lastAdminError;
        }
      }

      await pool.query('UPDATE users SET is_admin = $1 WHERE id = $2', [Boolean(isAdmin), userId]);
      const users = await this.listUsersForAdmin();

      return users.find((user) => user.id === userId);
    }

    const db = await readJsonDb();
    const user = db.users.find((item) => item.id === userId);

    if (!user) {
      const notFoundError = new Error('USER_NOT_FOUND');
      notFoundError.status = 404;
      throw notFoundError;
    }

    if (!isAdmin && user.isAdmin && db.users.filter((item) => item.isAdmin).length <= 1) {
      const lastAdminError = new Error('LAST_ADMIN');
      lastAdminError.status = 409;
      throw lastAdminError;
    }

    user.isAdmin = Boolean(isAdmin);
    await writeJsonDb(db);
    const users = await this.listUsersForAdmin();

    return users.find((item) => item.id === userId);
  },

  async updateUserBalance({ userId, balance }) {
    if (pool) {
      const result = await pool.query('UPDATE users SET points_balance = $1 WHERE id = $2 RETURNING id', [balance, userId]);

      if (result.rowCount === 0) {
        const notFoundError = new Error('USER_NOT_FOUND');
        notFoundError.status = 404;
        throw notFoundError;
      }

      const users = await this.listUsersForAdmin();
      return users.find((user) => user.id === userId);
    }

    const db = await readJsonDb();
    const user = db.users.find((item) => item.id === userId);

    if (!user) {
      const notFoundError = new Error('USER_NOT_FOUND');
      notFoundError.status = 404;
      throw notFoundError;
    }

    user.balance = balance;
    await writeJsonDb(db);
    const users = await this.listUsersForAdmin();

    return users.find((item) => item.id === userId);
  },

  async getAdminRecentTrades(limit = 12) {
    if (pool) {
      const result = await pool.query(`
        SELECT
          v.*,
          u.name AS user_name,
          m.title AS market_title
        FROM votes v
        LEFT JOIN users u ON u.id = v.user_id
        LEFT JOIN markets m ON m.id = v.market_id
        ORDER BY v.created_at DESC
        LIMIT $1
      `, [limit]);

      return result.rows.map(adminTradeDto);
    }

    const db = await readJsonDb();
    const usersById = new Map(db.users.map((user) => [user.id, user]));
    const marketsById = new Map(db.markets.map((market) => [market.id, market]));

    return [...db.votes]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, limit)
      .map((trade) => adminTradeDto({
        ...trade,
        userName: usersById.get(trade.userId)?.name || 'Пользователь',
        marketTitle: marketsById.get(trade.marketId)?.title || 'Рынок',
      }));
  },

  async getAdminOverview() {
    const [users, markets, recentTrades] = await Promise.all([
      this.listUsersForAdmin(),
      this.listMarkets(),
      this.getAdminRecentTrades(12),
    ]);
    const marketDtos = markets.map((market) => marketDto(market));
    const totalVolume = markets.reduce((sum, market) => sum + market.yesPool + market.noPool, 0);
    const totalBalances = users.reduce((sum, user) => sum + user.balance, 0);
    const totalLiquidity = markets.reduce((sum, market) => sum + market.liquidity, 0);

    return {
      stats: {
        userCount: users.length,
        adminCount: users.filter((user) => user.isAdmin).length,
        marketCount: markets.length,
        openMarketCount: markets.filter((market) => market.status === 'open').length,
        pausedMarketCount: markets.filter((market) => market.status === 'paused').length,
        resolvedMarketCount: markets.filter((market) => market.status === 'resolved').length,
        canceledMarketCount: markets.filter((market) => market.status === 'canceled').length,
        tradeCount: markets.reduce((sum, market) => sum + market.tradeCount, 0),
        totalVolume: roundMoney(totalVolume),
        totalBalances: roundMoney(totalBalances),
        averageLiquidity: markets.length ? roundMoney(totalLiquidity / markets.length) : 0,
        latestUserAt: users.at(-1)?.createdAt || null,
        latestMarketAt: marketDtos[0]?.createdAt || null,
      },
      users,
      markets: marketDtos,
      recentTrades,
    };
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
          ) AS last_yes_price,
          (
            SELECT COALESCE(latest.no_price_after_cents, latest.price_cents)
            FROM votes latest
            WHERE latest.market_id = m.id
              AND (latest.no_price_after_cents IS NOT NULL OR latest.outcome = 'NO')
            ORDER BY latest.created_at DESC
            LIMIT 1
          ) AS last_no_price
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
        lastNoPrice: (() => {
          const latest = [...db.votes]
            .filter((vote) => vote.marketId === market.id)
            .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];

          const latestNo = [...db.votes]
            .filter((vote) => vote.marketId === market.id && inferNoPriceAfter(vote) != null)
            .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];

          return latest ? inferNoPriceAfter(latest) ?? inferNoPriceAfter(latestNo) : null;
        })(),
        creatorName: db.users.find((user) => user.id === market.createdBy)?.name || null,
      }));
  },

  async createMarket({
    title,
    description,
    category,
    resolutionSource,
    resolutionRules,
    startDate,
    closeDate,
    liquidity,
    initialProbability,
    tickSize,
    minOrderSize,
    createdBy,
  }) {
    const id = newId('mkt');
    const createdAt = new Date().toISOString();
    const market = {
      id,
      title,
      description,
      category,
      resolutionSource,
      resolutionRules,
      startDate: new Date(startDate || createdAt).toISOString(),
      closeDate: new Date(closeDate).toISOString(),
      status: 'open',
      yesPool: 0,
      noPool: 0,
      liquidity,
      initialProbability,
      tickSize,
      minOrderSize,
      createdBy,
      createdAt,
      tradeCount: 0,
    };

    if (pool) {
      const result = await pool.query(
        `INSERT INTO markets (
          id, title, description, category, resolution_source, resolution_rules, start_date, close_date,
          status, yes_pool, no_pool, liquidity, initial_probability, tick_size, min_order_size, created_by, created_at
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', 0, 0, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          id,
          title,
          description,
          category,
          resolutionSource,
          resolutionRules,
          market.startDate,
          market.closeDate,
          liquidity,
          initialProbability,
          tickSize,
          minOrderSize,
          createdBy,
          createdAt,
        ],
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
          ) AS last_yes_price,
          (
            SELECT COALESCE(latest.no_price_after_cents, latest.price_cents)
            FROM votes latest
            WHERE latest.market_id = m.id
              AND (latest.no_price_after_cents IS NOT NULL OR latest.outcome = 'NO')
            ORDER BY latest.created_at DESC
            LIMIT 1
          ) AS last_no_price
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
      lastNoPrice: (() => {
        const latest = [...db.votes]
          .filter((vote) => vote.marketId === id)
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];

        const latestNo = [...db.votes]
          .filter((vote) => vote.marketId === id && inferNoPriceAfter(vote) != null)
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];

        return latest ? inferNoPriceAfter(latest) ?? inferNoPriceAfter(latestNo) : null;
      })(),
      creatorName: db.users.find((user) => user.id === market.createdBy)?.name || null,
    });
  },

  async updateMarketStatus({ marketId, status }) {
    if (pool) {
      const result = await pool.query('UPDATE markets SET status = $1 WHERE id = $2 RETURNING id', [status, marketId]);

      if (result.rowCount === 0) {
        const notFoundError = new Error('MARKET_NOT_FOUND');
        notFoundError.status = 404;
        throw notFoundError;
      }

      return this.getMarket(marketId);
    }

    const db = await readJsonDb();
    const market = db.markets.find((item) => item.id === marketId);

    if (!market) {
      const notFoundError = new Error('MARKET_NOT_FOUND');
      notFoundError.status = 404;
      throw notFoundError;
    }

    market.status = status;
    await writeJsonDb(db);

    return this.getMarket(marketId);
  },

  async deleteMarket(marketId) {
    if (pool) {
      const result = await pool.query('DELETE FROM markets WHERE id = $1 RETURNING id', [marketId]);

      if (result.rowCount === 0) {
        const notFoundError = new Error('MARKET_NOT_FOUND');
        notFoundError.status = 404;
        throw notFoundError;
      }

      return;
    }

    const db = await readJsonDb();
    const marketIndex = db.markets.findIndex((item) => item.id === marketId);

    if (marketIndex === -1) {
      const notFoundError = new Error('MARKET_NOT_FOUND');
      notFoundError.status = 404;
      throw notFoundError;
    }

    db.markets.splice(marketIndex, 1);
    db.votes = db.votes.filter((vote) => vote.marketId !== marketId);
    db.positions = db.positions.filter((position) => position.marketId !== marketId);
    await writeJsonDb(db);
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

  async getViewerState(marketId, userId) {
    if (!userId) return null;

    if (pool) {
      const [userResult, positionsResult] = await Promise.all([
        pool.query('SELECT points_balance FROM users WHERE id = $1', [userId]),
        pool.query('SELECT outcome, shares, avg_price_cents FROM positions WHERE user_id = $1 AND market_id = $2', [userId, marketId]),
      ]);
      const positions = { YES: { shares: 0, avgPriceCents: 0 }, NO: { shares: 0, avgPriceCents: 0 } };

      for (const row of positionsResult.rows) {
        positions[row.outcome] = {
          shares: roundMoney(asNumber(row.shares)),
          avgPriceCents: asNumber(row.avg_price_cents),
        };
      }

      return {
        balance: roundMoney(asNumber(userResult.rows[0]?.points_balance, defaultStartingBalance)),
        positions,
      };
    }

    const db = await readJsonDb();
    const user = db.users.find((item) => item.id === userId);
    const positions = { YES: { shares: 0, avgPriceCents: 0 }, NO: { shares: 0, avgPriceCents: 0 } };

    for (const row of db.positions.filter((position) => position.userId === userId && position.marketId === marketId)) {
      positions[row.outcome] = {
        shares: roundMoney(asNumber(row.shares)),
        avgPriceCents: asNumber(row.avgPriceCents),
      };
    }

    return {
      balance: roundMoney(asNumber(user?.balance, defaultStartingBalance)),
      positions,
    };
  },

  async placeTrade({ marketId, userId, outcome, side, amount }) {
    const createdAt = new Date().toISOString();
    const id = newId('trd');

    if (pool) {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        const [marketResult, userResult, positionResult] = await Promise.all([
          client.query('SELECT * FROM markets WHERE id = $1 FOR UPDATE', [marketId]),
          client.query('SELECT points_balance FROM users WHERE id = $1 FOR UPDATE', [userId]),
          client.query('SELECT shares, avg_price_cents FROM positions WHERE user_id = $1 AND market_id = $2 AND outcome = $3 FOR UPDATE', [userId, marketId, outcome]),
        ]);
        const row = marketResult.rows[0];
        const userRow = userResult.rows[0];

        if (!row) {
          const notFoundError = new Error('MARKET_NOT_FOUND');
          notFoundError.status = 404;
          throw notFoundError;
        }

        if (!userRow) {
          const notFoundError = new Error('USER_NOT_FOUND');
          notFoundError.status = 404;
          throw notFoundError;
        }

        const market = normalizeMarket(row);
        assertMarketIsOpen(market);
        const existingPosition = positionResult.rows[0] || { shares: 0, avg_price_cents: 0 };
        const currentShares = asNumber(existingPosition.shares);
        const currentAvgPrice = asNumber(existingPosition.avg_price_cents);
        const userBalance = asNumber(userRow.points_balance, defaultStartingBalance);

        const latestTradeResult = await client.query(
          'SELECT outcome, price_cents, yes_price_after_cents, no_price_after_cents FROM votes WHERE market_id = $1 ORDER BY created_at DESC LIMIT 1',
          [marketId],
        );
        const latestNoTradeResult = await client.query(
          `SELECT outcome, price_cents, yes_price_after_cents, no_price_after_cents
           FROM votes
           WHERE market_id = $1 AND (no_price_after_cents IS NOT NULL OR outcome = 'NO')
           ORDER BY created_at DESC
           LIMIT 1`,
          [marketId],
        );
        const currentYesPrice = roundPriceToTick(
          asNumber(latestTradeResult.rows[0]?.yes_price_after_cents, market.initialProbability),
          market,
        );
        const latestNoPrice = inferNoPriceAfter(latestTradeResult.rows[0]) ?? inferNoPriceAfter(latestNoTradeResult.rows[0]);
        const currentNoPrice = latestNoPrice != null
          ? roundPriceToTick(latestNoPrice, market)
          : roundPriceToTick(100 - market.initialProbability, market);
        const spendAmount = side === 'BUY' ? amount : 0;
        const shareAmount = side === 'SELL' ? amount : 0;

        if (side === 'SELL' && currentShares + 0.000001 < shareAmount) {
          const positionError = new Error('INSUFFICIENT_POSITION');
          positionError.status = 409;
          throw positionError;
        }

        const { amount: tradeAmount, priceCents, shares, yesPriceAfterCents, noPriceAfterCents } = calculateTrade({
          market,
          side,
          spendAmount,
          shareAmount,
          currentYesPrice,
          currentNoPrice,
          outcome,
          totalVolume: market.yesPool + market.noPool,
        });

        if (tradeAmount < market.minOrderSize) {
          const sizeError = new Error('ORDER_TOO_SMALL');
          sizeError.status = 400;
          throw sizeError;
        }

        if (side === 'BUY' && userBalance + 0.000001 < tradeAmount) {
          const balanceError = new Error('INSUFFICIENT_BALANCE');
          balanceError.status = 409;
          throw balanceError;
        }

        const yesPool = outcome === 'YES' ? market.yesPool + tradeAmount : market.yesPool;
        const noPool = outcome === 'NO' ? market.noPool + tradeAmount : market.noPool;
        const nextBalance = side === 'BUY'
          ? userBalance - tradeAmount
          : userBalance + tradeAmount;
        const nextShares = side === 'BUY'
          ? currentShares + shares
          : currentShares - shares;
        const nextAvgPrice = side === 'BUY' && nextShares > 0
          ? ((currentShares * currentAvgPrice) + (shares * priceCents)) / nextShares
          : currentAvgPrice;

        await client.query(
          `INSERT INTO votes (id, market_id, user_id, outcome, side, amount, price_cents, yes_price_after_cents, no_price_after_cents, shares, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [id, marketId, userId, outcome, side, tradeAmount, priceCents, yesPriceAfterCents, noPriceAfterCents, shares, createdAt],
        );
        await client.query('UPDATE users SET points_balance = $1 WHERE id = $2', [roundMoney(nextBalance), userId]);
        await client.query(
          `INSERT INTO positions (user_id, market_id, outcome, shares, avg_price_cents, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, market_id, outcome)
           DO UPDATE SET shares = EXCLUDED.shares, avg_price_cents = EXCLUDED.avg_price_cents, updated_at = EXCLUDED.updated_at`,
          [userId, marketId, outcome, roundMoney(nextShares), nextAvgPrice, createdAt],
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
    const user = db.users.find((item) => item.id === userId);

    if (!market) {
      const notFoundError = new Error('MARKET_NOT_FOUND');
      notFoundError.status = 404;
      throw notFoundError;
    }

    if (!user) {
      const notFoundError = new Error('USER_NOT_FOUND');
      notFoundError.status = 404;
      throw notFoundError;
    }

    const normalizedMarket = normalizeMarket(market);
    assertMarketIsOpen(normalizedMarket);
    user.balance = asNumber(user.balance, defaultStartingBalance);
    const position = db.positions.find((item) => item.userId === userId && item.marketId === marketId && item.outcome === outcome)
      || {
        userId,
        marketId,
        outcome,
        shares: 0,
        avgPriceCents: 0,
      };

    const latestTrade = [...db.votes]
      .filter((vote) => vote.marketId === marketId)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
    const latestNoTrade = [...db.votes]
      .filter((vote) => vote.marketId === marketId && inferNoPriceAfter(vote) != null)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
    const currentYesPrice = roundPriceToTick(
      asNumber(latestTrade?.yesPriceAfterCents, normalizedMarket.initialProbability),
      normalizedMarket,
    );
    const latestNoPrice = inferNoPriceAfter(latestTrade) ?? inferNoPriceAfter(latestNoTrade);
    const currentNoPrice = latestNoPrice != null
      ? roundPriceToTick(latestNoPrice, normalizedMarket)
      : roundPriceToTick(100 - normalizedMarket.initialProbability, normalizedMarket);
    const spendAmount = side === 'BUY' ? amount : 0;
    const shareAmount = side === 'SELL' ? amount : 0;

    if (side === 'SELL' && asNumber(position.shares) + 0.000001 < shareAmount) {
      const positionError = new Error('INSUFFICIENT_POSITION');
      positionError.status = 409;
      throw positionError;
    }

    const { amount: tradeAmount, priceCents, shares, yesPriceAfterCents, noPriceAfterCents } = calculateTrade({
      market: normalizedMarket,
      side,
      spendAmount,
      shareAmount,
      currentYesPrice,
      currentNoPrice,
      outcome,
      totalVolume: normalizedMarket.yesPool + normalizedMarket.noPool,
    });

    if (tradeAmount < normalizedMarket.minOrderSize) {
      const sizeError = new Error('ORDER_TOO_SMALL');
      sizeError.status = 400;
      throw sizeError;
    }

    if (side === 'BUY' && user.balance + 0.000001 < tradeAmount) {
      const balanceError = new Error('INSUFFICIENT_BALANCE');
      balanceError.status = 409;
      throw balanceError;
    }

    if (outcome === 'YES') {
      market.yesPool = roundMoney(asNumber(market.yesPool) + tradeAmount);
    } else {
      market.noPool = roundMoney(asNumber(market.noPool) + tradeAmount);
    }

    user.balance = roundMoney(side === 'BUY' ? user.balance - tradeAmount : user.balance + tradeAmount);
    const previousShares = asNumber(position.shares);
    const previousAvgPrice = asNumber(position.avgPriceCents);
    position.shares = roundMoney(side === 'BUY' ? previousShares + shares : previousShares - shares);
    position.avgPriceCents = side === 'BUY' && position.shares > 0
      ? ((previousShares * previousAvgPrice) + (shares * priceCents)) / position.shares
      : previousAvgPrice;
    position.updatedAt = createdAt;

    if (!db.positions.some((item) => item.userId === userId && item.marketId === marketId && item.outcome === outcome)) {
      db.positions.push(position);
    }

    db.votes.push({
      id,
      marketId,
      userId,
      outcome,
      side,
      amount: tradeAmount,
      priceCents,
      yesPriceAfterCents,
      noPriceAfterCents,
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
  const resolutionSource = String(body.resolutionSource || '').trim();
  const resolutionRules = String(body.resolutionRules || description || '').trim();
  const startDate = body.startDate ? new Date(body.startDate) : new Date();
  const closeDate = new Date(body.closeDate);
  const liquidity = Math.round(asNumber(body.liquidity, defaultMarketLiquidity));
  const initialProbability = clampPercent(asNumber(body.initialProbability, 50));
  const tickSize = asNumber(body.tickSize, defaultTickSize);
  const minOrderSize = asNumber(body.minOrderSize, defaultMinOrderSize);

  if (title.length < 12 || title.length > 180) {
    throw validationError('Вопрос должен быть от 12 до 180 символов.');
  }

  if (!title.endsWith('?')) {
    throw validationError('Вопрос должен заканчиваться знаком вопроса.');
  }

  if (description.length > 2000) {
    throw validationError('Описание не должно быть длиннее 2000 символов.');
  }

  if (category.length < 2 || category.length > 48) {
    throw validationError('Категория должна быть от 2 до 48 символов.');
  }

  if (resolutionSource.length < 4 || resolutionSource.length > 300) {
    throw validationError('Укажи публичный источник резолюции.');
  }

  if (resolutionRules.length < 40 || resolutionRules.length > 2500) {
    throw validationError('Правила резолюции должны быть от 40 до 2500 символов.');
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const startDateDay = new Date(startDate);
  startDateDay.setHours(0, 0, 0, 0);

  if (Number.isNaN(startDate.getTime()) || startDateDay.getTime() < todayStart.getTime()) {
    throw validationError('Дата запуска не может быть раньше сегодняшнего дня.');
  }

  if (Number.isNaN(closeDate.getTime()) || closeDate.getTime() <= startDate.getTime() + 60 * 60 * 1000) {
    throw validationError('Завершение должно быть минимум через час после запуска.');
  }

  if (liquidity < 100 || liquidity > 100000) {
    throw validationError('Виртуальная ликвидность должна быть от 100 до 100 000.');
  }

  if (![1, 0.5, 0.1].includes(tickSize)) {
    throw validationError('Tick size должен быть 1, 0.5 или 0.1 цента.');
  }

  if (minOrderSize < 1 || minOrderSize > 1000) {
    throw validationError('Минимальный размер сделки должен быть от 1 до 1000 очков.');
  }

  return {
    title,
    description,
    category,
    resolutionSource,
    resolutionRules,
    startDate: startDate.toISOString(),
    closeDate: closeDate.toISOString(),
    liquidity,
    initialProbability,
    tickSize,
    minOrderSize,
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
  const token = getRequestToken(req);
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

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: 'Только администраторы могут выполнять это действие.' });
    return;
  }

  next();
}

async function optionalAuth(req, res, next) {
  const token = getRequestToken(req);
  const session = token ? verifyToken(token) : null;

  if (!session) {
    next();
    return;
  }

  const user = await storage.findUserById(session.sub);

  if (user) {
    req.user = publicUser(user);
  }

  next();
}

async function marketDetailResponse(id, viewerUserId = null) {
  const market = await storage.getMarket(id);

  if (!market) return null;

  const [recentTrades, latestHistoryTrades, viewer] = await Promise.all([
    storage.getTrades(id, 'desc', 8),
    storage.getTrades(id, 'desc', 80),
    storage.getViewerState(id, viewerUserId),
  ]);
  const historyTrades = [...latestHistoryTrades].reverse();

  return marketDto(market, { recentTrades, historyTrades, viewer });
}

const app = express();
const authIpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 40,
  key: (req) => `auth-ip:${getClientIp(req)}`,
  message: 'Слишком много попыток входа. Попробуй позже.',
});
const loginAccountLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  key: (req) => `login-account:${getClientIp(req)}:${normalizeEmail(req.body?.email)}`,
  message: 'Слишком много попыток для этого аккаунта. Попробуй позже.',
});
const writeLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  key: (req) => `write:${getClientIp(req)}`,
  message: 'Слишком много запросов. Попробуй через минуту.',
});
const adminLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  key: (req) => `admin:${req.user?.id || getClientIp(req)}`,
  message: 'Слишком много админских действий. Попробуй через минуту.',
});
const tradeLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  key: (req) => `trade:${req.user?.id || getClientIp(req)}`,
  message: 'Слишком много сделок. Попробуй через минуту.',
});

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  if (isProduction || isRailway) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob:",
        "connect-src 'self'",
      ].join('; '),
    );
  }

  next();
});
app.use((req, res, next) => {
  if (!unsafeMethods.has(req.method) || isTrustedOrigin(req)) {
    next();
    return;
  }

  res.status(403).json({ error: 'Запрос отклонён защитой от подделки.' });
});
app.use((req, res, next) => {
  if (!unsafeMethods.has(req.method)) {
    next();
    return;
  }

  writeLimiter(req, res, next);
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    ...(isProduction || isRailway ? {} : { storage: pool ? 'postgres' : 'json' }),
    now: new Date().toISOString(),
  });
});

app.post('/api/auth/register', authIpLimiter, asyncRoute(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (name.length < 2 || name.length > 40) {
    throw validationError('Имя должно быть от 2 до 40 символов.');
  }

  if (!validateEmail(email) || email.length > 254) {
    throw validationError('Укажи корректный email.');
  }

  validatePasswordForRegistration(password);

  const user = await storage.createUser({ name, email, passwordHash: hashPassword(password) });
  const publicProfile = publicUser(user);
  const token = signToken(publicProfile);

  setSessionCookie(res, token);

  res.status(201).json({
    user: publicProfile,
  });
}));

app.post('/api/auth/login', authIpLimiter, loginAccountLimiter, asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!validateEmail(email) || password.length === 0 || password.length > maxPasswordLength) {
    res.status(401).json({ error: 'Неверный email или пароль.' });
    return;
  }

  const user = await storage.findUserByEmail(email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'Неверный email или пароль.' });
    return;
  }

  const publicProfile = publicUser(user);
  const token = signToken(publicProfile);

  setSessionCookie(res, token);

  res.json({
    user: publicProfile,
  });
}));

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/admin/overview', requireAuth, requireAdmin, adminLimiter, asyncRoute(async (req, res) => {
  const overview = await storage.getAdminOverview();

  res.json(overview);
}));

app.patch('/api/admin/users/:id/admin', requireAuth, requireAdmin, adminLimiter, asyncRoute(async (req, res) => {
  const userId = validateId(req.params.id, 'usr');
  const user = await storage.setUserAdmin({
    userId,
    isAdmin: req.body.isAdmin === true,
    actorUserId: req.user.id,
  });

  res.json({ user });
}));

app.patch('/api/admin/users/:id/balance', requireAuth, requireAdmin, adminLimiter, asyncRoute(async (req, res) => {
  const userId = validateId(req.params.id, 'usr');
  const balance = roundMoney(Number(req.body.balance));

  if (!Number.isFinite(balance) || balance < 0 || balance > 1_000_000) {
    throw validationError('Баланс должен быть от 0 до 1 000 000 очков.');
  }

  const user = await storage.updateUserBalance({
    userId,
    balance,
  });

  res.json({ user });
}));

app.patch('/api/admin/markets/:id/status', requireAuth, requireAdmin, adminLimiter, asyncRoute(async (req, res) => {
  const marketId = validateId(req.params.id, 'mkt');
  const status = String(req.body.status || '').trim();

  if (!marketStatuses.has(status)) {
    throw validationError('Недопустимый статус рынка.');
  }

  const market = await storage.updateMarketStatus({
    marketId,
    status,
  });

  res.json({ market: marketDto(market) });
}));

app.delete('/api/admin/markets/:id', requireAuth, requireAdmin, adminLimiter, asyncRoute(async (req, res) => {
  const marketId = validateId(req.params.id, 'mkt');

  await storage.deleteMarket(marketId);

  res.status(204).end();
}));

app.get(['/api/markets', '/api/posts'], asyncRoute(async (req, res) => {
  const markets = await storage.listMarkets();

  res.json({ markets: markets.map((market) => marketDto(market)) });
}));

app.post(['/api/markets', '/api/posts'], requireAuth, requireAdmin, adminLimiter, asyncRoute(async (req, res) => {
  const input = parseMarketInput(req.body);
  const market = await storage.createMarket({ ...input, createdBy: req.user.id });
  const detail = await marketDetailResponse(market.id, req.user.id);

  res.status(201).json({ market: detail });
}));

app.get(['/api/markets/:id', '/api/posts/:id'], optionalAuth, asyncRoute(async (req, res) => {
  const marketId = validateId(req.params.id, 'mkt');
  const market = await marketDetailResponse(marketId, req.user?.id);

  if (!market) {
    res.status(404).json({ error: 'Рынок не найден.' });
    return;
  }

  res.json({ market });
}));

app.post(['/api/markets/:id/trades', '/api/markets/:id/votes', '/api/posts/:id/votes'], requireAuth, tradeLimiter, asyncRoute(async (req, res) => {
  const marketId = validateId(req.params.id, 'mkt');
  const outcome = String(req.body.outcome || '').toUpperCase();
  const side = String(req.body.side || 'BUY').toUpperCase();
  const amount = roundMoney(Number(req.body.amount));

  if (outcome !== 'YES' && outcome !== 'NO') {
    throw validationError('Выбери Да или Нет.');
  }

  if (side !== 'BUY' && side !== 'SELL') {
    throw validationError('Выбери покупку или продажу.');
  }

  if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
    throw validationError(side === 'BUY' ? 'Сумма должна быть от 1 до 10 000 очков.' : 'Количество долей должно быть от 1 до 10 000.');
  }

  await storage.placeTrade({
    marketId,
    userId: req.user.id,
    outcome,
    side,
    amount,
  });

  const market = await marketDetailResponse(marketId, req.user.id);
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
    USER_NOT_FOUND: 'Пользователь не найден.',
    LAST_ADMIN: 'Нельзя снять права у последнего администратора.',
    CANNOT_DEMOTE_SELF: 'Нельзя снять права администратора с самого себя.',
    INSUFFICIENT_BALANCE: 'Недостаточно очков на балансе.',
    INSUFFICIENT_POSITION: 'Недостаточно долей для продажи.',
    ORDER_TOO_SMALL: 'Сделка меньше минимального размера рынка.',
  };

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    error: status >= 500
      ? 'Что-то пошло не так.'
      : messageByCode[error.message] || error.message || 'Что-то пошло не так.',
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
await ensureConfiguredAdmin();
await attachFrontend();

app.listen(port, '0.0.0.0', () => {
  const storageName = pool ? 'Postgres' : `JSON at ${jsonDbPath}`;
  console.log(`Legio server running on http://localhost:${port} with ${storageName} storage`);
});
