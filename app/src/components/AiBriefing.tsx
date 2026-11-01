'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';

/**
 * Claude's briefing. Renders what /api/ai/briefing returns — cached, freshly
 * generated, or an honest error. When the model is not configured (or fails), it shows the
 * deterministic summary computed on the server, clearly labelled as not AI. It never invents text.
 */

interface Briefing {
  headline: string; geographic_impact?: string; what_changed: string[]; priorities: { text: string; source_ids: string[] }[];
  risks: string[]; next_actions: string[]; caveat: string;
}
interface Envelope { status: 'ok' | 'unconfigured' | 'error'; briefing?: Briefing; generatedAt?: string; model?: string; cached?: boolean; message?: string; sources?: string[]; audit?: { checked: number; unsupported: string[] } }
export interface PlainBriefProps { finding: string; changed: string; geography: string; concern: string; next: string; sources: string[] }

const href = (id: string) =>
  id.startsWith('CASE-') ? `/cases/${id}` : id.startsWith('TSK-') ? `/tasks/${id}` : id.startsWith('INT-') ? `/interventions/${id}`
  : id.startsWith('FND-') ? `/findings/${id}` : id.startsWith('CMP-') ? `/complaints/${id}` : id.startsWith('SCH-') ? `/schools/${id}` : `/search?q=${id}`;

export function SourceChip({ id }: { id: string }) {
  return (
    <Link href={href(id)} className="inline-flex items-center rounded border border-brand/25 bg-brand-light px-1.5 py-px font-mono text-2xs text-brand hover:border-brand">
      {id}
    </Link>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <dt className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint">{label}</dt>
      <dd className="mt-1 text-base leading-snug text-ink">{children}</dd>
    </div>
  );
}

