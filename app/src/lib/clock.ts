import 'server-only';
import { getAppState, setAppState } from './db';
import { AS_OF_TS } from '@domain/catalog';

/**
 * The demo clock. The seed stops at 24 Oct 2026, 12:00 IST and the demo story asks you to
 * "advance the clock" to 20 Nov 2026 before uploading the simulated November round. Everything
 * date-dependent (overdue, reminders, due-soon) reads `today()`, never the real system date,
 * so the demo stays reproducible.
 */

export function nowIso(): string {
  return getAppState('demo_clock') ?? AS_OF_TS;
}

export function now(): Date {
  return new Date(nowIso());
}

/** 'YYYY-MM-DD' in IST, which is the timezone every date column is written in. */
export function today(): string {
  return istDate(now());
}

export function setClock(iso: string): void {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Not a date: ${iso}`);
  setAppState('demo_clock', d.toISOString());
}

export function resetClock(): void {
  setAppState('demo_clock', AS_OF_TS);
}

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function istDate(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Positive when `date` is in the past relative to the demo clock. */
export function daysAgo(date: string): number {
  return daysBetween(date.slice(0, 10), today());
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isOverdue(dueDate: string | null, submittedAt: string | null): boolean {
  if (!dueDate || submittedAt) return false;
  return dueDate.slice(0, 10) < today();
}
