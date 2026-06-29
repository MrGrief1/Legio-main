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
