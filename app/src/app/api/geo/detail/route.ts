import { getSession } from '@/lib/session';
import { authorize } from '@/lib/authz';
import { geoUnit, canOpen } from '@/lib/geo';
import { unitBreakdown, roundPair, comparableRounds, type Level } from '@/lib/hotspots';
import { listCases } from '@/lib/cases';
import { listComplaints, STATUS as CSTATUS, OPEN_STATUSES } from '@/lib/complaints';
import { competencies } from '@/lib/repo';
import { all } from '@/lib/db';
import { schoolsPred, and } from '@/lib/scope';

/**
 * Detail for one selected map area: competency breakdown, open cases, complaints, data
 * freshness and data-quality warnings. Same scope rule as the map: out-of-scope → 404.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const s = await getSession();
  if (!s || !authorize(s, 'view_map').allowed) return Response.json({ error: 'Not allowed.' }, { status: s ? 403 : 401 });
  const u = new URL(req.url).searchParams;
  const id = (u.get('id') ?? '').slice(0, 16);
  const unit = geoUnit(id);
  if (!unit || !canOpen(s, unit)) return Response.json({ error: 'Unknown area.' }, { status: 404 });
  const level = unit.level as Level | 'city';
  const grade = ['1', '2', '3'].includes(u.get('grade') ?? '') ? Number(u.get('grade')) : undefined;
  const round = comparableRounds().some((r) => r.id === u.get('round')) ? u.get('round')! : undefined;
  const comp = new Map(competencies().map((c) => [c.id, c.name_en]));
  const pair = roundPair(round);

  const breakdown = level !== 'city' ? unitBreakdown(s, level as Level, id, { grade, roundId: round }).slice(0, 6).map((b) => ({
    grade: b.grade, competency: comp.get(b.competency_id) ?? b.competency_id, prev: b.prevPct, curr: b.currPct, rel: b.relPp, severity: b.severity, n: b.nCurr,
  })) : [];

  const filter = level === 'district' ? { districtId: id } : level === 'block' ? { blockId: id } : level === 'cluster' ? { clusterId: id } : {};
  const cases = level === 'school'
    ? listCases(s, { open: true, limit: 300 }).filter((c) => c.school_ids.includes(id))
    : level === 'city' ? [] : listCases(s, { open: true, limit: 300, ...filter });
  const col = level === 'school' ? 'school_id' : level === 'city' ? null : `${level}_id`;
  const complaints = col ? listComplaints(s, { queue: 'all', limit: 500 }).filter((c) => (c as unknown as Record<string, string | null>)[col] === id && OPEN_STATUSES.includes(c.status)) : [];

  const sp = and(schoolsPred(s, 'sc'), { sql: level === 'school' ? 'sc.id = ?' : level === 'city' ? `sc.cluster_id in (select child_id from geo_relationships where parent_id = ? and hierarchy_id = 'urban')` : `sc.${level}_id = ?`, params: [id] });
  const schools = Number(all<{ n: number }>(`select count(*) n from schools sc where ${sp.sql}`, ...sp.params)[0]?.n ?? 0);
  const insufficientCells = breakdown.filter((b) => b.severity === 'insufficient').length;

  return Response.json({
    id, name: unit.name, level, geometry: unit.geometry_source, schools,
    compared: pair ? `${pair.prev.code} → ${pair.curr.code}` : null, imported: pair?.curr.import_date ?? null,
    breakdown,
    cases: cases.slice(0, 5).map((c) => ({ id: c.id, title: c.title, severity: c.severity, status: c.status })), caseCount: cases.length,
    critical: cases.filter((c) => c.severity === 'critical').length,
    complaints: complaints.slice(0, 4).map((c) => ({ id: c.id, title: c.title, status: CSTATUS[c.status]?.label ?? c.status, priority: c.priority })), complaintCount: complaints.length,
    warnings: [
      ...(insufficientCells ? [`${insufficientCells} class × competency cell${insufficientCells > 1 ? 's have' : ' has'} too few students to judge.`] : []),
      ...(unit.geometry_source !== 'verified' ? ['Boundary is illustrative, not a verified boundary.'] : []),
    ],
  });
}
