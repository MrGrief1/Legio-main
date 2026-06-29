// Synthetic price-history generator for the price chart.
//
// Why this exists: a real demo market only ever accrues a handful of trades, all
// within a few minutes, with big discrete jumps then long flat runs. Drawing one
// chart point per trade therefore renders as an ugly, symmetric-looking staircase
// that looks nothing like a live Polymarket chart. This module synthesizes a
// DENSE, deterministic, realistic price path that:
//   - spans the market's whole visible life ([createdAt, now]) sampled evenly in TIME,
//   - starts at the opening probability and ENDS at the exact current live price,
//   - rides a baseline that traces the distinct price levels the market actually
//     traded through (de-clustered, spread across the timeline so movement is not
//     crammed into the first minute) with fractal (fBm) micro-volatility on top,
//   - is seeded ONLY by the marketId, so it is identical on every refetch (no flicker).
//
// Multi-outcome markets generate each line from an INDEPENDENT seed and then
// renormalize the per-time columns to sum to 100 — so the lines move
// independently (non-symmetric, like Polymarket) yet always total 100%.
//
// Pure functions only: no I/O, no Date.now, no Math.random. `now` is passed in by
// the caller; all randomness comes from the seeded PRNG, so output is reproducible
// and testable.

// Fixed sample count. Constant (not span-derived) so the fractal shape is stable
// as the market ages — a changing count would reshape the whole path and flicker.
export const DEFAULT_POINT_COUNT = 140;

const clampPct = (v) => Math.max(1, Math.min(99, v));
const round2 = (v) => Math.round(v * 100) / 100;

// FNV-1a 32-bit string hash → uint32 seed. Stable for a given string.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: a tiny, fast, well-distributed 32-bit PRNG. Returns floats in [0,1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// How many samples to draw. Constant for flicker-stability (see DEFAULT_POINT_COUNT),
// but never more samples than make sense for a very short span.
export function pickCount(startTime, endTime, count = DEFAULT_POINT_COUNT) {
  const span = Math.max(0, endTime - startTime);
  // At least one sample per ~3s of life, capped at the default — keeps a brand-new
  // market from drawing 140 points across 4 seconds.
  const byTime = Math.floor(span / 3000) + 2;
  return Math.max(2, Math.min(count, byTime > count ? count : byTime));
}

// Evenly-spaced timestamps (epoch ms) across [startTime, endTime] inclusive.
// Uniform spacing is what lets the chart's hover map cursor-x → index linearly.
export function buildEvenTimeGrid(startTime, endTime, count) {
  const n = Math.max(2, Math.floor(count));
  const span = endTime - startTime;
  const times = new Array(n);
  for (let i = 0; i < n; i += 1) times[i] = Math.round(startTime + (span * i) / (n - 1));
  return times;
}

// Collapse consecutive near-equal values so a run of identical trade prices (e.g.
// many tiny NO buys that never moved the price) becomes a single milestone. This
// de-clusters the real journey so its DISTINCT levels can spread across the width.
export function dedupeConsecutive(values, tol = 0.5) {
  const out = [];
  for (const v of values) {
    if (out.length === 0 || Math.abs(v - out[out.length - 1]) > tol) out.push(v);
  }
  return out;
}

// Build baseline anchors from a value journey [start, ...milestones, end], placed
// at evenly-spread fractions of [startTime, endTime]. Spreading by index (not real
// trade time) is intentional: it distributes movement across the whole chart
// instead of cramming the real, clustered-in-minutes trades into the left edge.
export function buildSpreadAnchors(journey, startTime, endTime) {
  const vals = journey.map(clampPct);
  const n = vals.length;
  if (n === 1) return [{ t: startTime, value: vals[0] }, { t: endTime, value: vals[0] }];
  const span = endTime - startTime;
  return vals.map((value, i) => ({ t: Math.round(startTime + (span * i) / (n - 1)), value }));
}

// Piecewise-linear value at time t across sorted anchors [{t, value}].
export function interpAnchors(anchors, t) {
  if (anchors.length === 0) return 50;
  if (t <= anchors[0].t) return anchors[0].value;
  const last = anchors[anchors.length - 1];
  if (t >= last.t) return last.value;
  for (let i = 1; i < anchors.length; i += 1) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (t <= b.t) {
      const segment = b.t - a.t;
      if (segment <= 0) return b.value;
      return a.value + (b.value - a.value) * ((t - a.t) / segment);
    }
  }
  return last.value;
}

