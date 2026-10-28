/**
 * Chart colour tokens.
 *
 * These live outside charts.tsx on purpose. charts.tsx is a 'use client' module, and a plain
 * constant imported from a client module into a server component arrives as undefined — React
 * then silently drops the attribute it was meant to fill, which is how a chart ends up drawing
 * black dots and no lines. Keeping the tokens in a neutral module lets the server pages and the
 * client charts share one definition.
 *
 * The values are categorical slots 1–3 of the validated palette, checked with --pairs all
 * against this app's white chart surface: CVD ΔE 9.2, normal-vision ΔE 24.0. Aqua is below
 * 3:1 contrast on white, so charts that use it also carry direct labels and a table view.
 */

export const SERIES = {
  one: 'var(--series-1)',   // blue   — the cluster, the treated schools
  two: 'var(--series-2)',   // orange — the district, the comparison schools
  three: 'var(--series-3)', // aqua   — a third series, always directly labelled
} as const;

export const STATUS_COLOR = {
  good: 'var(--status-good)',
  warning: 'var(--status-warning)',
  serious: 'var(--status-serious)',
  critical: 'var(--status-critical)',
} as const;

/** Assign colours by entity in a fixed order, never by rank, and never cycle past three. */
export const SERIES_ORDER = [SERIES.one, SERIES.two, SERIES.three] as const;
