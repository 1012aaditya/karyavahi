/**
 * Smoke test for the read layer. Exercises every repository function as each demo role and
 * checks the scoping numbers quoted in the project README, which were measured against
 * Postgres RLS. If these drift, scope.ts no longer matches sql/schema.sql.
 *
 *   npx tsx scripts/smoke.ts
 */
import { loadSession } from '../src/lib/session';
import * as repo from '../src/lib/repo';
import * as cs from '../src/lib/cases';
import * as feed from '../src/lib/feed';
import { today, nowIso } from '../src/lib/clock';
import { may } from '../src/lib/guard';

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}: ${got}${ok ? '' : ` (expected ${want})`}`);
};
const show = (label: string, v: unknown) => console.log(`       ${label}: ${v}`);

const ACCOUNTS = [
  'admin@demo.karyavahi.test', 'state.lead@demo.karyavahi.test', 'auditor.state@demo.karyavahi.test',
  'deo.rmp@demo.karyavahi.test', 'beo.blk-01@demo.karyavahi.test', 'brc1.blk-01@demo.karyavahi.test',
  'crc.clu-001@demo.karyavahi.test',
];

console.log(`demo clock: ${nowIso()} (today = ${today()})\n`);

const byEmail = new Map(repo.demoAccounts().map((a) => [a.email, a]));
check('demo accounts found', byEmail.size >= 7, true);

for (const email of ACCOUNTS) {
  const acct = byEmail.get(email);
  if (!acct) { console.log(`  FAIL no account ${email}`); fails++; continue; }
  const s = loadSession(acct.id);
  if (!s) { console.log(`  FAIL no session ${email}`); fails++; continue; }

  console.log(`\n${email}  →  ${s.role} @ ${s.scope_type} ${s.scope_id} (${s.full_name})`);

  const cases = cs.listCases(s, { limit: 500 });
  const total = cs.countCases(s);
  show('cases visible', total);
  show('schools visible', repo.schoolCount(s));
  show('findings visible', cs.listFindings(s, { limit: 1000 }).length);
  show('my tasks', cs.countTasks(s, { ownerUserId: s.user_id }));
  show('tasks visible', cs.countTasks(s));
  show('proof to check', cs.countEvidenceToCheck(s));
  show('approval queue', cs.approvalQueue(s).length);
  show('notifications', feed.countUnread(s));
  show('can approve block plans', may(s, 'plan.approve_block'));
  show('can verify evidence', may(s, 'evidence.verify'));
  show('can view audit', may(s, 'audit.view'));

  // Exercise the detail reads on the first visible case, to catch SQL errors.
  if (cases.length > 0) {
    const b = cs.caseBundle(s, cases[0].id);
    if (!b) { console.log(`  FAIL bundle for ${cases[0].id}`); fails++; }
    else {
      show(`bundle ${b.case.id}`,
        `finding=${b.finding ? 'y' : 'n'} diagnosis=${b.diagnosis ? 'y' : 'n'} plans=${b.plans.length} ` +
        `approvals=${b.approvals.length} tasks=${b.tasks.length} evidence=${b.evidence.length} ` +
        `outcomes=${b.outcomes.length} events=${b.timeline.length}`);
    }
  }
  // School context reads
  const sch = repo.schoolsIn(s, { limit: 1 })[0];
  if (sch) {
    show(`school ${sch.id}`,
      `assessments=${repo.schoolAssessments(s, sch.id).length} attendance=${repo.schoolAttendance(s, sch.id).length} ` +
      `staff=${repo.schoolStaffEvents(s, sch.id).length} visits=${repo.schoolVisits(s, sch.id).length}`);
  }
  show('reports', feed.listReports(s, { limit: 500 }).length);
  show('audit rows', feed.listAudit(s, { limit: 500 }).length);
  show('ai log rows', feed.listAi(s, { limit: 500 }).length);
}

// ---- the numbers the README quotes for Postgres RLS ----
console.log('\n--- scoping checks from the project README ---');
const beo = loadSession(byEmail.get('beo.blk-01@demo.karyavahi.test')!.id)!;
const crc = loadSession(byEmail.get('crc.clu-001@demo.karyavahi.test')!.id)!;
check('BEO of BLK-01 sees cases in their block', cs.countCases(beo), 14);
check('CRC of CLU-001 sees cases', cs.countCases(crc), 2);

const hm = repo.usersByRole('headmaster', undefined, 1)[0];
const hms = loadSession(hm.id)!;
check('headmaster sees only their own school', repo.schoolCount(hms), 1);
check('headmaster sees no staff events', repo.schoolStaffEvents(hms, hms.scope_id).length, 0);
check('headmaster cannot view audit', may(hms, 'audit.view'), false);
check('headmaster cannot approve plans', may(hms, 'plan.approve_block'), false);

// Hero case must be reachable by its BEO and invisible to an unrelated block.
const hero = cs.getCase(beo, 'CASE-0184');
check('BEO can open CASE-0184', hero?.id, 'CASE-0184');
check('CASE-0184 is awaiting approval', hero?.status, 'awaiting_approval');
const otherBeo = repo.usersByRole('beo', 'BLK-09', 1)[0];
const ob = loadSession(otherBeo.id)!;
check('BLK-09 BEO cannot open CASE-0184', cs.getCase(ob, 'CASE-0184'), null);
check('...but the case does exist', cs.caseExists('CASE-0184'), true);

// State sees everything.
const state = loadSession(byEmail.get('state.lead@demo.karyavahi.test')!.id)!;
check('state sees all 215 cases', cs.countCases(state), 215);
check('state sees all 2109 schools', repo.schoolCount(state), 2109);
check('state sees all 370 findings', cs.listFindings(state, { limit: 1000 }).length, 370);

// Reference data is readable by everyone.
check('competencies', repo.competencies().length, 6);
check('rounds', repo.rounds().length, 5);
check('interventions', repo.interventions().length, 18);
check('setting versions', repo.settingVersions().length, 2);
check('intervention parses task templates', repo.interventions()[0].task_templates.length > 0, true);
check('settings parse detection block', repo.settingVersions()[1].detection.min_cluster_assessed, 100);

console.log(fails === 0 ? '\nall checks passed' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
