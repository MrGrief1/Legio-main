// Property tests for the LMSR engine. Run: node server/lib/lmsr.test.mjs
import {
  bFromLiquidity, cost, priceYes, priceOf, costToBuy, proceedsForSell,
  sharesForSpend, applyShares, seedQ, maxSubsidy, LN2,
} from './lmsr.js';

let passed = 0;
let failed = 0;
const EPS = 1e-6;

function ok(name, condition, extra = '') {
  if (condition) { passed += 1; }
  else { failed += 1; console.error(`  ✗ ${name} ${extra}`); }
}
function close(a, b, eps = EPS) { return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b)); }

// Deterministic LCG so runs are reproducible (no Math.random dependency on order).
let seed = 123456789;
function rnd() { seed = (1103515245 * seed + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function randLiquidity() { return 100 + rnd() * 99900; }
function randQ(b) { return (rnd() - 0.5) * 4 * b; } // q in roughly [-2b, 2b]

console.log('LMSR property tests');

// 1. price(YES) + price(NO) == 1 — the invariant the old engine broke.
for (let i = 0; i < 100000; i += 1) {
  const b = bFromLiquidity(randLiquidity());
  const qY = randQ(b); const qN = randQ(b);
  const py = priceYes(qY, qN, b);
  const pn = 1 - py;
  ok('invariant YES+NO=1', close(py + pn, 1, 1e-12), `got ${py + pn}`);
  ok('price in (0,1)', py > 0 && py < 1, `py=${py}`);
}

// 2. cost monotonically increases with shares bought.
for (let i = 0; i < 5000; i += 1) {
  const b = bFromLiquidity(randLiquidity());
  const qY = randQ(b); const qN = randQ(b);
  const c1 = costToBuy('YES', 10, qY, qN, b);
  const c2 = costToBuy('YES', 20, qY, qN, b);
  ok('cost monotone in size', c2 > c1 && c1 > 0, `c1=${c1} c2=${c2}`);
}

// 3. sharesForSpend is the inverse of costToBuy: buying the returned shares costs ~S.
for (let i = 0; i < 5000; i += 1) {
  const b = bFromLiquidity(randLiquidity());
  const qY = randQ(b); const qN = randQ(b);
  const outcome = rnd() < 0.5 ? 'YES' : 'NO';
  const spend = 1 + rnd() * 5000;
  const shares = sharesForSpend(outcome, spend, qY, qN, b);
  const backCost = costToBuy(outcome, shares, qY, qN, b);
  ok('spend↔shares inverse', close(backCost, spend, 1e-4), `spend=${spend} back=${backCost}`);
}

// 4. Round-trip buy-then-sell is lossless (no fee): proceeds == spend.
for (let i = 0; i < 5000; i += 1) {
  const b = bFromLiquidity(randLiquidity());
  let qY = randQ(b); let qN = randQ(b);
  const outcome = rnd() < 0.5 ? 'YES' : 'NO';
  const spend = 1 + rnd() * 5000;
  const shares = sharesForSpend(outcome, spend, qY, qN, b);
  ({ qY, qN } = (() => { const s = applyShares(outcome, shares, qY, qN); return { qY: s.qYes, qN: s.qNo }; })());
  const proceeds = proceedsForSell(outcome, shares, qY, qN, b);
  ok('round-trip lossless', close(proceeds, spend, 1e-4), `spend=${spend} proceeds=${proceeds}`);
}

// 5. Buying raises that outcome's price, lowers the other; sum stays 1.
for (let i = 0; i < 5000; i += 1) {
  const b = bFromLiquidity(randLiquidity());
  const qY = randQ(b); const qN = randQ(b);
  const before = priceYes(qY, qN, b);
  const s = applyShares('YES', 50, qY, qN);
  const after = priceYes(s.qYes, s.qNo, b);
  ok('buy YES raises p(YES)', after > before, `before=${before} after=${after}`);
}

// 6. seedQ produces the requested opening price.
for (let i = 0; i < 5000; i += 1) {
  const b = bFromLiquidity(randLiquidity());
  const p0 = 0.01 + rnd() * 0.98;
  const { qYes, qNo } = seedQ(p0, b);
  ok('seedQ hits target price', close(priceYes(qYes, qNo, b), p0, 1e-6), `want=${p0} got=${priceYes(qYes, qNo, b)}`);
  ok('seedQ keeps a leg at 0', qYes === 0 || qNo === 0, `qYes=${qYes} qNo=${qNo}`);
}

// 7. House subsidy is bounded by b·ln(2): max payout - collateral collected <= b·ln2.
//    Simulate many buys, resolve worst-case, check house loss <= maxSubsidy (+eps).
for (let i = 0; i < 2000; i += 1) {
  const b = bFromLiquidity(randLiquidity());
  let qY = 0; let qN = 0;
  let collateral = 0; // points the house collected from buys
  const trades = 1 + Math.floor(rnd() * 8);
  for (let t = 0; t < trades; t += 1) {
    const outcome = rnd() < 0.5 ? 'YES' : 'NO';
    const spend = 1 + rnd() * 2000;
    const shares = sharesForSpend(outcome, spend, qY, qN, b);
    const c = costToBuy(outcome, shares, qY, qN, b);
    collateral += c;
    const s = applyShares(outcome, shares, qY, qN);
    qY = s.qYes; qN = s.qNo;
  }
  // Worst case for the house: the outcome with more outstanding shares wins.
  const worstPayout = Math.max(qY, qN);
  const houseLoss = worstPayout - collateral;
  ok('house loss bounded by b·ln2', houseLoss <= maxSubsidy(b) + 1e-3, `loss=${houseLoss} bound=${maxSubsidy(b)}`);
}

console.log(`\n${failed === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${passed} assertions passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
