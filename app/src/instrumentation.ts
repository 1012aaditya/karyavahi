/**
 * Next's start-up hook. Starts the reminder scheduler (src/lib/scheduler.ts) once per server
 * process: Node runtime only (not the edge runtime) and never while `next build` collects pages.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (process.env.KV_SCHEDULER === 'off') return;
  const { startScheduler } = await import('./lib/scheduler');
  startScheduler();
}
