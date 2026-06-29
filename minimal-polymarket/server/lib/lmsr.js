// LMSR (Logarithmic Market Scoring Rule) market maker — the economic core.
//
// Why LMSR: the softmax price guarantees price(YES) + price(NO) = 1 by
// construction (the old engine let them drift independently), the maker always
// quotes (no cold-start), and the house's worst-case loss is bounded by
// b * ln(n) — b * ln(2) for a binary market — so the platform is solvent by design.
//
// Units:
//   - q (qYes, qNo): outstanding shares of each outcome, in "shares".
//   - b: liquidity parameter, in points. Larger b = deeper, flatter market.
//   - price(): a probability in (0, 1). The UI shows price * 100 as "%".
//   - money: points. A winning share always redeems for exactly 1 point.
//
// Everything here is a pure function of (qYes, qNo, b) — no I/O, no rounding.
// Callers round for storage/display and assert conservation via the ledger.

export const OUTCOMES = ['YES', 'NO'];
export const LN2 = Math.log(2);

// Map the admin-entered "liquidity" to b so that `liquidity` equals the market's
// maximum house subsidy (worst-case LMSR loss = b * ln(2)).
export function bFromLiquidity(liquidity) {
  return Math.max(1, Number(liquidity) || 0) / LN2;
}

// Numerically-stable log-sum-exp of [qYes/b, qNo/b]. Naive exp() overflows for
// large q/b; subtracting the max keeps every exponent <= 0.
function logSumExp(qYes, qNo, b) {
  const a = qYes / b;
  const c = qNo / b;
  const m = Math.max(a, c);
  return m + Math.log(Math.exp(a - m) + Math.exp(c - m));
}

// Total committed cost of the market in state (qYes, qNo). C(q) = b * lse(q/b).
export function cost(qYes, qNo, b) {
  return b * logSumExp(qYes, qNo, b);
}

// Instantaneous price (= implied probability) of YES. priceNo = 1 - priceYes.
export function priceYes(qYes, qNo, b) {
  const a = qYes / b;
  const c = qNo / b;
  const m = Math.max(a, c);
  const eY = Math.exp(a - m);
  const eN = Math.exp(c - m);
  return eY / (eY + eN);
}

export function priceOf(outcome, qYes, qNo, b) {
  const py = priceYes(qYes, qNo, b);
  return outcome === 'YES' ? py : 1 - py;
}

// Cost (points, > 0) to BUY `shares` (> 0) of `outcome`.
export function costToBuy(outcome, shares, qYes, qNo, b) {
  const before = cost(qYes, qNo, b);
  const after = outcome === 'YES'
    ? cost(qYes + shares, qNo, b)
    : cost(qYes, qNo + shares, b);
  return after - before;
}

// Proceeds (points, > 0) to SELL `shares` (> 0) of `outcome`.
export function proceedsForSell(outcome, shares, qYes, qNo, b) {
  const before = cost(qYes, qNo, b);
  const after = outcome === 'YES'
    ? cost(qYes - shares, qNo, b)
    : cost(qYes, qNo - shares, b);
  return before - after;
}

// Shares (> 0) acquired by SPENDING `points` (> 0) on `outcome`. Closed form:
//   ΔC = b·ln(1 + p·(e^{Δ/b} − 1))  ⇒  Δ = b·ln(1 + (e^{S/b} − 1)/p)
// where p is the pre-trade price of `outcome`. expm1/log1p keep precision small-S.
export function sharesForSpend(outcome, points, qYes, qNo, b) {
  if (points <= 0) return 0;
  const p = priceOf(outcome, qYes, qNo, b);
  const ratio = Math.expm1(points / b) / p;
  return b * Math.log1p(ratio);
}

// Apply a share delta to q and return the new state (does not mutate input).
export function applyShares(outcome, deltaShares, qYes, qNo) {
  return outcome === 'YES'
    ? { qYes: qYes + deltaShares, qNo }
    : { qYes, qNo: qNo + deltaShares };
}

// Seed q so the opening price of YES equals p0 (0..1), keeping the smaller leg at 0.
export function seedQ(p0, b) {
  const p = Math.min(0.999, Math.max(0.001, Number(p0)));
  const delta = b * Math.log(p / (1 - p)); // qYes - qNo
  return delta >= 0 ? { qYes: delta, qNo: 0 } : { qYes: 0, qNo: -delta };
}

