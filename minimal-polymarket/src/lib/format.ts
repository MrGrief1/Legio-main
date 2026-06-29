// Canonical economic formatters — the single source of truth for how money,
// prices, and sizes are shown (see docs §4.0 "единая модель единиц").
//
// One currency everywhere: points (pt). Price in cents IS probability in percent
// (64¢ ⇔ 64%). A winning share always pays exactly 1 point.

// Money / balance / volume / payout — always points.
export function formatPoints(value: number, locale: string, options?: { compact?: boolean }) {
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat(locale, {
    notation: options?.compact && abs >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: abs >= 100 ? 0 : 2,
  }).format(value);
  return `${formatted} pt`;
}

// Signed points for P&L (+/−), using a real minus sign.
export function formatSignedPoints(value: number, locale: string) {
  if (value === 0) return formatPoints(0, locale);
  return `${value > 0 ? '+' : '−'}${formatPoints(Math.abs(value), locale)}`;
}

// Price of a share = implied probability. Cents and percent are the same number.
export function formatCents(value: number) {
  return `${Math.round(value)}¢`;
}

export function formatPct(value: number, locale: string, maximumFractionDigits = 0) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value)}%`;
}

// Signed percent for returns / deltas (+/−).
export function formatSignedPct(value: number, locale: string, maximumFractionDigits = 1) {
  if (!Number.isFinite(value) || value === 0) return '0%';
  return `${value > 0 ? '+' : '−'}${new Intl.NumberFormat(locale, { maximumFractionDigits }).format(Math.abs(value))}%`;
}

// Position size in shares (no currency — a share is not money until it settles).
export function formatShares(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}
