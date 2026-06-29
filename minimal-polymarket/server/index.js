import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import express from 'express';
import pg from 'pg';

import * as lmsr from './lib/lmsr.js';
import * as priceHistory from './lib/priceHistory.js';

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
const devSessionSecretPath = path.join(dataDir, 'dev-session-secret');
const isProduction = process.env.NODE_ENV === 'production';
const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);
const port = Number(process.env.PORT || 3000);
const defaultSessionTtlSeconds = 60 * 60 * 24;
const rememberedSessionTtlSeconds = 60 * 60 * 24 * 30;
const sessionCookieName = 'legio_session';
const secureCookies = (isProduction || isRailway) && process.env.COOKIE_SECURE !== 'false';
const allowBearerTokens = process.env.ALLOW_BEARER_TOKENS === 'true';
const minPasswordLength = 12;
const maxPasswordLength = 128;
const defaultStartingBalance = 10000;
const defaultMarketLiquidity = 1000;
const defaultMinOrderSize = 1;
const defaultTickSize = 1;
const defaultFeeBps = Math.max(0, Math.min(2000, asNumber(cleanEnvValue(process.env.TRADE_FEE_BPS), 0)));
const houseAccount = 'house';
const houseFeesAccount = 'house:fees';
const marketStatuses = new Set(['open', 'paused', 'resolved', 'canceled']);
// Statuses an admin may set via the plain status endpoint. Resolution and
// cancellation have dedicated endpoints because they move money.
const settableStatuses = new Set(['open', 'paused']);
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

    try {
      const devSecret = cleanEnvValue(fsSync.readFileSync(devSessionSecretPath, 'utf8'));

      if (devSecret.length >= 32 && !weakSecrets.has(devSecret)) {
        console.warn('JWT_SECRET is not set. Using persistent development secret from server/data/dev-session-secret.');
        return devSecret;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`Could not read development session secret: ${error.message}`);
      }
    }

    const devSecret = crypto.randomBytes(32).toString('base64url');

    try {
      fsSync.mkdirSync(dataDir, { recursive: true });
      fsSync.writeFileSync(devSessionSecretPath, `${devSecret}\n`, { mode: 0o600 });
      console.warn('JWT_SECRET is not set. Created persistent development secret at server/data/dev-session-secret.');
    } catch (error) {
      console.warn(`JWT_SECRET is not set. Using an ephemeral development secret; sessions will reset on restart. ${error.message}`);
    }

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

