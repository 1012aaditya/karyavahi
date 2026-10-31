'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';

/**
 * The AI briefing panel. It renders whatever /api/ai/briefing returns — a cached briefing, a
 * freshly generated one, an honest "not configured" notice, or an error with a retry. It never
 * fills in text of its own.
 */

interface Briefing {
  headline: string; what_changed: string[]; priorities: { text: string; source_ids: string[] }[];
  risks: string[]; next_actions: string[]; caveat: string;
}
interface Envelope { status: 'ok' | 'unconfigured' | 'error'; briefing?: Briefing; generatedAt?: string; model?: string; cached?: boolean; message?: string }

const href = (id: string) =>
  id.startsWith('CASE-') ? `/cases/${id}` : id.startsWith('TSK-') ? `/tasks/${id}` : id.startsWith('INT-') ? `/interventions/${id}`
  : id.startsWith('FND-') ? `/findings/${id}` : id.startsWith('CMP-') ? `/complaints/${id}` : id.startsWith('SCH-') ? `/schools/${id}` : `/search?q=${id}`;

export function SourceChip({ id }: { id: string }) {
  return (
    <Link href={href(id)} className="inline-flex items-center rounded border border-brand/25 bg-brand-light px-1.5 py-px font-mono text-[11px] text-brand hover:border-brand">
      {id}
    </Link>
  );
}

export function AiBriefing() {
  const [env, setEnv] = useState<Envelope | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force: boolean) => {
    setLoading(true);
    try {
      const r = await fetch('/api/ai/briefing', { method: force ? 'POST' : 'GET', cache: 'no-store' });
      setEnv(await r.json());
    } catch {
      setEnv({ status: 'error', message: 'Could not reach the server.' });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(false); }, [load]);

  const b = env?.briefing;
  return (
    <section className="card overflow-hidden" aria-labelledby="ai-brief-title" aria-busy={loading}>
      <header className="flex items-center justify-between gap-3 border-b border-line bg-gradient-to-r from-brand-light/70 to-white px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white"><Icon name="sparkles" size={17} /></span>
          <div>
            <h2 id="ai-brief-title" className="text-[15px] font-semibold text-ink">AI briefing</h2>
            <p className="text-[11.5px] text-ink-faint">
              {env?.status === 'ok' && env.generatedAt
                ? `Generated ${new Date(env.generatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST · ${env.model}${env.cached ? ' · cached' : ''}`
                : 'Narrates the figures on this page. It does not compute them.'}
            </p>
          </div>
        </div>
        {env?.status !== 'unconfigured' ? (
          <button type="button" onClick={() => load(true)} disabled={loading} className="btn-ghost btn-sm" aria-label="Refresh briefing">
            <Icon name="refresh" size={15} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{loading ? 'Working…' : 'Refresh'}</span>
          </button>
        ) : null}
      </header>

      <div className="p-4 sm:p-5">
        {loading && !b ? (
          <div className="space-y-3" aria-label="Generating briefing">
            <div className="skeleton h-5 w-4/5" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-11/12" /><div className="skeleton h-4 w-2/3" />
            <p className="pt-1 text-[12px] text-ink-faint">Reading your dashboard summary…</p>
          </div>
        ) : env?.status === 'unconfigured' ? (
          <div className="flex items-start gap-3 rounded-lg border border-warn/30 bg-warn-light px-3.5 py-3 text-[13px] text-ink">
            <Icon name="info" size={17} className="mt-px text-warn" />
            <div><p className="font-semibold">AI is not connected</p><p className="mt-0.5 text-ink-soft">{env.message}</p></div>
          </div>
        ) : env?.status === 'error' && !b ? (
          <div className="flex items-start gap-3 rounded-lg border border-crit/30 bg-crit-light px-3.5 py-3 text-[13px]">
            <Icon name="alert" size={17} className="mt-px text-crit" />
            <div className="flex-1"><p className="font-semibold text-crit">Briefing unavailable</p><p className="mt-0.5 text-ink-soft">{env.message}</p></div>
            <button type="button" onClick={() => load(true)} className="btn-quiet btn-sm">Retry</button>
          </div>
        ) : b ? (
          <div className={`space-y-4 ${loading ? 'opacity-60' : ''}`}>
            <p className="text-[16px] font-semibold leading-snug text-ink">{b.headline}</p>
            {b.what_changed.length ? (
              <ul className="space-y-1.5 text-[13.5px] text-ink-soft">
                {b.what_changed.map((x, i) => <li key={i} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-navy-300" />{x}</li>)}
              </ul>
            ) : null}
            {b.priorities.length ? (
              <div>
                <p className="label mb-1.5">Priorities</p>
                <ol className="space-y-2">
                  {b.priorities.map((p, i) => (
                    <li key={i} className="flex gap-2.5 text-[13.5px] text-ink">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-navy text-[11px] font-semibold text-white">{i + 1}</span>
                      <span>{p.text} {p.source_ids.map((id) => <SourceChip key={id} id={id} />)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              {b.risks.length ? (
                <div><p className="label mb-1.5">Risks</p><ul className="space-y-1 text-[13px] text-ink-soft">{b.risks.map((x, i) => <li key={i} className="flex gap-2"><Icon name="alert" size={14} className="mt-0.5 text-warn" />{x}</li>)}</ul></div>
              ) : null}
              {b.next_actions.length ? (
                <div><p className="label mb-1.5">Next actions</p><ul className="space-y-1 text-[13px] text-ink-soft">{b.next_actions.map((x, i) => <li key={i} className="flex gap-2"><Icon name="arrow-right" size={14} className="mt-0.5 text-brand" />{x}</li>)}</ul></div>
              ) : null}
            </div>
            <p className="border-t border-line pt-3 text-[12px] text-ink-faint">{b.caveat} AI-written from computed figures; it carries no authority.</p>
            {env?.message ? <p className="text-[12px] text-warn">{env.message}</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
