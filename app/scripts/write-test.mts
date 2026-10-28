/**
 * Tests the guarded write layer against the rules in sql/schema.sql.
 *
 * Runs on a scratch copy of the database and restores it afterwards, so it can be run against
 * a working demo without disturbing it.
 *
 *   npx tsx --conditions=react-server scripts/write-test.ts
 */
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DATA = join(process.cwd(), '.data');
const LIVE = join(DATA, 'karyavahi.db');
const PRISTINE = join(DATA, 'karyavahi.pristine.db');
const BACKUP = join(DATA, 'karyavahi.testbackup.db');

if (!existsSync(PRISTINE)) { console.error('Run npm run db:build first.'); process.exit(1); }

/** WAL means the database is three files; swapping one and leaving the journal replays it. */
const swap = (from: string, to: string) => {
  for (const sfx of ['-wal', '-shm']) { try { rmSync(`${to}${sfx}`); } catch {} }
  copyFileSync(from, to);
};
swap(LIVE, BACKUP);      // keep whatever state the demo was in
swap(PRISTINE, LIVE);    // test from a known-good seed

const { loadSession } = await import('../src/lib/session');
const repo = await import('../src/lib/repo');
const cs = await import('../src/lib/cases');
const feed = await import('../src/lib/feed');
const w = await import('../src/lib/write');
const { Refused } = await import('../src/lib/guard');
const { one, closeDb } = await import('../src/lib/db');
const { settingsInForce } = await import('../src/lib/settings');

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
};
/** Asserts the call is refused, and that the refusal says why in the expected way. */
function refused(label: string, fn: () => unknown, codeWanted?: string) {
  try {
    fn();
    fail++; console.log(`  FAIL ${label} — it was ALLOWED`);
  } catch (e) {
    const r = e instanceof Refused ? e : null;
    if (!r) { fail++; console.log(`  FAIL ${label} — threw ${(e as Error).message}`); return; }
    if (codeWanted && r.code !== codeWanted) {
      fail++; console.log(`  FAIL ${label} — refused as "${r.code}", wanted "${codeWanted}"`);
      return;
    }
    pass++; console.log(`  ok   ${label}  [${r.code}] ${r.message}`);
  }
}

const byEmail = new Map(repo.demoAccounts().map((a) => [a.email, a]));
const sess = (email: string) => loadSession(byEmail.get(email)!.id)!;
const beo = sess('beo.blk-01@demo.karyavahi.test');
const crc = sess('crc.clu-001@demo.karyavahi.test');
const brc = sess('brc1.blk-01@demo.karyavahi.test');
const deo = sess('deo.rmp@demo.karyavahi.test');
const state = sess('state.lead@demo.karyavahi.test');
const auditor = sess('auditor.state@demo.karyavahi.test');
const admin = sess('admin@demo.karyavahi.test');
const otherBeo = loadSession(repo.usersByRole('beo', 'BLK-09', 1)[0].id)!;

console.log('\n— lifecycle —');
refused('a case cannot jump from awaiting_approval straight to closed',
  () => w.transitionCase(beo, 'CASE-0184', 'closed'), 'illegal_transition');
ok('the refusal was written to the audit chain as a failure',
  (one<{ c: number }>(
    `select count(*) c from audit_events where entity_id = 'CASE-0184'
       and action = 'case.status_change_refused' and result = 'failure'`)?.c ?? 0) > 0);

const heroPlanId = cs.getCase(beo, 'CASE-0184')!.current_plan_id!;
refused('sending a plan back needs a written reason',
  () => w.decidePlan(beo, { caseId: 'CASE-0184', planId: heroPlanId, decision: 'revision_requested' }),
  'reason_required');
refused('a plan from another case is rejected as a mismatch',
  () => w.decidePlan(beo, { caseId: 'CASE-0184', planId: 'PLN-00001', decision: 'approved' }), 'mismatch');

console.log('\n— scope —');
refused('a BEO from another block cannot touch CASE-0184',
  () => w.transitionCase(otherBeo, 'CASE-0184', 'approved'), 'scope');
refused('a case that does not exist is reported as missing, not as out of scope',
  () => w.transitionCase(beo, 'CASE-9999', 'approved'), 'not_found');

console.log('\n— who may decide —');
refused('a CRC cannot approve a plan', () => w.transitionCase(crc, 'CASE-0184', 'approved'), 'lever');
refused('a BRC cannot approve a plan', () => w.transitionCase(brc, 'CASE-0184', 'approved'), 'lever');
refused('an auditor cannot approve a plan', () => w.transitionCase(auditor, 'CASE-0184', 'approved'), 'lever');
refused('the demo admin cannot approve a plan either',
  () => w.transitionCase(admin, 'CASE-0184', 'approved'), 'lever');

