/**
 * The nightly demo reset (scheduler.ts maybeNightlyReset): off unless KV_NIGHTLY_RESET=on, only
 * in the 03:00 India-time hour, once per night, back to the seed, and on the audit trail.
 *
 *   npx tsx --conditions=react-server scripts/nightly-reset-test.mts
 *
 * Resets the working database (run with no server open on it).
 */
const A = '../src/lib/';
const sched = await import(A + 'scheduler');
const { one, setAppState } = await import(A + 'db');
let pass = 0, fail = 0; const ok = (l: string, c: boolean) => { console.log(c ? '  ok  ' : '  FAIL', l); c ? pass++ : fail++; };
const at = (iso: string) => new Date(iso);
delete process.env.KV_NIGHTLY_RESET;
ok('off by default (a laptop keeps its changes)', sched.maybeNightlyReset(at('2026-11-01T21:45:00Z')) === false);
process.env.KV_NIGHTLY_RESET = 'on';
ok('not outside 03:00–03:59 India time (10:00 IST)', sched.maybeNightlyReset(at('2026-11-01T04:30:00Z')) === false);
setAppState('reset-probe', 'x');
ok('a change exists before the reset', one<{ value: string }>(`select value from app_state where key = 'reset-probe'`)?.value === 'x');
ok('resets at 03:15 India time (21:45 UTC the day before)', sched.maybeNightlyReset(at('2026-11-01T21:45:00Z')) === true);
ok('the change is gone: back to the seed', one(`select 1 from app_state where key = 'reset-probe'`) === null);
ok('the reset is in the audit trail', !!one(`select 1 from audit_events where action = 'demo.reset' and actor_label = 'system:nightly_reset'`));
ok('only once that night (03:50 IST)', sched.maybeNightlyReset(at('2026-11-01T22:20:00Z')) === false);
ok('again the next night', sched.maybeNightlyReset(at('2026-11-02T21:40:00Z')) === true);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
