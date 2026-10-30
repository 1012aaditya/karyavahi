import Link from 'next/link';
import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { interventions, competencies } from '@/lib/repo';
import { getCase } from '@/lib/cases';
import { matchForCase, interventionHistory, authorityFor, type InterventionMatch } from '@/lib/studio';
import { pick } from '@/lib/i18n';
import { PageHead, fmtInr } from '@/components/ui';
import { EvidenceStrength } from '@/components/labels';
import { Icon } from '@/components/Icon';
import type { Intervention } from '@domain/types';

/**
 * Intervention Studio. Without a case it is the catalogue, filterable. Opened from a case
 * (?case=CASE-0184) it ranks the catalogue against that case with transparent, rule-based
 * points and lets the officer pick two or three to compare side by side.
 *
 * Three cards cite published evidence (flagged: verify before production); fifteen make no
 * effect-size claim at all. Every cost is illustrative.
 */

type SP = { case?: string; subject?: string; category?: string; lever?: string; evidence?: string };

const CATEGORY: Record<string, string> = {
  numeracy: 'Numeracy', literacy: 'Literacy', attendance: 'Attendance', teacher_support: 'Teacher support', staffing: 'Staffing', materials: 'Materials',
};

export default async function StudioPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await pageSession();
  const lang = await getLanguage();
  const sp = await searchParams;

  const caseId = sp.case && getCase(session, sp.case.toUpperCase()) ? sp.case.toUpperCase() : undefined;
  const ranked = caseId ? matchForCase(session, caseId) : null;
  const hist = interventionHistory();
  const comps = new Map(competencies().map((c) => [c.id, pick(lang, c.name_en, c.name_hi)]));

  const rows: { iv: Intervention; m: InterventionMatch | null }[] = ranked
    ? ranked.matches.map((m) => ({ iv: m.intervention, m }))
    : interventions().map((iv) => ({ iv, m: null }));
  const shown = rows.filter(({ iv }) =>
    (!sp.subject || iv.domains.includes(sp.subject as 'literacy' | 'numeracy')) &&
    (!sp.category || iv.category === sp.category) &&
    (!sp.lever || iv.lever === sp.lever) &&
    (!sp.evidence || iv.evidence.status === sp.evidence));

  const link = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, String(v));
    return `/interventions${p.toString() ? `?${p}` : ''}`;
  };
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-[12.5px] ${on ? 'border-navy bg-navy text-white' : 'border-line-strong bg-white text-ink-soft hover:border-ink-faint hover:text-ink'}`;
  const sourced = rows.filter((r) => r.iv.evidence.status === 'sourced_summary_verify').length;

  return (
    <div className="space-y-5">
      <PageHead
        title={pick(lang, 'Intervention studio', 'हस्तक्षेप स्टूडियो')}
        sub={pick(lang,
          'Choose what to do about a learning drop: what each option targets, what it needs, what it costs, who can approve it, and what the evidence actually says.',
          'गिरावट पर क्या करें — लक्ष्य, आवश्यकता, लागत, स्वीकृति अधिकार और आधार।')}
        right={<Link href={`/interventions/compare${caseId ? `?case=${caseId}` : ''}`} className="btn-quiet"><Icon name="scale" size={15} />{pick(lang, 'Compare options', 'तुलना')}</Link>}
      />

      {ranked && caseId ? (
        <section className="card flex flex-wrap items-start justify-between gap-4 border-brand/30 bg-brand-light/40 p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-brand">Ranked for {caseId}</p>
            <p className="mt-0.5 text-[15px] font-semibold text-ink">{ranked.caseTitle}</p>
            {ranked.factors.length ? <p className="mt-1 text-[12.5px] text-ink-soft">Diagnosis: {ranked.factors.map((f) => f.label).join(' · ')}</p> : null}
            <p className="mt-1.5 text-[11.5px] text-ink-faint">Points come from listed rules (competency fit, condition fit, cited evidence, ledger history). They are not a predicted effect.</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/cases/${caseId}#plan`} className="btn-quiet btn-sm">Back to case</Link>
            <Link href="/interventions" className="btn-ghost btn-sm">Clear case</Link>
          </div>
        </section>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-white px-4 py-3 shadow-card"><p className="label">Cards</p><p className="kpi-num mt-1.5 text-ink">{rows.length}</p></div>
          <div className="rounded-xl border border-line bg-white px-4 py-3 shadow-card"><p className="label">Cite a published source</p><p className="kpi-num mt-1.5 text-warn">{sourced}</p><p className="mt-1 text-[12px] text-ink-faint">flagged: verify before production</p></div>
          <div className="rounded-xl border border-line bg-white px-4 py-3 shadow-card"><p className="label">Make no effect claim</p><p className="kpi-num mt-1.5 text-ink">{rows.length - sourced}</p><p className="mt-1 text-[12px] text-ink-faint">plausible, unevidenced here</p></div>
        </div>
      )}

      <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5"><span className="label mr-1">Subject</span>
          <Link href={link({ subject: undefined })} className={chip(!sp.subject)}>All</Link>
          <Link href={link({ subject: 'numeracy' })} className={chip(sp.subject === 'numeracy')}>Numeracy</Link>
          <Link href={link({ subject: 'literacy' })} className={chip(sp.subject === 'literacy')}>Literacy</Link>
        </div>
        <div className="flex flex-wrap items-center gap-1.5"><span className="label mr-1">Type</span>
          <Link href={link({ category: undefined })} className={chip(!sp.category)}>All</Link>
          {Object.entries(CATEGORY).map(([k, v]) => <Link key={k} href={link({ category: k })} className={chip(sp.category === k)}>{v}</Link>)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5"><span className="label mr-1">Authority</span>
          <Link href={link({ lever: undefined })} className={chip(!sp.lever)}>All</Link>
          <Link href={link({ lever: 'block' })} className={chip(sp.lever === 'block')}>Block</Link>
          <Link href={link({ lever: 'district' })} className={chip(sp.lever === 'district')}>District</Link>
          <Link href={link({ lever: 'pab' })} className={chip(sp.lever === 'pab')}>PAB</Link>
        </div>
        <div className="flex flex-wrap items-center gap-1.5"><span className="label mr-1">Evidence</span>
          <Link href={link({ evidence: undefined })} className={chip(!sp.evidence)}>All</Link>
          <Link href={link({ evidence: 'sourced_summary_verify' })} className={chip(sp.evidence === 'sourced_summary_verify')}>Cites a source</Link>
          <Link href={link({ evidence: 'illustrative' })} className={chip(sp.evidence === 'illustrative')}>No effect claim</Link>
        </div>
      </div>

      <form method="get" action="/interventions/compare">
        {caseId ? <input type="hidden" name="case" value={caseId} /> : null}
        <div className="sticky top-[88px] z-10 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white/95 px-4 py-2.5 shadow-card backdrop-blur">
          <p className="text-[13px] text-ink-soft">Tick two or three options, then compare them side by side. <span className="text-ink-faint">{shown.length} shown</span></p>
          <button type="submit" className="btn-primary btn-sm"><Icon name="scale" size={14} />Compare selected</button>
        </div>

        {shown.length === 0 ? <p className="card px-6 py-12 text-center text-[13.5px] text-ink-faint">No interventions match these filters.</p> : null}

        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map(({ iv, m }, idx) => {
            const h = hist.get(iv.id);
            const auth = m?.authority ?? authorityFor(session, iv.lever);
            return (
              <li key={iv.id} className={`flex flex-col rounded-xl border bg-white shadow-card ${m && !m.eligible ? 'border-line opacity-70' : m?.isCurrentPlan ? 'border-brand ring-1 ring-brand/30' : 'border-line'}`}>
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[11.5px] text-ink-faint">{iv.id} · {CATEGORY[iv.category]}{m && m.eligible ? ` · #${idx + 1}` : ''}</p>
                      <Link href={`/interventions/${iv.id}${caseId ? `?case=${caseId}` : ''}`} className="mt-0.5 block text-[15px] font-semibold leading-snug text-ink hover:text-brand">{iv.name}</Link>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong px-2 py-1 text-[12px] text-ink-soft hover:border-brand">
                      <input type="checkbox" name="id" value={iv.id} className="h-3.5 w-3.5 accent-[#0f766e]" defaultChecked={Boolean(m?.isCurrentPlan)} />Compare
                    </label>
                  </div>
                  <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-ink-soft">{iv.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m?.isCurrentPlan ? <span className="chip border-brand/30 bg-brand-light text-brand">Current plan</span> : null}
                    <EvidenceStrength status={iv.evidence.status} lang={lang} />
                    <span className={`chip ${auth.canApprove ? 'border-good/30 bg-good-light text-good' : 'border-line-strong bg-paper-sunk text-ink-soft'}`}>{iv.lever} lever{auth.canApprove ? ' · you can approve' : ''}</span>
                    <span className="chip border-line-strong bg-white text-ink-soft">Class {iv.grades.join(', ')}</span>
                  </div>
                  {m ? (
                    m.eligible ? (
                      <div className="mt-3 rounded-lg bg-paper-sunk px-3 py-2">
                        <p className="flex items-center justify-between text-[12px] font-semibold text-ink">Fit to {caseId}<span className="tnum rounded bg-navy px-1.5 py-0.5 text-[11px] text-white">{m.points} pts</span></p>
                        <ul className="mt-1 space-y-0.5 text-[12px] text-ink-soft">{m.reasons.slice(0, 3).map((r) => <li key={r.text}>+{r.points} {r.text}</li>)}</ul>
                        {m.risks.length ? <p className="mt-1 text-[12px] text-warn"><Icon name="alert" size={12} className="mr-1 inline" />{m.risks[0].text}</p> : null}
                      </div>
                    ) : <p className="mt-3 text-[12px] text-ink-faint">Not a fit: {m.excludedBecause}</p>
                  ) : (
                    <p className="mt-3 text-[12px] text-ink-faint">Targets: {iv.competency_ids.map((c) => comps.get(c) ?? c).join(', ')}</p>
                  )}
                </div>
                <dl className="grid grid-cols-3 divide-x divide-line border-t border-line text-center text-[12px]">
                  <div className="px-2 py-2"><dt className="text-ink-faint">Cost</dt><dd className="tnum font-medium text-ink" title={`${iv.cost_basis.unit} — illustrative`}>{fmtInr(iv.cost_basis.amount_inr)}<span className="block text-[10.5px] font-normal text-ink-faint">{iv.cost_basis.unit}</span></dd></div>
                  <div className="px-2 py-2"><dt className="text-ink-faint">Duration</dt><dd className="font-medium text-ink">{iv.duration_weeks ? `${iv.duration_weeks} weeks` : 'PAB cycle'}</dd></div>
                  <div className="px-2 py-2"><dt className="text-ink-faint">Ledger</dt><dd className="font-medium text-ink">{h && h.evaluated ? `${h.improved}/${h.evaluated} gained` : 'not evaluated'}</dd></div>
                </dl>
              </li>
            );
          })}
        </ul>
      </form>

      <p className="text-[12px] text-ink-faint">All costs are illustrative card figures, never PAB unit costs. INT-01–03 quote J-PAL’s TaRL policy insight and are flagged “verify before production”.</p>
    </div>
  );
}