// A district-lever case must not be decidable by a BEO.
const districtCase = cs.listCases(state, { lever: 'district', status: ['awaiting_approval'], limit: 1 })[0]
  ?? cs.listCases(state, { lever: 'district', limit: 1 })[0];
if (districtCase) {
  const beoOfThat = loadSession(repo.usersByRole('beo', districtCase.block_id, 1)[0].id)!;
  refused(`a BEO cannot decide the district-lever case ${districtCase.id}`,
    () => w.transitionCase(beoOfThat, districtCase.id, 'approved'), 'lever');
}

console.log('\n— separation of duties —');
const mine = cs.listTasks(crc, { ownerUserId: crc.user_id, limit: 50 });
let selfVerified = false;
for (const t of mine) {
  const ev = cs.taskEvidence(crc, t.id).find((e) => e.submitted_by === crc.user_id && e.status === 'pending');
  if (ev) {
    refused('nobody can verify evidence they submitted themselves',
      () => w.verifyEvidence(crc, { evidenceId: ev.id, accept: true }), 'separation_of_duties');
    ok('the refused self-verification is in the audit chain',
      (one<{ c: number }>(
        `select count(*) c from audit_events where entity_id = ? and action = 'evidence.verify_refused'`,
        ev.id)?.c ?? 0) > 0);
    selfVerified = true;
    break;
  }
}
if (!selfVerified) console.log('  --   (no pending self-submitted proof in the seed to test against)');

const toCheck = cs.evidenceToCheck(beo, { limit: 5 });
ok('the BEO has proof to check that is not their own', toCheck.length > 0);
if (toCheck.length > 0) {
  refused('sending proof back needs a reason',
    () => w.verifyEvidence(beo, { evidenceId: toCheck[0].id, accept: false }), 'reason_required');
  const r = w.verifyEvidence(beo, { evidenceId: toCheck[0].id, accept: true, method: 'desk_review' });
  ok('the BEO can accept someone else\'s proof', r.status === 'verified');
  refused('the same proof cannot be decided twice',
    () => w.verifyEvidence(beo, { evidenceId: toCheck[0].id, accept: true }), 'already_decided');
}

console.log('\n— closing needs proof —');
const pending = cs.listCases(beo, { status: ['outcome_pending'], limit: 20 });
const blocked = pending.find((c) => {
  const o = cs.caseOutcomes(beo, c.id);
  return o.length === 0 || !o.some((x) => x.closure_eligible);
});
if (blocked) {
  refused(`${blocked.id} cannot be closed without an eligible outcome`,
    () => w.transitionCase(beo, blocked.id, 'closed'), 'closure_blocked');
} else console.log('  --   (every outcome_pending case in scope is already eligible)');

const inProgress = cs.listCases(beo, { status: ['in_progress'], limit: 20 });
const withUnverified = inProgress.find((c) => {
  const t = cs.caseTasks(beo, c.id);
  return t.length > 0 && t.some((x) => !x.verified_at);
});
if (withUnverified) {
  // in_progress → awaiting_verification is a legal move; the proof gate sits on the next one.
  const moved = w.transitionCase(beo, withUnverified.id, 'awaiting_verification');
  ok(`${withUnverified.id} may move to awaiting_verification`, moved.to === 'awaiting_verification');
  refused(`${withUnverified.id} cannot reach the outcome check with unverified tasks`,
    () => w.transitionCase(beo, withUnverified.id, 'outcome_pending'), 'unverified_tasks');
  ok('that refusal is in the audit chain too',
    feed.auditFor(auditor, 'case', withUnverified.id).some(
      (a) => a.action === 'case.status_change_refused' && a.result === 'failure'));
} else console.log('  --   (no in_progress case with unverified tasks in scope)');

const avCases = cs.listCases(state, { status: ['awaiting_verification'], limit: 60 });
const noCross = avCases.find((c) => {
  const t = cs.caseTasks(state, c.id);
  return t.length > 0 && t.every((x) => x.verified_at) && !t.some((x) => x.cross_source && x.verified_at);
});
if (noCross) {
  const officer = loadSession(repo.usersByRole('beo', noCross.block_id, 1)[0].id)!;
  refused(`${noCross.id} needs an independent check before the outcome stage`,
    () => w.transitionCase(officer, noCross.id, 'outcome_pending'), 'no_cross_source');
} else console.log('  --   (no case in scope is delivered but lacking an independent check)');

