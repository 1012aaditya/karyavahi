import { getSession } from '@/lib/session';
import { authorize } from '@/lib/authz';
import { mapData } from '@/lib/geo';
import { comparableRounds } from '@/lib/hotspots';

/**
 * Map data for one parent unit. The session decides what is returned; every query parameter is
 * treated as a request, not as authority. Out-of-scope and unknown ids get the same 404.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const s = await getSession();
  const d = authorize(s, 'view_map');
  if (!s || !d.allowed) return Response.json({ error: d.reason || 'Sign in first.' }, { status: s ? 403 : 401 });
  const u = new URL(req.url).searchParams;
  const grade = ['1', '2', '3'].includes(u.get('grade') ?? '') ? Number(u.get('grade')) : undefined;
  const comp = /^CMP-[LN][1-3]$/.test(u.get('comp') ?? '') ? u.get('comp')! : undefined;
  const subject = u.get('subject') === 'N' || u.get('subject') === 'L' ? (u.get('subject') as 'N' | 'L') : undefined;
  const round = comparableRounds().some((r) => r.id === u.get('round')) ? u.get('round')! : undefined;
  const parent = (u.get('parent') ?? '').slice(0, 16) || undefined;
  const res = mapData(s, { parentId: parent, hierarchy: u.get('h') === 'urban' ? 'urban' : 'admin', filters: { grade, competencyId: comp, subject, roundId: round } });
  if ('error' in res) return Response.json({ error: res.error }, { status: res.status });
  return Response.json(res, { headers: { 'cache-control': 'private, no-store' } });
}
