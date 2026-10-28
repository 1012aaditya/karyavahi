// Date helpers. Dates are 'YYYY-MM-DD' (calendar dates in India). Timestamps are ISO UTC strings.
// Human actions are placed in IST office hours; IST = UTC+05:30.

export const DAY_MS = 86_400_000;
const IST_OFFSET_MIN = 330;

export function dateMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function msToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return msToDate(dateMs(date) + Math.round(n) * DAY_MS);
}

/** a - b in whole days */
export function diffDays(a: string, b: string): number {
  return Math.round((dateMs(a) - dateMs(b)) / DAY_MS);
}

export function istTs(date: string, hour: number, minute = 0): string {
  const ms = dateMs(date) + (hour * 60 + minute - IST_OFFSET_MIN) * 60_000;
  return new Date(ms).toISOString();
}

/** IST calendar date of a UTC timestamp */
export function tsDate(ts: string): string {
  return new Date(Date.parse(ts) + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

export function addHours(ts: string, hours: number): string {
  return new Date(Date.parse(ts) + hours * 3_600_000).toISOString();
}

export function isSunday(date: string): boolean {
  return new Date(dateMs(date)).getUTCDay() === 0;
}

export function workday(date: string): string {
  return isSunday(date) ? addDays(date, 1) : date;
}

/** Summer vacation used by the fictional state calendar: 20 May – 30 June. */
export function inVacation(date: string): boolean {
  const md = date.slice(5);
  return md >= '05-20' && md <= '06-30';
}

export function skipVacation(date: string): string {
  return inVacation(date) ? `${date.slice(0, 4)}-07-01` : date;
}

export function maxDate(...ds: string[]): string {
  return ds.reduce((a, b) => (a > b ? a : b));
}

export function minDate(...ds: string[]): string {
  return ds.reduce((a, b) => (a < b ? a : b));
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return msToDate(Date.UTC(y, m, 0));
}

export function monthsBetween(startMonth: string, endMonth: string): string[] {
  const out: string[] = [];
  let [y, m] = startMonth.split('-').map(Number);
  const [ey, em] = endMonth.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
