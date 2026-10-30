export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function sampleVariance(xs: readonly number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
}

// Two-sided 95% critical values of Student's t, df = 1..30.
const T975 = [
  NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145,
  2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

export function tCritical975(df: number): number {
  if (!Number.isFinite(df) || df < 1) return T975[1];
  if (df > 30) return 1.96 + 2.4 / df;
  const lo = Math.floor(df);
  const hi = Math.ceil(df);
  if (lo === hi) return T975[lo];
  return T975[lo] + (T975[hi] - T975[lo]) * (df - lo);
}

export function round(x: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
