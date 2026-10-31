import { getSession } from '@/lib/session';
import { authorize } from '@/lib/authz';
import { geoSearch } from '@/lib/geo';

/** Place search, limited to areas the signed-in user may open. */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const s = await getSession();
  if (!s || !authorize(s, 'view_map').allowed) return Response.json({ results: [] }, { status: s ? 403 : 401 });
  const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, 60);
  return Response.json({ results: geoSearch(s, q) });
}