console.log('\n— the happy path on CASE-0184 —');
const before = cs.getCase(beo, 'CASE-0184')!;
ok('CASE-0184 starts awaiting approval', before.status === 'awaiting_approval', before.status);
const approval = cs.caseApprovals(beo, 'CASE-0184').find((a) => a.decision === 'pending');
ok('there is a pending approval row', !!approval);
const planId = before.current_plan_id!;
const decided = w.decidePlan(beo, { caseId: 'CASE-0184', planId, decision: 'approved' });
ok('the BEO approves the block-lever plan', decided.to === 'approved', decided.to);
ok('the approval row records who decided it',
  cs.caseApprovals(beo, 'CASE-0184').some((a) => a.decision === 'approved' && a.decided_by === beo.user_id));
ok('the plan is now approved',
  cs.planById(beo, planId)?.status === 'approved');
ok('a case event was written',
  cs.caseTimeline(beo, 'CASE-0184').some((e) => e.to_status === 'approved'));
ok('the audit chain recorded the status change',
  feed.auditFor(auditor, 'case', 'CASE-0184').some((a) => a.action === 'case.status_changed'));
const assigned = w.transitionCase(beo, 'CASE-0184', 'assigned');
ok('the case moves on to assigned', assigned.to === 'assigned');

console.log('\n— reminder sweep is idempotent —');
const first = w.reminderSweep(admin);
const second = w.reminderSweep(admin);
ok('a second sweep on the same day sends nothing again',
  second.remindersSent === 0 && second.escalationsCreated === 0,
  JSON.stringify(second));
console.log(`       first sweep: ${JSON.stringify(first)}`);

console.log('\n— outcome recompute matches the stored evaluation —');
// Re-derive every stored evaluation across the whole state, each on its own terms.
let checked = 0, agreed = 0;
for (const c of cs.listCases(state, { limit: 300 })) {
  for (const o of cs.caseOutcomes(state, c.id)) {
    const again = w.recomputeOutcome(state, c.id, { evaluationId: o.id });
    checked++;
    if (again.agreesWithStored) agreed++;
    else {
      console.log(`  FAIL ${c.id}/${o.id}: re-derived ${again.did}/${again.category} ` +
        `vs stored ${o.did_pp}/${o.category} (${again.baselineRoundId}→${again.followupRoundId})`);
    }
  }
}
ok(`every stored outcome evaluation re-derives from raw rows (${agreed}/${checked})`, agreed === checked);

console.log('\n— the audit chain still verifies after all those writes —');
const chain = feed.verifyAuditChain(auditor);
ok(`chain links hold across ${chain.checked.toLocaleString('en-IN')} rows`, chain.linked,
  chain.firstBreakAt ? `first break at ${chain.firstBreakAt}` : '');
ok('the chain starts from the genesis hash', chain.genesisOk);

console.log('\n— tampering is detected —');
{
  const { run } = await import('../src/lib/db');
  const target = one<{ id: string; reason: string | null }>(
    `select id, reason from audit_events where hash_version = 'ts-json-v1' order by ts limit 1 offset 500`);
  if (target) {
    const before = feed.verifyAuditChain(auditor);
    ok('the chain verifies before tampering', before.linked && before.contentOk);
    // Edit a row's contents while leaving every hash in place — the kind of change that
    // linkage alone cannot see.
    run('update audit_events set reason = ? where id = ?', 'tampered by the test', target.id);
    const after = feed.verifyAuditChain(auditor);
    ok('an edited row fails the content check', !after.contentOk, JSON.stringify(after).slice(0, 120));
    ok('the content break is reported at the edited row', after.firstContentBreakAt === target.id,
      String(after.firstContentBreakAt));
    ok('the links still join up, which is why re-hashing is needed', after.linked);
    run('update audit_events set reason = ? where id = ?', target.reason, target.id);
    const restored = feed.verifyAuditChain(auditor);
    ok('restoring the row restores the chain', restored.contentOk && restored.linked);
  } else {
    console.log('  --   (no ts-json-v1 audit row to tamper with)');
  }
}

console.log('\n— role refusals on the demo controls —');
refused('a BEO cannot reset the demo', () => w.demoReset(beo), 'role');
refused('a CRC cannot move the demo clock', () => w.setDemoClock(crc, '2026-11-20T06:30:00Z'), 'role');
w.setDemoClock(admin, '2026-11-20T06:30:00.000Z');
ok('the demo admin can move the clock',
  one<{ value: string }>(`select value from app_state where key = 'demo_clock'`)?.value.startsWith('2026-11-20') === true);