function signToken(user, ttlSeconds = defaultSessionTtlSeconds) {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(60, Math.floor(Number(ttlSeconds) || defaultSessionTtlSeconds));
  const payload = base64Url(JSON.stringify({
    sub: String(user.id),
    email: String(user.email),
    iat: now,
    exp: now + ttl,
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
  ];

  if (Number.isFinite(maxAgeSeconds)) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  }

  if (secureCookies) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function setSessionCookie(res, token, maxAgeSeconds) {
  res.setHeader('Set-Cookie', serializeSessionCookie(token, maxAgeSeconds));
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

// Postgres jsonb arrives as a parsed value or a string; JSON storage keeps the
// value as-is. Normalise both to a JS value (or null).
function parseJsonField(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value;
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

// --- LMSR economic engine ----------------------------------------------------
//
// The authoritative market state is (qYes, qNo, b). Prices are derived from it
// via softmax, so YES + NO always equals 100. The old per-trade "last price"
// columns are no longer the source of truth (they are kept only for chart
// history). See server/lib/lmsr.js for the math.

function marketLmsrState(market) {
  const b = Math.max(1, asNumber(market.bParam, lmsr.bFromLiquidity(asNumber(market.liquidity, defaultMarketLiquidity))));
  // Backfill seed for legacy markets that predate the LMSR columns.
  if (market.bParam == null && (market.qYes == null || market.qNo == null)) {
    const seeded = lmsr.seedQ(clampPercent(asNumber(market.initialProbability, 50)) / 100, b);
    return { qYes: seeded.qYes, qNo: seeded.qNo, b };
  }

  return { qYes: asNumber(market.qYes, 0), qNo: asNumber(market.qNo, 0), b };
}

function isMultiMarket(market) {
  return market.marketType === 'multi' && Array.isArray(market.outcomesDef) && market.outcomesDef.length >= 2;
}

// Each outcome is an INDEPENDENT binary YES/NO sub-market with its own
// (qYes, qNo) and a shared b. Migrates legacy markets that still store the old
// coupled-softmax qVec by reseeding independent books at the same prices.
function marketMultiState(market) {
  const outcomes = market.outcomesDef || [];
  const b = Math.max(1, asNumber(market.bParam, lmsr.bFromLiquidity(asNumber(market.liquidity, defaultMarketLiquidity))));
  let states = Array.isArray(market.outcomeStates)
    ? market.outcomeStates.map((s) => ({ qYes: asNumber(s.qYes), qNo: asNumber(s.qNo) }))
    : null;

  if (!states || states.length !== outcomes.length) {
    let probs;
    if (Array.isArray(market.qVec) && market.qVec.length === outcomes.length) {
      probs = lmsr.priceVec(market.qVec.map((x) => asNumber(x)), b); // legacy softmax → current prices
    } else {
      const fallback = 1 / Math.max(1, outcomes.length);
      probs = outcomes.map((o) => clampPercent(asNumber(o.initialProbability, fallback * 100)) / 100);
    }
    states = lmsr.seedOutcomeStates(probs, b);
  }

  return { outcomes, b, states };
}

// Pure multi-outcome fill (categorical market). `outcome` is an outcome id.
// Buying it buys YES of THAT sub-market only — no other line is touched.
function calculateMultiFill({ market, side, outcome, amount }) {
  const { outcomes, b, states } = marketMultiState(market);
  const i = outcomes.findIndex((o) => o.id === outcome);

  if (i < 0) throw tradeError('INVALID_OUTCOME', 400);

  const sub = states[i];
  const feeRate = Math.max(0, asNumber(market.feeBps, defaultFeeBps)) / 10000;
  let shares;
  let ammPoints;
  let fee;
  let cashDelta;
  let direction;

  if (side === 'BUY') {
    const ammSpend = amount / (1 + feeRate);
    shares = lmsr.sharesForSpend('YES', ammSpend, sub.qYes, sub.qNo, b);
    ammPoints = ammSpend;
    fee = amount - ammSpend;
    cashDelta = -amount;
    direction = 1;
  } else {
    shares = amount;
    const proceeds = lmsr.proceedsForSell('YES', shares, sub.qYes, sub.qNo, b);
    fee = proceeds * feeRate;
    ammPoints = proceeds;
    cashDelta = proceeds - fee;
    direction = -1;
  }

  const statesAfter = lmsr.applyYesShares(states, i, direction * shares);
  const pricesAfter = lmsr.displayedPriceMulti(statesAfter, b).map((p) => roundMoney(clampPriceCents(p * 100)));
  const avgPriceCents = shares > 0 ? roundMoney((ammPoints / shares) * 100) : 0;

  return {
    multi: true,
    outcomeIndex: i,
    shares: roundMoney(shares),
    ammPoints: roundMoney(ammPoints),
    fee: roundMoney(fee),
    cashDelta: roundMoney(cashDelta),
    avgPriceCents,
    priceCents: avgPriceCents,
    statesAfter,
    pricesAfter, // displayed (normalized) prices aligned to outcomesDef, in cents
    toWin: roundMoney(shares),
  };
}

function getDisplayPrices(market) {
  const { qYes, qNo, b } = marketLmsrState(market);
  const yesPrice = roundPriceToTick(lmsr.priceYes(qYes, qNo, b) * 100, market);
  const noPrice = roundMoney(clampPriceCents(100 - yesPrice));

  return {
    yesPrice,
    noPrice,
    yesPercent: yesPrice,
    noPercent: noPrice,
  };
}

// Marginal price of an outcome, rounded for the quotes block. LMSR has no
// explicit bid/ask spread — slippage lives in trade size — so bid == ask here.
function getQuote({ market, outcome }) {
  const { qYes, qNo, b } = marketLmsrState(market);
  const price = lmsr.priceOf(outcome, qYes, qNo, b) * 100;

  return roundPriceToTick(price, market);
}

// Pure trade calculation shared by quoting and execution. Given the market
// state, a side (BUY/SELL), an outcome, and `amount` (points to spend on BUY,
// shares to sell on SELL), it returns the exact fill plus the balanced ledger
// legs (which always sum to zero).
function calculateFill({ market, side, outcome, amount }) {
  if (isMultiMarket(market)) return calculateMultiFill({ market, side, outcome, amount });

  if (outcome !== 'YES' && outcome !== 'NO') throw tradeError('INVALID_OUTCOME', 400);

  const { qYes, qNo, b } = marketLmsrState(market);
  const feeRate = Math.max(0, asNumber(market.feeBps, defaultFeeBps)) / 10000;

  let shares;
  let ammPoints; // points exchanged with the AMM (cost on buy, proceeds on sell)
  let fee;
  let cashDelta; // signed change to the trader's balance
  let direction; // +1 adds shares to q, -1 removes

  if (side === 'BUY') {
    const ammSpend = amount / (1 + feeRate);
    shares = lmsr.sharesForSpend(outcome, ammSpend, qYes, qNo, b);
    ammPoints = ammSpend;
    fee = amount - ammSpend;
    cashDelta = -amount;
    direction = 1;
  } else {
    shares = amount;
    const proceeds = lmsr.proceedsForSell(outcome, shares, qYes, qNo, b);
    fee = proceeds * feeRate;
    ammPoints = proceeds;
    cashDelta = proceeds - fee;
    direction = -1;
  }

  const after = lmsr.applyShares(outcome, direction * shares, qYes, qNo);
  const yesPriceAfter = roundPriceToTick(lmsr.priceYes(after.qYes, after.qNo, b) * 100, market);
  const avgPriceCents = shares > 0 ? roundMoney((ammPoints / shares) * 100) : 0;

  return {
    shares: roundMoney(shares),
    ammPoints: roundMoney(ammPoints),
    fee: roundMoney(fee),
    cashDelta: roundMoney(cashDelta),
    avgPriceCents,
    priceCents: avgPriceCents,
    qYesAfter: after.qYes,
    qNoAfter: after.qNo,
    yesPriceAfterCents: yesPriceAfter,
    noPriceAfterCents: roundMoney(clampPriceCents(100 - yesPriceAfter)),
    // potential payout if this position wins: 1 point per share.
    toWin: roundMoney(shares),
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
    bParam: row.b_param == null && row.bParam == null ? null : asNumber(row.b_param ?? row.bParam),
    qYes: row.q_yes == null && row.qYes == null ? null : asNumber(row.q_yes ?? row.qYes),
    qNo: row.q_no == null && row.qNo == null ? null : asNumber(row.q_no ?? row.qNo),
    feeBps: asNumber(row.fee_bps ?? row.feeBps, defaultFeeBps),
    winningOutcome: row.winning_outcome ?? row.winningOutcome ?? null,
    resolvedAt: row.resolved_at ?? row.resolvedAt ?? null,
    resolvedBy: row.resolved_by ?? row.resolvedBy ?? null,
    resolutionNote: row.resolution_note ?? row.resolutionNote ?? null,
    marketType: row.market_type ?? row.marketType ?? 'binary',
    outcomesDef: parseJsonField(row.outcomes_def ?? row.outcomesDef) || null,
    outcomeStates: parseJsonField(row.outcome_states ?? row.outcomeStates) || null,
    qVec: parseJsonField(row.q_vec ?? row.qVec) || null,
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
    pricesAfter: parseJsonField(row.prices_after ?? row.pricesAfter),
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
  if (isMultiMarket(market)) return multiMarketDto(market, options);

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
    feeBps: asNumber(market.feeBps, defaultFeeBps),
    winningOutcome: market.winningOutcome || null,
    resolvedAt: market.resolvedAt ? new Date(market.resolvedAt).toISOString() : null,
    resolutionNote: market.resolutionNote || null,
    ...prices,
    quotes: {
      YES: { bid: getQuote({ market, outcome: 'YES' }), ask: getQuote({ market, outcome: 'YES' }) },
      NO: { bid: getQuote({ market, outcome: 'NO' }), ask: getQuote({ market, outcome: 'NO' }) },
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

// The synthetic price path spans the market's whole visible life. "Now" is
// quantized to the minute so the path is byte-stable across rapid refetches: the
// PRNG is seeded only by the marketId, so the time window is the only per-request
// input — pinning it to the minute removes flicker.
function historyWindow(market) {
  const startTime = new Date(market.createdAt).getTime();
  const nowFloor = Math.floor(Date.now() / 60000) * 60000;
  const endTime = Math.max(startTime + 60000, nowFloor);

  return { startTime, endTime };
}

// Peak micro-volatility (in percentage points) scaled gently by the market's age:
// a market that has been open for days breathes a little wider than a fresh one.
function historyVolatility(startTime, endTime) {
  const spanDays = Math.max(0, (endTime - startTime) / 86400000);

  return Math.max(2.5, Math.min(8, 2.5 + 2 * Math.sqrt(spanDays)));
}

function buildHistory(market, trades) {
  // YES and NO are mirror images (NO = 100 - YES) — the LMSR invariant carried
  // through to the chart. We synthesize a dense, realistic YES path that opens at
  // the initial probability and ends at the exact current live price (see
  // server/lib/priceHistory.js); NO is derived per point.
  const openYes = clampPercent(asNumber(market.initialProbability, 50));
  const currentYes = getDisplayPrices(market).yesPercent;
  const { startTime, endTime } = historyWindow(market);
  const count = priceHistory.pickCount(startTime, endTime);
  const times = priceHistory.buildEvenTimeGrid(startTime, endTime, count);

  // Journey = the distinct price levels the market actually traded through,
  // de-clustered and spread across the timeline (not pinned to the real,
  // minutes-apart trade timestamps, which would cram all movement into the left edge).
  const tradeLevels = trades.map((trade) => clampPriceCents(asNumber(trade.yesPriceAfterCents, openYes)));
  const journey = [openYes, ...priceHistory.dedupeConsecutive(tradeLevels), currentYes];
  const anchors = priceHistory.buildSpreadAnchors(journey, startTime, endTime);

  const values = priceHistory.buildPricePath({
    seed: priceHistory.hashString(String(market.id)),
    anchors,
    times,
    volatility: historyVolatility(startTime, endTime),
  });

  return times.map((tm, i) => ({
    time: new Date(tm).toISOString(),
    yesPercent: values[i],
    noPercent: roundMoney(clampPriceCents(100 - values[i])),
  }));
}

// Multi-outcome chart history: each point carries a `values` map of
// outcomeId -> probability%, so the chart draws one independent line per outcome.
// Each line gets its own seeded noise (non-symmetric) and the per-point columns
// are renormalized to sum to 100, exactly like Polymarket.
function buildMultiHistory(market, trades) {
  const { outcomes, b, states } = marketMultiState(market);
  const n = Math.max(1, outcomes.length);
  const openPrices = outcomes.map((o) => clampPercent(asNumber(o.initialProbability, 100 / n)));
  const currentPrices = lmsr.displayedPriceMulti(states, b).map((p) => clampPriceCents(p * 100));
  const { startTime, endTime } = historyWindow(market);
  const count = priceHistory.pickCount(startTime, endTime);
  const times = priceHistory.buildEvenTimeGrid(startTime, endTime, count);

  const tradeColumns = trades.filter((trade) => Array.isArray(trade.pricesAfter) && trade.pricesAfter.length === n);
  const outcomeInputs = outcomes.map((o, k) => {
    const levels = tradeColumns.map((trade) => clampPriceCents(asNumber(trade.pricesAfter[k], openPrices[k])));
    const journey = [openPrices[k], ...priceHistory.dedupeConsecutive(levels), currentPrices[k]];

    return { id: o.id, anchors: priceHistory.buildSpreadAnchors(journey, startTime, endTime) };
  });

  const { series } = priceHistory.buildMultiPaths({
    marketId: String(market.id),
    outcomes: outcomeInputs,
    times,
    volatility: historyVolatility(startTime, endTime),
  });

  return times.map((tm, i) => ({
    time: new Date(tm).toISOString(),
    values: Object.fromEntries(outcomes.map((o) => [o.id, series[o.id][i]])),
  }));
}

function multiMarketDto(market, options = {}) {
  const { outcomes, b, states } = marketMultiState(market);
  const prices = lmsr.displayedPriceMulti(states, b).map((p) => roundPriceToTick(p * 100, market));
  const volume = roundMoney(asNumber(market.yesPool) + asNumber(market.noPool));
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
  const history = buildMultiHistory(market, options.historyTrades || []);
  const quotes = Object.fromEntries(outcomes.map((o, i) => {
    const cents = roundPriceToTick(prices[i], market);
    return [o.id, { bid: cents, ask: cents }];
  }));

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
    createdBy: market.createdBy ? { id: market.createdBy, name: market.creatorName || 'Пользователь' } : null,
    marketType: 'multi',
    yesPool: roundMoney(asNumber(market.yesPool)),
    noPool: roundMoney(asNumber(market.noPool)),
    volume,
    tradeCount: market.tradeCount,
    liquidity: market.liquidity,
    initialProbability: market.initialProbability,
    tickSize: market.tickSize,
    minOrderSize: market.minOrderSize,
    feeBps: asNumber(market.feeBps, defaultFeeBps),
    winningOutcome: market.winningOutcome || null,
    resolvedAt: market.resolvedAt ? new Date(market.resolvedAt).toISOString() : null,
    resolutionNote: market.resolutionNote || null,
    // binary-shaped fields kept for back-compat with components that read them.
    yesPrice: prices[0], noPrice: 0, yesPercent: prices[0], noPercent: 0,
    quotes,
    outcomes: outcomes.map((o, i) => ({
      name: o.label,
      outcome: o.id,
      color: o.color,
      percent: prices[i],
      priceCents: prices[i],
      pool: 0,
    })),
    recentTrades,
    history,
    viewer: options.viewer || null,
  };
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
  // LMSR authoritative state + fees.
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS b_param numeric;');
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS q_yes numeric NOT NULL DEFAULT 0;');
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS q_no numeric NOT NULL DEFAULT 0;');
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS fee_bps integer NOT NULL DEFAULT 0;');
  // Resolution / settlement.
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS winning_outcome text;');
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS resolved_at timestamptz;');
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS resolved_by text REFERENCES users(id) ON DELETE SET NULL;');
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS resolution_note text;');
  // Cost basis for P&L and cancel refunds.
  await pool.query('ALTER TABLE positions ADD COLUMN IF NOT EXISTS cost_basis numeric NOT NULL DEFAULT 0;');
  await pool.query('ALTER TABLE positions ADD COLUMN IF NOT EXISTS realized_pnl numeric NOT NULL DEFAULT 0;');
  // Append-only double-entry ledger — the conservation backbone.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledger (
      id text PRIMARY KEY,
      ts timestamptz NOT NULL DEFAULT now(),
      account text NOT NULL,
      market_id text,
      trade_id text,
      kind text NOT NULL,
      delta numeric NOT NULL
    );
  `);
  // Backfill LMSR state for any market created before this migration: pick b
  // from liquidity and seed q so the opening price equals initial_probability.
  const legacyMarkets = await pool.query("SELECT id, liquidity, initial_probability FROM markets WHERE b_param IS NULL");
  for (const row of legacyMarkets.rows) {
    const b = lmsr.bFromLiquidity(asNumber(row.liquidity, defaultMarketLiquidity));
    const seeded = lmsr.seedQ(clampPercent(asNumber(row.initial_probability, 50)) / 100, b);
    await pool.query('UPDATE markets SET b_param = $1, q_yes = $2, q_no = $3 WHERE id = $4', [b, seeded.qYes, seeded.qNo, row.id]);
  }
  await pool.query('CREATE INDEX IF NOT EXISTS markets_created_at_idx ON markets (created_at DESC);');
  await pool.query('CREATE INDEX IF NOT EXISTS votes_market_created_at_idx ON votes (market_id, created_at DESC);');
  await pool.query('CREATE INDEX IF NOT EXISTS votes_user_idx ON votes (user_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS positions_user_idx ON positions (user_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS positions_market_idx ON positions (market_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS ledger_account_idx ON ledger (account, ts DESC);');
  await pool.query('CREATE INDEX IF NOT EXISTS ledger_market_idx ON ledger (market_id);');
  // Multi-outcome (categorical) markets.
  await pool.query("ALTER TABLE markets ADD COLUMN IF NOT EXISTS market_type text NOT NULL DEFAULT 'binary';");
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS outcomes_def jsonb;');
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS q_vec jsonb;');
  await pool.query('ALTER TABLE markets ADD COLUMN IF NOT EXISTS outcome_states jsonb;');
  await pool.query('ALTER TABLE votes ADD COLUMN IF NOT EXISTS prices_after jsonb;');
  // Outcome can be an arbitrary outcome id for multi markets — drop the YES/NO checks.
  await pool.query('ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_outcome_check;');
  await pool.query('ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_outcome_check;');
}

async function ensureJsonDb() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(jsonDbPath);
  } catch {
    await fs.writeFile(jsonDbPath, JSON.stringify({ users: [], markets: [], votes: [], positions: [], ledger: [] }, null, 2));
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
  db.ledger ||= [];

  for (const user of db.users) {
    if (typeof user.isAdmin !== 'boolean') {
      user.isAdmin = Boolean(user.is_admin);
      changed = true;
    }
  }

  // Backfill LMSR state for legacy markets: seed q from the current price so
  // there is no visible jump, falling back to initial_probability.
  for (const market of db.markets) {
    if (market.bParam == null) {
      const b = lmsr.bFromLiquidity(asNumber(market.liquidity, defaultMarketLiquidity));
      const lastYes = [...db.votes]
        .filter((vote) => vote.marketId === market.id)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0]?.yesPriceAfterCents;
      const seedPrice = clampPercent(asNumber(lastYes, asNumber(market.initialProbability, 50))) / 100;
      const seeded = lmsr.seedQ(seedPrice, b);
      market.bParam = b;
      market.qYes = seeded.qYes;
      market.qNo = seeded.qNo;
      changed = true;
    }

    if (market.feeBps == null) {
      market.feeBps = defaultFeeBps;
      changed = true;
    }
  }

  for (const position of db.positions) {
    if (position.costBasis == null) {
      // Approximate basis from avg price * shares for pre-migration positions.
      position.costBasis = roundMoney(asNumber(position.shares) * asNumber(position.avgPriceCents) / 100);
      position.realizedPnl ||= 0;
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
    outcomes,
  }) {
    const id = newId('mkt');
    const createdAt = new Date().toISOString();
    const b = lmsr.bFromLiquidity(liquidity);
    const isMulti = Array.isArray(outcomes) && outcomes.length >= 2;

    const base = {
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
      bParam: b,
      feeBps: defaultFeeBps,
      winningOutcome: null,
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
      createdBy,
      createdAt,
      tradeCount: 0,
    };

    let market;
    if (isMulti) {
      const palette = ['#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#a855f7', '#14b8a6', '#ec4899', '#84cc16'];
      const probsRaw = outcomes.map((o) => Math.max(1, asNumber(o.initialProbability, 100 / outcomes.length)));
      const sum = probsRaw.reduce((acc, value) => acc + value, 0);
      const probs = probsRaw.map((p) => p / sum);
      const outcomeStates = lmsr.seedOutcomeStates(probs, b);
      market = {
        ...base,
        marketType: 'multi',
        qYes: null,
        qNo: null,
        outcomesDef: outcomes.map((o, i) => ({
          id: o.id,
          label: o.label,
          color: o.color || palette[i % palette.length],
          initialProbability: clampPercent(probs[i] * 100),
        })),
        outcomeStates,
      };
    } else {
      const seeded = lmsr.seedQ(clampPercent(initialProbability) / 100, b);
      market = { ...base, marketType: 'binary', qYes: seeded.qYes, qNo: seeded.qNo };
    }

    if (pool) {
      const result = await pool.query(
        `INSERT INTO markets (
          id, title, description, category, resolution_source, resolution_rules, start_date, close_date,
          status, yes_pool, no_pool, liquidity, initial_probability, tick_size, min_order_size,
          b_param, q_yes, q_no, fee_bps, market_type, outcomes_def, outcome_states, created_by, created_at
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', 0, 0, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         RETURNING *`,
        [
          id, title, description, category, resolutionSource, resolutionRules,
          market.startDate, market.closeDate, liquidity, initialProbability, tickSize, minOrderSize,
          b, market.qYes, market.qNo, defaultFeeBps, market.marketType,
          market.outcomesDef ? JSON.stringify(market.outcomesDef) : null,
          market.outcomeStates ? JSON.stringify(market.outcomeStates) : null,
          createdBy, createdAt,
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

  async placeTrade({ marketId, userId, outcome, side, amount, maxPriceCents = null, minPriceCents = null }) {
    const createdAt = new Date().toISOString();
    const id = newId('trd');

    if (pool) {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        const [marketResult, userResult, positionResult] = await Promise.all([
          client.query('SELECT * FROM markets WHERE id = $1 FOR UPDATE', [marketId]),
          client.query('SELECT points_balance FROM users WHERE id = $1 FOR UPDATE', [userId]),
          client.query('SELECT shares, avg_price_cents, cost_basis, realized_pnl FROM positions WHERE user_id = $1 AND market_id = $2 AND outcome = $3 FOR UPDATE', [userId, marketId, outcome]),
        ]);
        const row = marketResult.rows[0];
        const userRow = userResult.rows[0];

        if (!row) throw tradeError('MARKET_NOT_FOUND', 404);
        if (!userRow) throw tradeError('USER_NOT_FOUND', 404);

        const market = normalizeMarket(row);
        assertMarketIsOpen(market);
        if (isMultiMarket(market)) throw tradeError('MULTI_PG_UNSUPPORTED', 400);
        const existing = positionResult.rows[0] || { shares: 0, avg_price_cents: 0, cost_basis: 0, realized_pnl: 0 };
        const result = applyTrade({
          market, side, outcome, amount, userId,
          userBalance: asNumber(userRow.points_balance, defaultStartingBalance),
          currentShares: asNumber(existing.shares),
          currentBasis: asNumber(existing.cost_basis),
          currentRealized: asNumber(existing.realized_pnl),
          maxPriceCents, minPriceCents,
        });
        const { fill } = result;
        const cashMagnitude = roundMoney(Math.abs(fill.cashDelta));

        await client.query(
          `INSERT INTO votes (id, market_id, user_id, outcome, side, amount, price_cents, yes_price_after_cents, no_price_after_cents, shares, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [id, marketId, userId, outcome, side, cashMagnitude, fill.priceCents, fill.yesPriceAfterCents, fill.noPriceAfterCents, fill.shares, createdAt],
        );
        await client.query('UPDATE users SET points_balance = $1 WHERE id = $2', [result.nextBalance, userId]);
        await client.query(
          `INSERT INTO positions (user_id, market_id, outcome, shares, avg_price_cents, cost_basis, realized_pnl, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (user_id, market_id, outcome)
           DO UPDATE SET shares = EXCLUDED.shares, avg_price_cents = EXCLUDED.avg_price_cents, cost_basis = EXCLUDED.cost_basis, realized_pnl = EXCLUDED.realized_pnl, updated_at = EXCLUDED.updated_at`,
          [userId, marketId, outcome, result.nextShares, result.nextAvg, result.nextBasis, result.nextRealized, createdAt],
        );
        await client.query('UPDATE markets SET q_yes = $1, q_no = $2, yes_pool = $3, no_pool = $4 WHERE id = $5', [result.qYesAfter, result.qNoAfter, result.yesPool, result.noPool, marketId]);
        await recordLedgerPg(client, result.ledger, { marketId, tradeId: id, ts: createdAt });
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

    if (!market) throw tradeError('MARKET_NOT_FOUND', 404);
    if (!user) throw tradeError('USER_NOT_FOUND', 404);

    const normalizedMarket = normalizeMarket(market);
    assertMarketIsOpen(normalizedMarket);
    user.balance = asNumber(user.balance, defaultStartingBalance);
    let position = db.positions.find((item) => item.userId === userId && item.marketId === marketId && item.outcome === outcome);
    const existing = position || { shares: 0, avgPriceCents: 0, costBasis: 0, realizedPnl: 0 };

    const result = applyTrade({
      market: normalizedMarket, side, outcome, amount, userId,
      userBalance: user.balance,
      currentShares: asNumber(existing.shares),
      currentBasis: asNumber(existing.costBasis),
      currentRealized: asNumber(existing.realizedPnl),
      maxPriceCents, minPriceCents,
    });
    const { fill } = result;

    if (isMultiMarket(normalizedMarket)) {
      market.outcomeStates = result.statesAfter;
    } else {
      market.qYes = result.qYesAfter;
      market.qNo = result.qNoAfter;
    }
    market.yesPool = result.yesPool;
    market.noPool = result.noPool;
    market.bParam = normalizedMarket.bParam ?? marketLmsrState(normalizedMarket).b;
    user.balance = result.nextBalance;

    if (!position) {
      position = { userId, marketId, outcome, shares: 0, avgPriceCents: 0, costBasis: 0, realizedPnl: 0 };
      db.positions.push(position);
    }
    position.shares = result.nextShares;
    position.avgPriceCents = result.nextAvg;
    position.costBasis = result.nextBasis;
    position.realizedPnl = result.nextRealized;
    position.updatedAt = createdAt;

    db.votes.push({
      id, marketId, userId, outcome, side,
      amount: roundMoney(Math.abs(fill.cashDelta)),
      priceCents: fill.priceCents,
      yesPriceAfterCents: fill.yesPriceAfterCents ?? null,
      noPriceAfterCents: fill.noPriceAfterCents ?? null,
      pricesAfter: fill.pricesAfter ?? null,
      shares: fill.shares,
      createdAt,
    });
    recordLedgerJson(db, result.ledger, { marketId, tradeId: id, ts: createdAt });
    await writeJsonDb(db);
  },

  // Pure preview of a trade — no balance check, no persistence. Powers POST /quote.
  async quoteTrade({ marketId, outcome, side, amount }) {
    const market = await this.getMarket(marketId);

    if (!market) throw tradeError('MARKET_NOT_FOUND', 404);

    const fill = calculateFill({ market, side, outcome, amount });
    let currentPrice;
    if (isMultiMarket(market)) {
      const { outcomes, b, states } = marketMultiState(market);
      const i = outcomes.findIndex((o) => o.id === outcome);
      currentPrice = roundPriceToTick(lmsr.displayedPriceMulti(states, b)[i] * 100, market);
    } else {
      const state = marketLmsrState(market);
      currentPrice = roundPriceToTick(lmsr.priceOf(outcome, state.qYes, state.qNo, state.b) * 100, market);
    }
    const cash = roundMoney(Math.abs(fill.cashDelta));

    return {
      marketId, outcome, side,
      shares: fill.shares,
      cost: cash,
      fee: fill.fee,
      avgPriceCents: fill.avgPriceCents,
      currentPriceCents: currentPrice,
      priceImpactCents: roundMoney(Math.abs(fill.avgPriceCents - currentPrice)),
      yesPriceAfterCents: fill.yesPriceAfterCents,
      noPriceAfterCents: fill.noPriceAfterCents,
      toWin: fill.toWin,
      returnPercent: side === 'BUY' && cash > 0 ? roundMoney(((fill.toWin - cash) / cash) * 100) : 0,
    };
  },

  // Resolve a market: pay every winning share exactly 1 point, zero positions,
  // mark the outcome. Irreversible and conservation-checked.
  async resolveMarket({ marketId, winningOutcome, resolvedBy, note }) {
    const resolvedAt = new Date().toISOString();

    if (pool) {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        const marketResult = await client.query('SELECT * FROM markets WHERE id = $1 FOR UPDATE', [marketId]);
        const row = marketResult.rows[0];

        if (!row) throw tradeError('MARKET_NOT_FOUND', 404);
        if (row.status === 'resolved' || row.status === 'canceled') throw tradeError('MARKET_ALREADY_SETTLED', 409);

        const positionsResult = await client.query('SELECT user_id, outcome, shares, cost_basis FROM positions WHERE market_id = $1 AND shares > 0 FOR UPDATE', [marketId]);
        for (const position of positionsResult.rows) {
          const payout = position.outcome === winningOutcome ? roundMoney(asNumber(position.shares)) : 0;
          if (payout > 0) {
            await client.query('UPDATE users SET points_balance = points_balance + $1 WHERE id = $2', [payout, position.user_id]);
            await recordLedgerPg(client, balancedLegs(position.user_id, payout, 'settle'), { marketId, ts: resolvedAt });
          }
          await client.query('UPDATE positions SET shares = 0, cost_basis = 0, updated_at = $1 WHERE user_id = $2 AND market_id = $3 AND outcome = $4', [resolvedAt, position.user_id, marketId, position.outcome]);
        }

        await client.query(
          'UPDATE markets SET status = $1, winning_outcome = $2, resolved_at = $3, resolved_by = $4, resolution_note = $5 WHERE id = $6',
          ['resolved', winningOutcome, resolvedAt, resolvedBy, note || null, marketId],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      return this.getMarket(marketId);
    }

    const db = await readJsonDb();
    const market = db.markets.find((item) => item.id === marketId);

    if (!market) throw tradeError('MARKET_NOT_FOUND', 404);
    if (market.status === 'resolved' || market.status === 'canceled') throw tradeError('MARKET_ALREADY_SETTLED', 409);

    for (const position of db.positions.filter((item) => item.marketId === marketId && asNumber(item.shares) > 0)) {
      const payout = position.outcome === winningOutcome ? roundMoney(asNumber(position.shares)) : 0;
      const user = db.users.find((item) => item.id === position.userId);
      if (payout > 0 && user) {
        user.balance = roundMoney(asNumber(user.balance, defaultStartingBalance) + payout);
        recordLedgerJson(db, balancedLegs(position.userId, payout, 'settle'), { marketId, ts: resolvedAt });
      }
      position.shares = 0;
      position.costBasis = 0;
      position.updatedAt = resolvedAt;
    }

    market.status = 'resolved';
    market.winningOutcome = winningOutcome;
    market.resolvedAt = resolvedAt;
    market.resolvedBy = resolvedBy;
    market.resolutionNote = note || null;
    await writeJsonDb(db);

    return this.getMarket(marketId);
  },

  // Cancel a market: refund each holder their remaining cost basis, zero positions.
  async cancelMarket({ marketId, note }) {
    const canceledAt = new Date().toISOString();

    if (pool) {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        const marketResult = await client.query('SELECT status FROM markets WHERE id = $1 FOR UPDATE', [marketId]);
        const row = marketResult.rows[0];

        if (!row) throw tradeError('MARKET_NOT_FOUND', 404);
        if (row.status === 'resolved' || row.status === 'canceled') throw tradeError('MARKET_ALREADY_SETTLED', 409);

        const positionsResult = await client.query('SELECT user_id, outcome, cost_basis FROM positions WHERE market_id = $1 AND shares > 0 FOR UPDATE', [marketId]);
        for (const position of positionsResult.rows) {
          const refund = roundMoney(asNumber(position.cost_basis));
          if (refund > 0) {
            await client.query('UPDATE users SET points_balance = points_balance + $1 WHERE id = $2', [refund, position.user_id]);
            await recordLedgerPg(client, balancedLegs(position.user_id, refund, 'cancel_refund'), { marketId, ts: canceledAt });
          }
          await client.query('UPDATE positions SET shares = 0, cost_basis = 0, updated_at = $1 WHERE user_id = $2 AND market_id = $3 AND outcome = $4', [canceledAt, position.user_id, marketId, position.outcome]);
        }

        await client.query('UPDATE markets SET status = $1, resolution_note = $2 WHERE id = $3', ['canceled', note || null, marketId]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      return this.getMarket(marketId);
    }

    const db = await readJsonDb();
    const market = db.markets.find((item) => item.id === marketId);

    if (!market) throw tradeError('MARKET_NOT_FOUND', 404);
    if (market.status === 'resolved' || market.status === 'canceled') throw tradeError('MARKET_ALREADY_SETTLED', 409);

    for (const position of db.positions.filter((item) => item.marketId === marketId && asNumber(item.shares) > 0)) {
      const refund = roundMoney(asNumber(position.costBasis));
      const user = db.users.find((item) => item.id === position.userId);
      if (refund > 0 && user) {
        user.balance = roundMoney(asNumber(user.balance, defaultStartingBalance) + refund);
        recordLedgerJson(db, balancedLegs(position.userId, refund, 'cancel_refund'), { marketId, ts: canceledAt });
      }
      position.shares = 0;
      position.costBasis = 0;
      position.updatedAt = canceledAt;
    }

    market.status = 'canceled';
    market.resolutionNote = note || null;
    await writeJsonDb(db);

    return this.getMarket(marketId);
  },
};

function assertMarketIsOpen(market) {
  if (market.status !== 'open' || new Date(market.closeDate).getTime() <= Date.now()) {
    const closedError = new Error('MARKET_CLOSED');
    closedError.status = 409;
    throw closedError;
  }
}

function tradeError(code, status) {
  const error = new Error(code);
  error.status = status;
  return error;
}

// Two balanced ledger legs for a pure user<->house transfer (settlement, refund).
function balancedLegs(userId, amount, kind) {
  return [
    { account: `user:${userId}`, kind, delta: roundMoney(amount) },
    { account: houseAccount, kind, delta: roundMoney(-amount) },
  ];
}

// Every set of ledger legs for one transaction must net to zero — the
// conservation invariant. Throws (500) if it ever does not.
function assertBalanced(legs) {
  const sum = legs.reduce((total, leg) => total + leg.delta, 0);

  if (Math.abs(sum) > 0.01) {
    const error = new Error('LEDGER_IMBALANCE');
    error.status = 500;
    error.detail = `ledger legs summed to ${sum}`;
    throw error;
  }
}

async function recordLedgerPg(client, legs, { marketId = null, tradeId = null, ts = null } = {}) {
  assertBalanced(legs);

  for (const leg of legs) {
    if (leg.delta === 0) continue;
    await client.query(
      'INSERT INTO ledger (id, ts, account, market_id, trade_id, kind, delta) VALUES ($1, COALESCE($2, now()), $3, $4, $5, $6, $7)',
      [newId('led'), ts, leg.account, marketId, tradeId, leg.kind, leg.delta],
    );
  }
}

function recordLedgerJson(db, legs, { marketId = null, tradeId = null, ts = null } = {}) {
  assertBalanced(legs);
  db.ledger ||= [];

  for (const leg of legs) {
    if (leg.delta === 0) continue;
    db.ledger.push({
      id: newId('led'),
      ts: ts || new Date().toISOString(),
      account: leg.account,
      marketId,
      tradeId,
      kind: leg.kind,
      delta: leg.delta,
    });
  }
}

// Storage-agnostic trade math + validation. Returns everything both the Postgres
// and JSON paths need to persist, including the balanced ledger legs.
function applyTrade({
  market, side, outcome, amount, userId,
  userBalance, currentShares, currentBasis, currentRealized,
  maxPriceCents = null, minPriceCents = null,
}) {
  if (side === 'SELL' && currentShares + 1e-6 < amount) {
    throw tradeError('INSUFFICIENT_POSITION', 409);
  }

  const fill = calculateFill({ market, side, outcome, amount });
  const cashMagnitude = Math.abs(fill.cashDelta);

  if (fill.shares <= 0 || cashMagnitude + 1e-9 < asNumber(market.minOrderSize, defaultMinOrderSize)) {
    throw tradeError('ORDER_TOO_SMALL', 400);
  }

  if (side === 'BUY' && maxPriceCents != null && fill.avgPriceCents > asNumber(maxPriceCents) + 1e-6) {
    throw tradeError('SLIPPAGE_EXCEEDED', 409);
  }

  if (side === 'SELL' && minPriceCents != null && fill.avgPriceCents < asNumber(minPriceCents) - 1e-6) {
    throw tradeError('SLIPPAGE_EXCEEDED', 409);
  }

  if (side === 'BUY' && userBalance + 1e-6 < cashMagnitude) {
    throw tradeError('INSUFFICIENT_BALANCE', 409);
  }

  const nextBalance = roundMoney(userBalance + fill.cashDelta);
  let nextShares;
  let nextBasis;
  let nextRealized = roundMoney(currentRealized);

  if (side === 'BUY') {
    nextShares = roundMoney(currentShares + fill.shares);
    nextBasis = roundMoney(currentBasis + fill.ammPoints + fill.fee);
  } else {
    const sellFraction = currentShares > 0 ? Math.min(1, fill.shares / currentShares) : 0;
    const basisRemoved = roundMoney(currentBasis * sellFraction);
    nextShares = roundMoney(Math.max(0, currentShares - fill.shares));
    nextBasis = roundMoney(Math.max(0, currentBasis - basisRemoved));
    nextRealized = roundMoney(currentRealized + (fill.cashDelta - basisRemoved));
  }

  const nextAvg = nextShares > 1e-9 ? roundMoney((nextBasis / nextShares) * 100) : 0;
  // Volume bucket: binary splits across yes/no pools; multi tracks total in yesPool.
  const yesPool = roundMoney(asNumber(market.yesPool) + (fill.multi || outcome === 'YES' ? cashMagnitude : 0));
  const noPool = roundMoney(asNumber(market.noPool) + (!fill.multi && outcome === 'NO' ? cashMagnitude : 0));

  const ledger = side === 'BUY'
    ? [
        { account: `user:${userId}`, kind: 'buy', delta: roundMoney(fill.cashDelta) },
        { account: houseAccount, kind: 'buy', delta: roundMoney(fill.ammPoints) },
        { account: houseFeesAccount, kind: 'fee', delta: roundMoney(fill.fee) },
      ]
    : [
        { account: `user:${userId}`, kind: 'sell', delta: roundMoney(fill.cashDelta) },
        { account: houseAccount, kind: 'sell', delta: roundMoney(-fill.ammPoints) },
        { account: houseFeesAccount, kind: 'fee', delta: roundMoney(fill.fee) },
      ];

  return {
    fill,
    nextBalance,
    nextShares,
    nextBasis,
    nextAvg,
    nextRealized,
    qYesAfter: fill.qYesAfter,
    qNoAfter: fill.qNoAfter,
    statesAfter: fill.statesAfter,
    pricesAfter: fill.pricesAfter,
    yesPool,
    noPool,
    ledger,
  };
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

// Parse a multi-outcome definition from the create-market body. Returns undefined
// for a binary market (fewer than 2 outcomes given).
function parseOutcomesInput(raw) {
  if (!Array.isArray(raw) || raw.length < 2) return undefined;

  if (raw.length > 12) {
    throw validationError('У рынка может быть не больше 12 исходов.');
  }

  const seen = new Set();
  const outcomes = raw.map((entry, index) => {
    const label = String(entry?.label || '').trim();
    if (label.length < 1 || label.length > 60) {
      throw validationError('Название исхода должно быть от 1 до 60 символов.');
    }
    const id = String(entry?.id || label).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40) || `OUT_${index}`;
    if (seen.has(id)) {
      throw validationError('Исходы должны быть уникальными.');
    }
    seen.add(id);
    return {
      id,
      label,
      color: typeof entry?.color === 'string' ? entry.color : undefined,
      initialProbability: entry?.initialProbability == null ? undefined : clampPercent(asNumber(entry.initialProbability, 0)),
    };
  });

  return outcomes;
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
  const token = signToken(publicProfile, defaultSessionTtlSeconds);

  setSessionCookie(res, token);

  res.status(201).json({
    user: publicProfile,
  });
}));

app.post('/api/auth/login', authIpLimiter, loginAccountLimiter, asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const rememberMe = req.body.rememberMe === true;

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
  const ttlSeconds = rememberMe ? rememberedSessionTtlSeconds : defaultSessionTtlSeconds;
  const token = signToken(publicProfile, ttlSeconds);

  setSessionCookie(res, token, rememberMe ? ttlSeconds : undefined);

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

  // Resolution and cancellation move money and go through dedicated endpoints.
  if (!settableStatuses.has(status)) {
    throw validationError('Через статус можно ставить только «open» или «paused». Для расчёта используйте резолюцию или отмену.');
  }

  const market = await storage.updateMarketStatus({
    marketId,
    status,
  });

  res.json({ market: marketDto(market) });
}));

app.patch('/api/admin/markets/:id/resolve', requireAuth, requireAdmin, adminLimiter, asyncRoute(async (req, res) => {
  const marketId = validateId(req.params.id, 'mkt');
  const winningOutcome = String(req.body.winningOutcome || '').trim().toUpperCase();
  const note = String(req.body.note || '').trim().slice(0, 2000);

  if (!winningOutcome) {
    throw validationError('Выбери выигравший исход.');
  }

  const market = await storage.resolveMarket({
    marketId,
    winningOutcome,
    resolvedBy: req.user.id,
    note,
  });

  res.json({ market: marketDto(market) });
}));

app.post('/api/admin/markets/:id/cancel', requireAuth, requireAdmin, adminLimiter, asyncRoute(async (req, res) => {
  const marketId = validateId(req.params.id, 'mkt');
  const note = String(req.body.note || '').trim().slice(0, 2000);

  const market = await storage.cancelMarket({ marketId, note });

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
  const outcomes = parseOutcomesInput(req.body.outcomes);
  const market = await storage.createMarket({ ...input, outcomes, createdBy: req.user.id });
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

function parseTradeBody(body) {
  // Outcome is 'YES'/'NO' for binary markets or an outcome id for multi markets;
  // the market-aware fill validates it. Ids are uppercased for a stable match.
  const outcome = String(body.outcome || '').trim().toUpperCase();
  const side = String(body.side || 'BUY').toUpperCase();
  const amount = roundMoney(Number(body.amount));

  if (!outcome) {
    throw validationError('Выбери исход.');
  }

  if (side !== 'BUY' && side !== 'SELL') {
    throw validationError('Выбери покупку или продажу.');
  }

  if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
    throw validationError(side === 'BUY' ? 'Сумма должна быть от 1 до 10 000 очков.' : 'Количество долей должно быть от 1 до 10 000.');
  }

  const maxPriceCents = body.maxPriceCents == null ? null : roundMoney(Number(body.maxPriceCents));
  const minPriceCents = body.minPriceCents == null ? null : roundMoney(Number(body.minPriceCents));

  return { outcome, side, amount, maxPriceCents, minPriceCents };
}

// Preview a trade without executing it. Powers the live order-ticket receipt.
app.post('/api/markets/:id/quote', optionalAuth, asyncRoute(async (req, res) => {
  const marketId = validateId(req.params.id, 'mkt');
  const { outcome, side, amount } = parseTradeBody(req.body);

  const quote = await storage.quoteTrade({ marketId, outcome, side, amount });
  res.json({ quote });
}));

app.post(['/api/markets/:id/trades', '/api/markets/:id/votes', '/api/posts/:id/votes'], requireAuth, tradeLimiter, asyncRoute(async (req, res) => {
  const marketId = validateId(req.params.id, 'mkt');
  const { outcome, side, amount, maxPriceCents, minPriceCents } = parseTradeBody(req.body);

  await storage.placeTrade({
    marketId,
    userId: req.user.id,
    outcome,
    side,
    amount,
    maxPriceCents,
    minPriceCents,
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
    SLIPPAGE_EXCEEDED: 'Цена сдвинулась сильнее допустимого. Повтори сделку.',
    MARKET_ALREADY_SETTLED: 'Рынок уже рассчитан или отменён.',
    INVALID_OUTCOME: 'Недопустимый исход для этого рынка.',
    MULTI_PG_UNSUPPORTED: 'Мульти-исходные рынки пока работают только на JSON-хранилище.',
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
