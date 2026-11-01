/**
 * The real map: Uttar Pradesh's boundaries from OpenStreetMap with the demo placed inside, who
 * can see which part of it, and the "right now" school measures the map colours by.
 *
 * Runs on a scratch copy of the pristine seed (the real geography is applied when the database
 * opens, from data/up-geo.json) and restores the demo database afterwards. Do not run while a
 * server holds the database.
 *
 *   npx tsx --conditions=react-server scripts/map-test.mts
 */
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DATA = join(process.cwd(), '.data');
const LIVE = join(DATA, 'karyavahi.db');
const PRISTINE = join(DATA, 'karyavahi.pristine.db');
const BACKUP = join(DATA, 'karyavahi.maptestbackup.db');
if (!existsSync(PRISTINE)) { console.error('No pristine database.'); process.exit(1); }
const swap = (from: string, to: string) => { for (const s of ['-wal', '-shm']) { try { rmSync(`${to}${s}`); } catch {} } copyFileSync(from, to); };
swap(LIVE, BACKUP);
swap(PRISTINE, LIVE);

let pass = 0, fail = 0;
try {
  const { loadSession } = await import('../src/lib/session');
  const { one, all } = await import('../src/lib/db');
  const geo = await import('../src/lib/geo');
  const now = await import('../src/lib/school-now');
  const { insideGeometry } = await import('../src/lib/ext/geogen');

  const ok = (label: string, cond: boolean, detail = '') => { if (cond) { pass++; console.log(`  ok   ${label}`); } else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); } };
  const S = (email: string) => loadSession(one<{ id: string }>('select id from users where email = ?', email)!.id)!;
  type Payload = Exclude<ReturnType<typeof geo.mapData>, { error: string }>;
  const map = (email: string, parentId?: string, h?: 'admin' | 'urban') => geo.mapData(S(email), { parentId, hierarchy: h });
  const refusedMap = (r: ReturnType<typeof geo.mapData>) => 'error' in r && r.status === 404;
  const props = (r: Payload) => r.features.features.map((f) => f.properties as Record<string, unknown>);

  console.log('--- the geography ---');
  const by = (sql: string) => Object.fromEntries(all<{ k: string; n: number }>(sql).map((r) => [r.k, Number(r.n)]));
  const src = by(`select level || ':' || geometry_source k, count(*) n from geo_units group by 1`);
  ok('the state and its 75 districts are real OpenStreetMap boundaries', src['state:osm'] === 1 && src['district:osm'] === 75, JSON.stringify(src));
  ok('blocks, clusters and schools are marked simulated', src['block:simulated'] === 18 && src['cluster:simulated'] === 140 && src['school:simulated'] === 2109);
  ok('the three cities are approximate circles', src['city:approximate'] === 3);
  ok('the demo districts carry the real names', all<{ name: string }>('select name from districts order by id').map((r) => r.name).join(',') === 'Rampur,Lucknow,Varanasi');
  ok('the state is Uttar Pradesh', one<{ name: string }>('select name from states')?.name === 'Uttar Pradesh');
  let outside = 0;
  for (const d of ['DST-01', 'DST-02', 'DST-03']) {
    const outline = JSON.parse(one<{ b: string }>('select boundary b from geo_units where id = ?', d)!.b);
    for (const s of all<{ x: number; y: number }>(`select u.centroid_lon x, u.centroid_lat y from geo_units u join schools s on s.id = u.id where s.district_id = ?`, d)) {
      if (!insideGeometry([s.x, s.y], outline)) outside++;
    }
  }
  ok('every school sits inside its real district outline', outside === 0, `${outside} outside`);

  console.log('\n--- the state view ---');
  const st = map('state.lead@demo.karyavahi.test') as Payload;
  const sp = props(st);
  ok('the state team sees all 75 districts', sp.length === 75 && st.childLevel === 'district', String(sp.length));
  ok('72 are marked as having no demo data', sp.filter((p) => p.noData === 1).length === 72);
  ok('those cannot be zoomed into', sp.filter((p) => p.noData === 1).every((p) => p.canDrill === 0));
  const demo = sp.filter((p) => !p.noData);
  ok('the three demo districts can be zoomed into', demo.length === 3 && demo.every((p) => p.canDrill === 1));
  ok('each shows its worst block and its hot clusters, not a comparison with itself',
    demo.every((p) => p.severity !== 'insufficient' && Number(p.relPp) < 0 && Number(p.hotChildren) > 0 && String(p.reason).startsWith('Worst block')),
    JSON.stringify(demo.map((p) => [p.name, p.severity, p.relPp, p.hotChildren])));
  ok('each carries the school situation counts', demo.every((p) => Number(p.schoolsCounted) > 600 && typeof p.teacherLevel === 'string'));
  ok('the payload credits OpenStreetMap', st.sources.geometry === 'osm' && st.sources.attribution.includes('OpenStreetMap'));

  console.log('\n--- each role sees its own area ---');
  const deo = map('deo.rmp@demo.karyavahi.test') as Payload;
  ok("Rampur's district officer opens on Rampur's blocks", deo.parent.id === 'DST-01' && deo.childLevel === 'block' && props(deo).length === 6);
  ok('and cannot open the state', refusedMap(map('deo.rmp@demo.karyavahi.test', 'STA-01')));
  ok('nor Lucknow', refusedMap(map('deo.rmp@demo.karyavahi.test', 'DST-02')));
  const other = sp.find((p) => p.noData === 1)!.id as string;
  ok('nor a district with no demo data', refusedMap(map('deo.rmp@demo.karyavahi.test', other)));
  ok("nor Lucknow city", refusedMap(map('deo.rmp@demo.karyavahi.test', 'CTY-02', 'urban')));
  const beo = map('beo.blk-01@demo.karyavahi.test') as Payload;
  ok("a block officer opens on their block's clusters", beo.parent.id === 'BLK-01' && beo.childLevel === 'cluster');
  ok('and cannot open the district', refusedMap(map('beo.blk-01@demo.karyavahi.test', 'DST-01')));
  const crc = map('crc.clu-001@demo.karyavahi.test') as Payload;
  ok("a cluster coordinator opens on their cluster's schools", crc.parent.id === 'CLU-001' && crc.childLevel === 'school');
  const hmId = one<{ user_id: string; scope_id: string }>(`select user_id, scope_id from user_roles where role = 'headmaster' and scope_id = 'SCH-00002'`)!;
  const hm = geo.mapData(loadSession(hmId.user_id)!, {}) as Payload;
  ok('a headmaster sees only their own school', props(hm).length === 1 && props(hm)[0].id === 'SCH-00002');
  ok("and the map does not reveal the school's staff movements to them", props(hm)[0].netTransfersOut === null);

  console.log('\n--- schools right now ---');
  const schools = props(crc);
  ok('each school carries its situation', schools.every((p) => ['teacherLevel', 'visitLevel', 'attendanceLevel', 'enrolment'].every((k) => k in p)));
  ok('and its size, for the dot', schools.every((p) => Number(p.enrolment) > 0));
  ok('a coordinator does see staff movements', schools.some((p) => typeof p.netTransfersOut === 'number'));
  const id = String(schools[0].id);
  const raw = one<{ s: number; i: number }>('select teachers_sanctioned s, teachers_in_position i from schools where id = ?', id)!;
  ok('the teacher figures are the school record', Number(schools[0].teachersShort) === Math.max(0, raw.s - raw.i));
  const lastVisit = one<{ d: string }>(`select max(visit_date) d from visits where school_id = ? and visit_date <= '2026-10-24'`, id)?.d;
  ok('days since the last visit come from the visit log', lastVisit ? Number(schools[0].daysSinceVisit) >= 0 : schools[0].daysSinceVisit === null);
  ok('a coordinator gets nothing for a school outside their cluster',
    now.schoolsNow(S('crc.clu-001@demo.karyavahi.test'), ['SCH-01893']).size === 0);

  console.log('\n--- the city view ---');
  const city = map('state.lead@demo.karyavahi.test', 'CTY-02', 'urban') as Payload;
  ok('Lucknow city shows its clusters', city.parent.name === 'Lucknow' && city.childLevel === 'cluster' && props(city).length >= 2, String(props(city).length));
  ok('with hotspot levels and school counts', props(city).every((p) => p.severity && Number(p.schoolsCounted) > 0));

  console.log('\n--- the thresholds ---');
  ok('two empty posts is critical', now.teacherLevel({ sanctioned: 5, inPosition: 3 }, 0) === 'critical');
  ok('half the posts empty is critical', now.teacherLevel({ sanctioned: 2, inPosition: 1 }, 0) === 'critical');
  ok('one empty post is significant', now.teacherLevel({ sanctioned: 6, inPosition: 5 }, 0) === 'significant');
  ok('a teacher who left unreplaced is moderate', now.teacherLevel({ sanctioned: 4, inPosition: 4 }, 1) === 'moderate');
  ok('full staff is fine', now.teacherLevel({ sanctioned: 4, inPosition: 4 }, 0) === 'stable');
  ok('never visited, or over 90 days, is critical', now.visitLevel(null) === 'critical' && now.visitLevel(91) === 'critical');
  ok('61–90, 31–60 and 30 days step down', now.visitLevel(61) === 'significant' && now.visitLevel(31) === 'moderate' && now.visitLevel(30) === 'stable');
  ok('attendance down 10, 5, 2 points step up', now.attendanceLevel(-10) === 'critical' && now.attendanceLevel(-5) === 'significant' && now.attendanceLevel(-2) === 'moderate' && now.attendanceLevel(-1.9) === 'stable');
  ok('no attendance trend is unknown, not fine', now.attendanceLevel(null) === 'insufficient');
  ok('an area is critical when half its schools are serious', now.areaLevel(['critical', 'significant', 'stable', 'stable']) === 'critical');
  ok('30% serious is significant, 15% moderate', now.areaLevel(['critical', 'stable', 'stable']) === 'significant' && now.areaLevel(['significant', ...Array(5).fill('stable')]) === 'moderate');
  ok('unknown schools do not count either way', now.areaLevel(['insufficient', 'insufficient']) === 'insufficient');
} catch (e) {
  fail++;
  console.log(`  FAIL the test crashed: ${(e as Error).stack}`);
} finally {
  const { db } = await import('../src/lib/db');
  try { db().close(); } catch { /* already closed */ }
  swap(BACKUP, LIVE);
  for (const s of ['', '-wal', '-shm']) { try { rmSync(`${BACKUP}${s}`); } catch {} }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