console.log('\n— the nightly sweep is not open to anyone signed in —');
refused('a BEO cannot run the sweep', () => w.reminderSweep(beo), 'role');
refused('a CRC cannot run the sweep', () => w.reminderSweep(crc), 'role');
refused('nor the state team', () => w.reminderSweep(state), 'role');
ok('a human sweep is attributed to whoever ran it',
  (one<{ c: number }>(`select count(*) c from audit_events where action = 'system.sweep_run' and actor_user_id = ?`, admin.user_id)?.c ?? 0) > 0);

console.log('\n— thresholds —');
const curr = settingsInForce();
const goodSettings = {
  detection: curr.detection, outcome: curr.outcome, reminders: curr.reminders,
  diagnosis: curr.diagnosis, closureRules: curr.closure_rules, changeNote: 'test',
};
refused('a BEO cannot change the thresholds', () => w.saveSettingVersion(beo, goodSettings), 'role');
refused('a change needs a written note', () => w.saveSettingVersion(admin, { ...goodSettings, changeNote: ' ' }), 'reason_required');
refused('a threshold must be a number',
  () => w.saveSettingVersion(admin, { ...goodSettings, detection: { ...curr.detection, materiality_pp: NaN } }), 'bad_input');
refused('the severity ladder must be coherent',
  () => w.saveSettingVersion(admin, { ...goodSettings, detection: { ...curr.detection, severity_critical_pp: 4, severity_high_pp: 9 } }), 'bad_input');

const beforeV1 = JSON.stringify(one(`select * from setting_versions where id = 'SET-v1'`));
const saved = w.saveSettingVersion(admin, {
  ...goodSettings,
  detection: { ...curr.detection, materiality_pp: 10 },
  changeNote: 'Raised materiality to 10pp for the test.',
});
ok('saving creates the next version', saved.id === 'SET-v3' && saved.version === 3, saved.id);
ok('it is insert-only: SET-v1 is untouched',
  JSON.stringify(one(`select * from setting_versions where id = 'SET-v1'`)) === beforeV1);
ok('the new version governs today', settingsInForce().detection.materiality_pp === 10);
ok('an older date still resolves to the older version', settingsInForce('2025-08-01').id === 'SET-v1');
ok('the change is in the audit chain',
  (one<{ c: number }>(`select count(*) c from audit_events where action = 'settings.changed' and entity_id = 'SET-v3'`)?.c ?? 0) === 1);

console.log('\n— accounts —');
const victim = repo.usersByRole('headmaster', undefined, 1)[0];
refused('a BEO cannot switch an account off',
  () => w.setUserStatus(beo, { userId: victim.id, status: 'inactive', reason: 'x' }), 'role');
refused('you cannot switch off your own account',
  () => w.setUserStatus(admin, { userId: admin.user_id, status: 'inactive', reason: 'x' }), 'self');
refused('nor the last active demo administrator',
  () => w.setUserStatus(state, { userId: admin.user_id, status: 'inactive', reason: 'x' }), 'last_holder');
refused('switching off needs a reason',
  () => w.setUserStatus(admin, { userId: victim.id, status: 'inactive', reason: ' ' }), 'reason_required');
w.setUserStatus(admin, { userId: victim.id, status: 'inactive', reason: 'left the service' });
ok('a switched-off account cannot sign in', loadSession(victim.id) === null);
ok('switching off is in the audit chain',
  (one<{ c: number }>(`select count(*) c from audit_events where action = 'user.deactivated' and entity_id = ?`, victim.id)?.c ?? 0) === 1);
refused('and it cannot be switched off twice',
  () => w.setUserStatus(admin, { userId: victim.id, status: 'inactive', reason: 'again' }), 'no_change');
w.setUserStatus(admin, { userId: victim.id, status: 'active', reason: 'reinstated' });
ok('switching it back on restores the session', loadSession(victim.id) !== null);

console.log('\n— the chain still verifies after all of that —');
const afterAll = feed.verifyAuditChain(auditor);
ok('links hold', afterAll.linked, JSON.stringify(afterAll).slice(0, 120));
ok('contents re-hash', afterAll.contentOk);

// restore whatever the demo looked like before the test.
// The connection opened above is still live. Left open, SQLite checkpoints its WAL pages over
// the file copied in below as this process exits, splicing the test's own writes back into the
// demo it was supposed to leave untouched. Close it first, exactly as restorePristine() does.
closeDb();
swap(BACKUP, LIVE);
// The demo is back; the 70 MB copy of it is not needed. Removed only after the restore above
// has run, so a test that dies partway still leaves the backup as the one way back.
for (const sfx of ['', '-wal', '-shm']) { try { rmSync(`${BACKUP}${sfx}`); } catch {} }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