export function AiBriefing({ fallback, lang = 'en' }: { fallback?: PlainBriefProps; lang?: 'en' | 'hi' }) {
  const t = (en: string, hi: string) => (lang === 'hi' ? hi : en);
  const [env, setEnv] = useState<Envelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSources, setShowSources] = useState(false);

  const load = useCallback(async (force: boolean) => {
    setLoading(true);
    try {
      const r = await fetch('/api/ai/briefing', { method: force ? 'POST' : 'GET', cache: 'no-store' });
      setEnv(await r.json());
    } catch {
      setEnv({ status: 'error', message: 'Could not reach the server.' });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(false); }, [load]);

  const b = env?.status === 'ok' ? env.briefing : undefined;
  const useFallback = !b && !loading && !!fallback;
  const sources = b ? [...new Set([...(env?.sources ?? []), ...b.priorities.flatMap((p) => p.source_ids)])] : fallback?.sources ?? [];
  const stamp = env?.status === 'ok' && env.generatedAt
    ? `Claude · ${env.model} · ${new Date(env.generatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST${env.cached ? t(' · cached', ' · सहेजी हुई') : ''}`
    : useFallback ? t('Computed summary · not AI', 'गणना से बना सार · AI नहीं') : '';

  return (
    <section className="rounded-xl border border-line bg-white" aria-labelledby="brief-title" aria-busy={loading}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Icon name="sparkles" size={17} className="text-brand" />
          <h2 id="brief-title" className="text-md font-semibold tracking-tight text-ink">{t('Claude’s briefing', 'Claude की ब्रीफ़िंग')}</h2>
          {stamp ? <span className={`chip ${useFallback ? 'border-line-strong bg-paper-sunk text-ink-soft' : 'border-brand/25 bg-brand-light text-brand'}`}>{stamp}</span> : null}
        </div>
        <div className="flex items-center gap-1">
          {sources.length ? (
            <button type="button" onClick={() => setShowSources((v) => !v)} aria-expanded={showSources} className="btn-ghost btn-sm">
              <Icon name="file" size={14} />{showSources ? t('Hide supporting evidence', 'आधार छिपाएँ') : t('View supporting evidence', 'आधार देखें')}
            </button>
          ) : null}
          {env?.status !== 'unconfigured' ? (
            <button type="button" onClick={() => load(true)} disabled={loading} className="btn-ghost btn-sm" aria-label={t('Refresh brief', 'ब्रीफ़िंग ताज़ा करें')}>
              <Icon name="refresh" size={14} className={loading ? 'animate-spin' : ''} />{loading ? t('Working…', 'तैयार हो रहा है…') : t('Refresh', 'ताज़ा करें')}
            </button>
          ) : null}
        </div>
      </header>

      <div className="px-5 py-4">
        {loading && !b ? (
          <div className="grid gap-4 md:grid-cols-4" aria-label={t('Preparing brief', 'ब्रीफ़िंग तैयार हो रही है')}>
            {[0, 1, 2, 3].map((i) => <div key={i} className="space-y-2"><div className="skeleton h-3 w-24" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-4/5" /></div>)}
          </div>
        ) : b ? (
          <>
          {env?.audit && env.audit.unsupported.length > 0 ? (
            <p role="alert" className="mb-3 rounded-lg border border-warn/30 bg-warn-light px-3 py-1.5 text-xs text-warn">
              <Icon name="alert" size={13} className="mr-1 inline" />{t('Not found in the records — check these figures before relying on the briefing:', 'ये आँकड़े अभिलेखों में नहीं मिले — ब्रीफ़िंग पर भरोसा करने से पहले जाँच लें:')} <strong>{env.audit.unsupported.join(', ')}</strong>
            </p>
          ) : env?.audit && env.audit.checked > 0 ? (
            <p className="mb-3 inline-flex items-center gap-1 text-2xs text-good"><Icon name="check-circle" size={12} />{t(`${env.audit.checked} figures checked against the records`, `${env.audit.checked} आँकड़े अभिलेखों से मिलाए गए`)}</p>
          ) : null}
          <dl className={`grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-4 ${loading ? 'opacity-60' : ''}`}>
            <Field label={t('Most important finding', 'सबसे अहम निष्कर्ष')} wide><span className="text-md font-semibold">{b.headline}</span></Field>
            <Field label={t('Geographic impact', 'कहाँ असर')}>{b.geographic_impact ?? '—'}</Field>
            <Field label={t('What changed', 'क्या बदला')}>{b.what_changed[0] ?? '—'}</Field>
            <Field label={t('Main operational concern', 'मुख्य चिंता')} wide>{b.risks[0] ?? '—'}</Field>
            <Field label={t('Recommended next priority', 'अगली प्राथमिकता')} wide><span className="font-medium text-brand">{b.next_actions[0] ?? b.priorities[0]?.text ?? '—'}</span></Field>
          </dl>
          </>
        ) : useFallback ? (
          <>
            <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label={t('Most important finding', 'सबसे अहम निष्कर्ष')} wide><span className="text-md font-semibold">{fallback!.finding}</span></Field>
              <Field label={t('Geographic impact', 'कहाँ असर')}>{fallback!.geography}</Field>
              <Field label={t('What changed', 'क्या बदला')}>{fallback!.changed}</Field>
              <Field label={t('Main operational concern', 'मुख्य चिंता')} wide>{fallback!.concern}</Field>
              <Field label={t('Recommended next priority', 'अगली प्राथमिकता')} wide><span className="font-medium text-brand">{fallback!.next}</span></Field>
            </dl>
            <p className="mt-3 text-xs text-ink-faint">{env?.status === 'unconfigured' ? t('AI is not connected, so this summary is computed directly from the records.', 'AI जुड़ा नहीं है, इसलिए यह सार सीधे अभिलेखों से गणना करके बना है।') : t(`AI brief unavailable${env?.message ? ` (${env.message})` : ''}; showing the computed summary.`, `AI ब्रीफ़िंग उपलब्ध नहीं${env?.message ? ` (${env.message})` : ''}; गणना से बना सार दिखाया जा रहा है।`)}{env?.status === 'error' ? <button type="button" onClick={() => load(true)} className="ml-2 text-brand hover:underline">{t('Retry AI', 'AI फिर आज़माएँ')}</button> : null}</p>
          </>
        ) : (
          <p className="text-sm text-ink-soft">{env?.message ?? t('No brief available.', 'कोई ब्रीफ़िंग उपलब्ध नहीं।')}</p>
        )}
        {showSources && sources.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3 text-xs text-ink-faint">
            <span className="mr-1">{t('Built from:', 'आधार:')}</span>{sources.slice(0, 16).map((id) => <SourceChip key={id} id={id} />)}
          </div>
        ) : null}
      </div>
    </section>
  );
}
