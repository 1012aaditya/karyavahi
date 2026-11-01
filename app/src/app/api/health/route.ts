/**
 * A cheap "is it up?" answer for uptime monitors and the host's health check. It touches nothing
 * else, so pinging it every few minutes (to keep a free instance awake) costs almost nothing.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { ok: true, service: 'karyavahi', time: new Date().toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
