import Link from 'next/link';
import type { CaseStatus, Language } from '@domain/types';
import type { InterventionMatch } from '@/lib/studio';
import type { SimilarCase } from '@/lib/memory';
import type { Blocker } from '@/lib/blockers';
import { blockerMeta, blockerText } from '@/lib/blockers';
import { Icon } from './Icon';
import { STAGES, stageIndex } from '@/lib/case-stage';
import { pick, OUTCOME_LABEL } from '@/lib/i18n';

/** Case workspace furniture: lifecycle stepper, section nav, and the right-rail cards. */

const LEVER_HI: Record<string, string> = { block: 'खंड', district: 'ज़िला', pab: 'PAB' };
const BLOCKER_STATUS_HI: Record<string, string> = { open: 'खुली', escalated: 'ऊपर भेजी गई', resolved: 'सुलझी' };
const FACTOR_WORD_HI: Record<string, string> = { 'teacher transfer': 'शिक्षक स्थानांतरण', 'visit gap': 'भ्रमण में अंतराल', 'attendance drop': 'उपस्थिति में गिरावट', 'high ptr': 'अधिक छात्र-शिक्षक अनुपात' };
/** Why a past case counts as similar (memory.ts), in Hindi. */
const whyHi = (w: string): string => {
  if (w === 'same competency') return 'वही दक्षता';
  if (w === 'same subject') return 'वही विषय';
  if (w === 'same intervention') return 'वही हस्तक्षेप';
  const cls = /^Class (\d)$/.exec(w);
  if (cls) return `कक्षा ${cls[1]}`;
  const sh = /^shared conditions: (.+)$/.exec(w);
  if (sh) return `समान परिस्थितियाँ: ${sh[1].split(', ').map((f) => FACTOR_WORD_HI[f] ?? f).join(', ')}`;
  return w;
};