// Fractional-Brownian-motion displacement via recursive midpoint displacement
// (the diamond-square idea in 1-D). Endpoints are pinned at 0 so they never move
// the anchored start/end. `hurst` controls texture: lower = rougher/jaggier.
// Output is normalized so its peak absolute value is 1 (caller scales by volatility).
export function midpointDisplace(prng, n, hurst = 0.55) {
  const d = new Float64Array(n);
  if (n <= 2) return d;
  const subdivide = (lo, hi, amp) => {
    if (hi - lo < 2) return;
    const mid = (lo + hi) >> 1;
    d[mid] = (d[lo] + d[hi]) / 2 + (prng() * 2 - 1) * amp;
    const nextAmp = amp * 2 ** -hurst;
    subdivide(lo, mid, nextAmp);
    subdivide(mid, hi, nextAmp);
  };
  subdivide(0, n - 1, 1);
  let maxAbs = 0;
  for (let i = 0; i < n; i += 1) maxAbs = Math.max(maxAbs, Math.abs(d[i]));
  if (maxAbs > 0) for (let i = 0; i < n; i += 1) d[i] /= maxAbs;
  return d;
}

// Piecewise-linear baseline value at every grid time (the believable trend the
// noise rides on, passing through the journey's distinct levels).
export function baselineSeries(anchors, times) {
  return times.map((t) => interpAnchors(anchors, t));
}

// Independent fractal noise for one line: fBm + a touch of white dither, scaled to
// `volatility` peak percentage points, with the endpoints forced to 0 so the pinned
// open/close are never displaced.
export function noiseSeries(seed, n, volatility, hurst = 0.55) {
  const prng = mulberry32(seed >>> 0);
  const fbm = midpointDisplace(prng, n, hurst);
  const dither = volatility * 0.12;
  const noise = new Float64Array(n);

  for (let i = 1; i < n - 1; i += 1) {
    noise[i] = fbm[i] * volatility + (prng() * 2 - 1) * dither;
  }

  return noise;
}

// Build one dense price path. anchors must span [times[0], times[last]] and define
// the start (anchors[0].value) and end (anchors[last].value) — both are pinned
// EXACTLY into the output so the chart begins at the open and ends at the live price.
export function buildPricePath({ seed, anchors, times, volatility = 3, hurst = 0.55 }) {
  const n = times.length;
  const base = baselineSeries(anchors, times);
  const noise = noiseSeries(seed >>> 0, n, volatility, hurst);
  const startValue = clampPct(anchors[0].value);
  const endValue = clampPct(anchors[anchors.length - 1].value);
  const values = new Array(n);

  for (let i = 0; i < n; i += 1) {
    if (i === 0) values[i] = round2(startValue);
    else if (i === n - 1) values[i] = round2(endValue);
    else values[i] = round2(clampPct(base[i] + noise[i]));
  }

  return values;
}

// Build N dense paths that move INDEPENDENTLY (non-symmetric) yet always total 100%.
//
// The naive "divide the whole path by the column sum" approach re-couples the lines:
// a large outcome's noise leaks, inverted, into every other line, so two dominant
// outcomes end up near-perfect mirror images. Instead we normalize ONLY the smooth
// baselines to sum to 100, then add each line's own independent noise with the
// per-column MEAN noise removed (common-mode rejection). The mean-zero residual keeps
// the column summed to 100 without making one line's wiggles the mirror of another's.
//   outcomes: [{ id, anchors }]   (each anchors defines that outcome's start/end)
export function buildMultiPaths({ marketId, outcomes, times, volatility = 3, hurst = 0.55 }) {
  const n = times.length;
  const count = outcomes.length;
  const bases = outcomes.map((o) => baselineSeries(o.anchors, times));
  // Each outcome gets not just an independent seed but its own roughness and
  // amplitude (derived from that seed), so the lines look texturally distinct —
  // not identical wiggles flipped — even over stretches where the trend is shared.
  const noises = outcomes.map((o) => {
    const seed = hashString(`${marketId}:${o.id}`);
    const r = mulberry32(seed ^ 0x9e3779b9)();
    return noiseSeries(seed, n, volatility * (0.8 + 0.45 * r), hurst + 0.18 * (r - 0.5));
  });
  const series = {};
  outcomes.forEach((o) => { series[o.id] = new Array(n); });

  for (let i = 0; i < n; i += 1) {
    let baseSum = 0;
    let noiseMean = 0;
    for (let k = 0; k < count; k += 1) { baseSum += bases[k][i]; noiseMean += noises[k][i]; }
    if (baseSum <= 0) baseSum = 1;
    noiseMean /= count;

    let total = 0;
    let maxId = outcomes[0].id;
    let maxVal = -Infinity;
    for (let k = 0; k < count; k += 1) {
      const normalizedBase = (bases[k][i] / baseSum) * 100;
      const value = round2(clampPct(normalizedBase + (noises[k][i] - noiseMean)));
      series[outcomes[k].id][i] = value;
      total += value;
      if (value > maxVal) { maxVal = value; maxId = outcomes[k].id; }
    }
    // Absorb the (tiny) rounding/clamp residual into the largest line so columns total 100.
    const residual = round2(100 - total);
    if (residual !== 0) series[maxId][i] = round2(clampPct(series[maxId][i] + residual));
  }

  return { times, series };
}