// Worst-case house subsidy for this market (bounded LMSR loss).
export function maxSubsidy(b) {
  return b * LN2;
}

// --- N-outcome LMSR (categorical markets) -----------------------------------
//
// Same scoring rule generalised to a vector q of N outcome share counts.
// Prices are a softmax over q/b, so they always sum to 1 but — unlike a binary
// market — no two of them are forced to be mirror images. With 3+ outcomes the
// lines move independently (this is what makes a Polymarket multi-market chart
// look "asymmetric"). A 2-outcome categorical market is mathematically a binary
// market, so its two lines ARE mirrors.

// price vector (probabilities) for state q (array), summing to 1.
export function priceVec(q, b) {
  const m = Math.max(...q) / b;
  const exps = q.map((x) => Math.exp(x / b - m));
  const sum = exps.reduce((a, c) => a + c, 0);
  return exps.map((e) => e / sum);
}

// total committed cost C(q) = b * lse(q/b).
export function costVec(q, b) {
  const m = Math.max(...q) / b;
  return b * (m + Math.log(q.reduce((a, x) => a + Math.exp(x / b - m), 0)));
}

// cost to BUY `shares` (>0) of outcome index i.
export function costToBuyN(q, b, i, shares) {
  const q2 = q.slice();
  q2[i] += shares;
  return costVec(q2, b) - costVec(q, b);
}

// proceeds to SELL `shares` (>0) of outcome index i.
export function proceedsForSellN(q, b, i, shares) {
  const q2 = q.slice();
  q2[i] -= shares;
  return costVec(q, b) - costVec(q2, b);
}

// shares acquired by SPENDING `points` on outcome i (closed form, same as binary).
export function sharesForSpendN(q, b, i, points) {
  if (points <= 0) return 0;
  const p = priceVec(q, b)[i];
  return b * Math.log1p(Math.expm1(points / b) / p);
}

// seed q so the opening prices equal `probs` (array summing to ~1), lowest leg at 0.
export function seedVecFromProbs(probs, b) {
  const q = probs.map((p) => b * Math.log(Math.min(0.999, Math.max(0.001, p))));
  const mn = Math.min(...q);
  return q.map((x) => x - mn);
}

// apply a share delta to outcome i, returning a new vector (no mutation).
export function applySharesN(q, i, deltaShares) {
  const q2 = q.slice();
  q2[i] += deltaShares;
  return q2;
}

// --- Independent per-outcome sub-markets (the Polymarket structure) ----------
//
// A multi-outcome event is modelled as N INDEPENDENT binary YES/NO sub-markets,
// one per outcome, each with its own (qYes, qNo) and a shared b. Buying outcome
// i buys YES of sub-market i and mutates ONLY that sub-market — so only line i
// moves. There is no shared softmax denominator, so the lines are genuinely
// independent (no mechanical see-saw / mirror). For display, the raw prices are
// normalized to sum to 1 (they already sum to ~1 when the book is balanced).

// Seed one binary sub-market to open at probability p0. Only qYes - qNo sets the
// price, so put qNo at 0: qYes = b * logit(p0).
export function seedBinaryState(p0, b) {
  const p = Math.min(0.999, Math.max(0.001, Number(p0)));
  return { qYes: b * Math.log(p / (1 - p)), qNo: 0 };
}

// Seed all N sub-markets from initial probabilities (normalized first, so the
// opening normalized display reads the exact given numbers and Σr opens at 1).
export function seedOutcomeStates(initialProbs, b) {
  const sum = initialProbs.reduce((acc, x) => acc + x, 0) || 1;
  return initialProbs.map((p) => seedBinaryState(p / sum, b));
}

// Raw, independent per-outcome prices r_i ∈ (0,1) — NOT normalized.
export function rawPriceMulti(states, b) {
  return states.map((s) => priceYes(s.qYes, s.qNo, b));
}

// Displayed prices: raw normalized to sum to exactly 1.
export function displayedPriceMulti(states, b) {
  const raw = rawPriceMulti(states, b);
  const total = raw.reduce((acc, x) => acc + x, 0) || 1;
  return raw.map((x) => x / total);
}

// Apply a YES-share delta to sub-market i only (returns a new states array).
export function applyYesShares(states, i, deltaShares) {
  return states.map((s, k) => (k === i ? { qYes: s.qYes + deltaShares, qNo: s.qNo } : { qYes: s.qYes, qNo: s.qNo }));
}