export function LifecycleStepper({ status, reopenCount, lang = 'en' }: { status: CaseStatus; reopenCount: number; lang?: Language }) {
  const idx = stageIndex(status);
  const closed = status === 'closed';
  const terminal = status === 'dismissed' ? pick(lang, 'Dismissed', 'निरस्त') : status === 'referred_pab' ? pick(lang, 'Referred to PAB', 'PAB को भेजा गया') : null;
  return (
    <div>
      <ol className="flex items-start overflow-x-auto pb-1" aria-label={pick(lang, 'Case lifecycle', 'प्रकरण के चरण')}>
        {STAGES.map((s, i) => {
          const done = idx > i || closed;
          const current = idx === i && !closed;
          return (
            <li key={s.key} className="relative flex min-w-[96px] flex-1 flex-col items-center text-center" aria-current={current ? 'step' : undefined}>
              {i > 0 ? <span className={`absolute right-1/2 top-[11px] h-0.5 w-full ${done || current ? 'bg-brand' : 'bg-line-strong'}`} aria-hidden /> : null}
              <span className={`relative z-[1] grid h-6 w-6 place-items-center rounded-full border-2 text-2xs font-semibold ${
                current ? 'border-brand bg-white text-brand ring-4 ring-brand/15' : done ? 'border-brand bg-brand text-white' : 'border-line-strong bg-white text-ink-faint'
              }`}>
                {done ? <Icon name="check" size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span className={`mt-1.5 text-xs ${current ? 'font-semibold text-ink' : done ? 'text-ink-soft' : 'text-ink-faint'}`}>{pick(lang, s.en, s.hi)}</span>
              <span className="sr-only">{done ? pick(lang, '(done)', '(पूरा)') : current ? pick(lang, '(current)', '(वर्तमान)') : ''}</span>
            </li>
          );
        })}
      </ol>
      {terminal || reopenCount > 0 ? (
        <p className="mt-2 flex flex-wrap gap-2 text-xs">
          {terminal ? <span className="chip border-line-strong bg-paper-sunk text-ink-soft">{terminal}</span> : null}
          {reopenCount > 0 ? <span className="chip border-warn/30 bg-warn-light text-warn"><Icon name="refresh" size={12} />{pick(lang, `Reopened ${reopenCount}× — delivered, but no gain shown`, `${reopenCount}× फिर खुला — काम हुआ, पर सुधार नहीं दिखा`)}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

export function SectionNav({ items, lang = 'en' }: { items: { id: string; label: string; badge?: string; tone?: 'warn' | 'crit' | 'good' }[]; lang?: Language }) {
  return (
    <nav aria-label={pick(lang, 'Case sections', 'प्रकरण के भाग')} className="sticky top-[88px] z-10 -mx-1 overflow-x-auto rounded-xl border border-line bg-white/90 px-1 py-1 shadow-card backdrop-blur no-print">
      <ul className="flex gap-0.5">
        {items.map((it) => (
          <li key={it.id}>
            <a href={`#${it.id}`} className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-ink-soft hover:bg-paper-sunk hover:text-ink">
              {it.label}
              {it.badge ? (
                <span className={`tnum rounded-full px-1.5 text-2xs font-semibold ${it.tone === 'crit' ? 'bg-crit-light text-crit' : it.tone === 'warn' ? 'bg-warn-light text-warn' : it.tone === 'good' ? 'bg-good-light text-good' : 'bg-paper-deep text-ink-soft'}`}>{it.badge}</span>
              ) : null}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function RailCard({ title, icon, children, right }: { title: string; icon: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink"><Icon name={icon} size={16} className="text-ink-faint" />{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}

export function RecommendationsCard({ caseId, matches, lang = 'en' }: { caseId: string; matches: InterventionMatch[]; lang?: Language }) {
  const top = matches.filter((m) => m.eligible).slice(0, 3);
  const hi = lang === 'hi';
  return (
    <RailCard title={pick(lang, 'Intervention options', 'हस्तक्षेप के विकल्प')} icon="flask" right={<Link href={`/interventions/compare?case=${caseId}`} className="link text-sm">{pick(lang, 'Compare', 'तुलना करें')}</Link>}>
      <ul className="divide-y divide-line">
        {top.map((m) => (
          <li key={m.intervention.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/interventions/${m.intervention.id}?case=${caseId}`} className="text-sm font-medium leading-snug text-ink hover:text-brand">
                <span className="font-mono text-xs text-ink-faint">{m.intervention.id}</span> {m.intervention.name}
              </Link>
              <span className="tnum shrink-0 rounded-md bg-navy-100 px-1.5 py-0.5 text-2xs font-semibold text-navy-700" title={pick(lang, 'Rule-based relevance points — not a predicted effect', 'नियम-आधारित उपयुक्तता अंक — अनुमानित प्रभाव नहीं')}>{m.points} {pick(lang, 'pts', 'अंक')}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {m.isCurrentPlan ? <span className="chip border-brand/30 bg-brand-light text-brand">{pick(lang, 'Current plan', 'वर्तमान योजना')}</span> : null}
              <span className={`chip ${m.authority.canApprove ? 'border-good/30 bg-good-light text-good' : 'border-line-strong bg-paper-sunk text-ink-soft'}`}>{hi ? `${LEVER_HI[m.authority.lever] ?? m.authority.lever} स्तर${m.authority.canApprove ? ' · आप स्वीकृत कर सकते हैं' : ''}` : `${m.authority.lever} lever${m.authority.canApprove ? ' · you can approve' : ''}`}</span>
              {m.risks.slice(0, 1).map((r) => <span key={r.text} className={`chip ${r.level === 'crit' ? 'border-crit/30 bg-crit-light text-crit' : 'border-warn/30 bg-warn-light text-warn'}`} title={hi ? r.hi ?? r.text : r.text}>{pick(lang, 'Risk', 'जोखिम')}</span>)}
            </div>
            <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-ink-faint">{m.reasons.map((r) => (hi ? r.hi ?? r.text : r.text)).join(' · ')}</p>
          </li>
        ))}
      </ul>
      <p className="border-t border-line bg-paper-sunk px-4 py-2 text-xs text-ink-faint">{pick(lang, 'Points measure fit to this case, not expected effect.', 'अंक इस प्रकरण से मेल मापते हैं, अपेक्षित प्रभाव नहीं।')}</p>
    </RailCard>
  );
}

export function SimilarCasesCard({ cases, lessons, lang = 'en' }: { cases: SimilarCase[]; lessons: string[]; lang?: Language }) {
  const hi = lang === 'hi';
  return (
    <RailCard title={pick(lang, 'Similar cases & what we learned', 'मिलते-जुलते प्रकरण और सीख')} icon="history">
      {cases.length === 0 ? (
        <p className="px-4 py-5 text-sm text-ink-faint">{pick(lang, 'No sufficiently similar case in your scope yet.', 'आपके दायरे में अभी कोई पर्याप्त मिलता-जुलता प्रकरण नहीं।')}</p>
      ) : (
        <>
          {lessons.length ? (
            <ul className="space-y-1 border-b border-line bg-brand-light/40 px-4 py-3 text-sm leading-snug text-ink-soft">
              {lessons.map((l) => <li key={l} className="flex gap-1.5"><Icon name="info" size={13} className="mt-0.5 text-brand" />{l}</li>)}
            </ul>
          ) : null}
          <ul className="divide-y divide-line">
            {cases.map((c) => {
              const cat = c.outcome?.category;
              const tone = !cat ? 'border-line-strong bg-paper-sunk text-ink-soft' : cat.startsWith('improved') ? 'border-good/30 bg-good-light text-good' : cat === 'inconclusive' ? 'border-line-strong bg-paper-sunk text-ink-soft' : 'border-warn/30 bg-warn-light text-warn';
              return (
                <li key={c.id} className="px-4 py-2.5">
                  <Link href={`/cases/${c.id}`} className="text-sm font-medium leading-snug text-ink hover:text-brand">{c.id} · {c.title}</Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className={`chip ${tone}`}>{cat ? (hi ? OUTCOME_LABEL[cat as keyof typeof OUTCOME_LABEL]?.hi ?? cat.replace(/_/g, ' ') : cat.replace(/_/g, ' ')) : pick(lang, 'no outcome yet', 'अभी परिणाम नहीं')}{c.outcome?.did_pp !== null && c.outcome?.did_pp !== undefined ? ` · ${c.outcome.did_pp > 0 ? '+' : ''}${c.outcome.did_pp.toFixed(1)} pp` : ''}</span>
                    {c.intervention ? <span className="chip border-line-strong bg-white text-ink-soft">{c.intervention}</span> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-faint">{pick(lang, 'Similar:', 'समानता:')} {(hi ? c.why.map(whyHi) : c.why).join(', ')}</p>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </RailCard>
  );
}

export function CaseBlockersCard({ blockers, lang = 'en' }: { blockers: Blocker[]; lang?: Language }) {
  if (blockers.length === 0) return null;
  const hi = lang === 'hi';
  return (
    <RailCard title={pick(lang, 'Blockers on this case', 'इस प्रकरण की बाधाएँ')} icon="ban" right={<Link href="/execution?tab=blockers" className="link text-sm">{pick(lang, 'All', 'सभी')}</Link>}>
      <ul className="divide-y divide-line">
        {blockers.slice(0, 5).map((b) => (
          <li key={b.id} className="px-4 py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`chip ${b.status === 'resolved' ? 'border-good/30 bg-good-light text-good' : b.status === 'escalated' ? 'border-crit/30 bg-crit-light text-crit' : 'border-warn/30 bg-warn-light text-warn'}`}>{hi ? BLOCKER_STATUS_HI[b.status] ?? b.status : b.status}</span>
              <span className="font-medium text-ink">{hi ? blockerMeta(b.blocker_type).hi ?? blockerMeta(b.blocker_type).label : blockerMeta(b.blocker_type).label}</span>
            </div>
            <p className="mt-0.5 text-ink-soft">{blockerText(b.description, lang)}</p>
          </li>
        ))}
      </ul>
    </RailCard>
  );
}
