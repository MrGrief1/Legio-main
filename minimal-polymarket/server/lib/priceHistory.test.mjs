// Tests for the synthetic price-history generator. Run: node server/lib/priceHistory.test.mjs
import {
  hashString, mulberry32, pickCount, buildEvenTimeGrid, dedupeConsecutive,
  buildSpreadAnchors, interpAnchors, midpointDisplace, buildPricePath, buildMultiPaths,
  DEFAULT_POINT_COUNT,
} from './priceHistory.js';

let passed = 0;
let failed = 0;

function ok(name, condition, extra = '') {
  if (condition) { passed += 1; } else { failed += 1; console.error(`  ✗ ${name} ${extra}`); }
}

// Deterministic LCG so the randomized cases are reproducible.
let seed = 987654321;
function rnd() { seed = (1103515245 * seed + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

const DAY = 86400000;

console.log('priceHistory tests');

// 1. hashString is stable and mulberry32 is deterministic for a given seed.
ok('hashString stable', hashString('mkt_abc') === hashString('mkt_abc'));
ok('hashString differs', hashString('mkt_abc') !== hashString('mkt_abd'));
{
  const a = mulberry32(42); const b = mulberry32(42);
  ok('mulberry32 deterministic', a() === b() && a() === b());
  const r = mulberry32(7)();
  ok('mulberry32 in [0,1)', r >= 0 && r < 1);
}

// 2. pickCount is bounded and falls back for near-zero spans.
for (let i = 0; i < 2000; i += 1) {
  const start = 1_700_000_000_000 + Math.floor(rnd() * DAY * 30);
  const span = Math.floor(rnd() * DAY * 730); // up to ~2y
  const c = pickCount(start, start + span);
  ok('pickCount <= default', c <= DEFAULT_POINT_COUNT, `c=${c}`);
  ok('pickCount >= 2', c >= 2, `c=${c}`);
}
ok('pickCount tiny span small', pickCount(0, 4000) <= 4, `got ${pickCount(0, 4000)}`);
ok('pickCount full span = default', pickCount(0, DAY * 14) === DEFAULT_POINT_COUNT);

// 3. buildEvenTimeGrid: strictly increasing, evenly spaced, spans endpoints.
{
  const times = buildEvenTimeGrid(1000, 1000 + DAY, 140);
  ok('grid length', times.length === 140);
  ok('grid starts at start', times[0] === 1000);
  ok('grid ends at end', times[times.length - 1] === 1000 + DAY);
  let mono = true; let maxDelta = 0; let minDelta = Infinity;
  for (let i = 1; i < times.length; i += 1) {
    if (times[i] <= times[i - 1]) mono = false;
    const d = times[i] - times[i - 1];
    maxDelta = Math.max(maxDelta, d); minDelta = Math.min(minDelta, d);
  }
  ok('grid strictly increasing', mono);
  ok('grid evenly spaced (<=1ms jitter)', maxDelta - minDelta <= 1, `delta range ${minDelta}..${maxDelta}`);
}

// 4. dedupeConsecutive collapses runs, keeps distinct moves.
ok('dedupe collapses runs', JSON.stringify(dedupeConsecutive([50, 50, 50, 79, 79, 60])) === JSON.stringify([50, 79, 60]));
ok('dedupe keeps single', dedupeConsecutive([42]).length === 1);

// 5. interpAnchors is exact at anchors and linear between.
{
  const anchors = [{ t: 0, value: 20 }, { t: 100, value: 60 }];
  ok('interp at start', interpAnchors(anchors, 0) === 20);
  ok('interp at end', interpAnchors(anchors, 100) === 60);
  ok('interp midpoint', Math.abs(interpAnchors(anchors, 50) - 40) < 1e-9);
  ok('interp clamps left', interpAnchors(anchors, -10) === 20);
  ok('interp clamps right', interpAnchors(anchors, 999) === 60);
}

// 6. midpointDisplace: endpoints zero, normalized peak ~1.
{
  const d = midpointDisplace(mulberry32(123), 129, 0.55);
  ok('fbm endpoint0 zero', d[0] === 0);
  ok('fbm endpointN zero', d[d.length - 1] === 0);
  let maxAbs = 0; for (const v of d) maxAbs = Math.max(maxAbs, Math.abs(v));
  ok('fbm normalized peak 1', Math.abs(maxAbs - 1) < 1e-9, `peak=${maxAbs}`);
}

// 7. buildPricePath: deterministic, endpoint-pinned, in range, right length.
for (let i = 0; i < 3000; i += 1) {
  const start = clampStart(1 + rnd() * 98);
  const end = clampStart(1 + rnd() * 98);
  const startTime = 1000;
  const endTime = startTime + Math.floor(1 + rnd() * DAY * 30);
  const count = pickCount(startTime, endTime);
  const times = buildEvenTimeGrid(startTime, endTime, count);
  const anchors = buildSpreadAnchors([start, end], startTime, endTime);
  const args = { seed: hashString(`mkt_${i}`), anchors, times, volatility: 1 + rnd() * 7 };
  const a = buildPricePath(args);
  const b = buildPricePath(args);
  ok('path length matches grid', a.length === times.length);
  ok('path deterministic', a.every((v, k) => v === b[k]));
  ok('path start pinned', a[0] === round2(start));
  ok('path end pinned', a[a.length - 1] === round2(end));
  ok('path in [1,99]', a.every((v) => v >= 1 && v <= 99));
}

// 8. buildPricePath traces interior milestones reasonably (anchor fidelity): with
//    zero volatility the path equals the piecewise-linear baseline exactly.
{
  const startTime = 0; const endTime = DAY; const count = 140;
  const times = buildEvenTimeGrid(startTime, endTime, count);
  const anchors = buildSpreadAnchors([10, 40, 25, 70], startTime, endTime);
  const v = buildPricePath({ seed: 1, anchors, times, volatility: 0 });
  let maxErr = 0;
  for (let i = 0; i < times.length; i += 1) maxErr = Math.max(maxErr, Math.abs(v[i] - round2(interpAnchors(anchors, times[i]))));
  ok('zero-vol path = baseline', maxErr < 0.01, `maxErr=${maxErr}`);
}

// 9. buildMultiPaths: every time-column sums to exactly 100, each series in [1,99].
for (let i = 0; i < 800; i += 1) {
  const n = 3 + Math.floor(rnd() * 3); // 3..5 outcomes
  const startTime = 0; const endTime = DAY * (1 + rnd() * 14);
  const count = pickCount(startTime, endTime);
  const times = buildEvenTimeGrid(startTime, endTime, count);
  const opens = Array.from({ length: n }, () => 1 + rnd() * 60);
  const ends = Array.from({ length: n }, () => 1 + rnd() * 60);
  const outcomes = Array.from({ length: n }, (_, k) => ({
    id: `o${k}`,
    anchors: buildSpreadAnchors([clampStart(opens[k]), clampStart(ends[k])], startTime, endTime),
  }));
  const { series } = buildMultiPaths({ marketId: `mm_${i}`, outcomes, times, volatility: 1 + rnd() * 6 });
  for (let t = 0; t < times.length; t += 1) {
    let sum = 0;
    for (const o of outcomes) {
      const val = series[o.id][t];
      ok('multi series in [1,99]', val >= 1 && val <= 99, `val=${val}`);
      sum += val;
    }
    ok('multi column sums to 100', Math.abs(sum - 100) < 1e-9, `sum=${sum}`);
  }
}

// 10. Non-symmetry/independence: 3 outcomes do not move as fixed affine mirrors —
//     the column-wise difference between two series is NOT constant.
{
  const startTime = 0; const endTime = DAY * 7; const count = 140;
  const times = buildEvenTimeGrid(startTime, endTime, count);
  const outcomes = [
    { id: 'a', anchors: buildSpreadAnchors([30, 35], startTime, endTime) },
    { id: 'b', anchors: buildSpreadAnchors([30, 33], startTime, endTime) },
    { id: 'c', anchors: buildSpreadAnchors([40, 32], startTime, endTime) },
  ];
  const { series } = buildMultiPaths({ marketId: 'mm_indep', outcomes, times, volatility: 5 });
  const diffs = times.map((_, i) => series.a[i] - series.b[i]);
  const first = diffs[0];
  const varies = diffs.some((d) => Math.abs(d - first) > 0.5);
  ok('multi lines non-symmetric (independent noise)', varies);

  // Stronger: the two lines must NOT be near-perfect mirror images. We correlate the
  // micro-deviation of each line from its own moving baseline; a multiplicative-
  // normalization mirror would give corr ≈ -1. Common-mode rejection keeps it well above.
  const detrend = (arr) => {
    const w = 7;
    return arr.map((_, i) => {
      let sum = 0; let cnt = 0;
      for (let j = Math.max(0, i - w); j <= Math.min(arr.length - 1, i + w); j += 1) { sum += arr[j]; cnt += 1; }
      return arr[i] - sum / cnt;
    });
  };
  const da = detrend(series.a);
  const db2 = detrend(series.b);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const ma = mean(da); const mb = mean(db2);
  let cov = 0; let va = 0; let vb = 0;
  for (let i = 0; i < da.length; i += 1) { cov += (da[i] - ma) * (db2[i] - mb); va += (da[i] - ma) ** 2; vb += (db2[i] - mb) ** 2; }
  const corr = cov / Math.sqrt((va || 1e-9) * (vb || 1e-9));
  ok('multi line deviations not a near-perfect mirror', corr > -0.85, `corr=${corr.toFixed(3)}`);
}

function clampStart(v) { return Math.max(1, Math.min(99, v)); }
function round2(v) { return Math.round(v * 100) / 100; }

console.log(`\n${failed === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${passed} assertions passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
