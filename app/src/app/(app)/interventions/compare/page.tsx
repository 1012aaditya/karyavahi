import Link from 'next/link';
import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { interventions, competencies } from '@/lib/repo';
import { getCase } from '@/lib/cases';
import { matchForCase, interventionHistory, authorityFor, feasibility } from '@/lib/studio';
import { planCounts } from '@/lib/plans';
import { pick } from '@/lib/i18n';
import { PageHead, fmtInr } from '@/components/ui';
import { EvidenceStrength } from '@/components/labels';
import { Icon } from '@/components/Icon';
import { CostSource, unitLabel } from '@/components/cost';
import type { Intervention } from '@domain/types';

/**
 * Compare two or three interventions on the dimensions that decide a plan. No composite score:
 * each row is a fact or a rule-based judgement with its reason, and where the catalogue makes
 * no effect claim the comparison says so instead of inventing one.
 */

type SP = { id?: string | string[]; ids?: string; case?: string };

export default async function ComparePage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await pageSession();
  const lang = await getLanguage();
  const sp = await searchParams;

  const all = interventions();
  const raw = [...(Array.isArray(sp.id) ? sp.id : sp.id ? [sp.id] : []), ...(sp.ids ? sp.ids.split(',') : [])];
  const ids = [...new Set(raw.map((x) => x.trim().toUpperCase()))].filter((x) => all.some((i) => i.id === x)).slice(0, 3);
  const caseId = sp.case && getCase(session, sp.case.toUpperCase()) ? sp.case.toUpperCase() : undefined;
  const match = caseId ? matchForCase(session, caseId) : null;
  const theCase = caseId ? getCase(session, caseId) : null;
  const caseSchools = theCase?.school_ids.length ?? 1;
  const counts = theCase ? planCounts(theCase.school_ids, theCase.grade) : {};

  // With a case but nothing chosen yet, start from the top three matches.
  const chosen: Intervention[] = (ids.length ? ids : match ? match.matches.filter((m) => m.eligible).slice(0, 3).map((m) => m.intervention.id) : [])
    .map((id) => all.find((i) => i.id === id)!).filter(Boolean);
  const hist = interventionHistory();
  const comps = new Map(competencies().map((c) => [c.id, pick(lang, c.name_en, c.name_hi)]));
  const L = (en: string, hi: string) => pick(lang, en, hi);
  const hi = lang === 'hi';
  const WHO_HI: Record<string, string> = {
    'Block Education Officer or DEO': 'खंड शिक्षा अधिकारी या DEO', 'District Education Officer or state team': 'ज़िला शिक्षा अधिकारी या राज्य दल',
    'DEO or state team, then the PAB': 'DEO या राज्य दल, फिर PAB',
  };

  const cols = chosen.map((iv) => {
    const m = match?.matches.find((x) => x.intervention.id === iv.id) ?? null;
    const f = feasibility(iv, { schools: caseSchools, budgetInr: null, teachersAvailable: null, weeksAvailable: null, attendancePct: null, trainingComplete: false, connectivity: false, ...counts });
    return { iv, m, h: hist.get(iv.id), auth: m?.authority ?? authorityFor(session, iv.lever), cost: f.totalCost };
  });

  const Row = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode[] }) => (
    <tr>
      <th scope="row" className="w-48 border-b border-line bg-paper-sunk px-3 py-3 text-left align-top text-sm font-semibold text-ink">
        {label}{hint ? <span className="mt-0.5 block text-2xs font-normal text-ink-faint">{hint}</span> : null}
      </th>
      {children.map((c, i) => <td key={i} className="border-b border-l border-line px-3 py-3 align-top text-sm text-ink-soft">{c}</td>)}
    </tr>
  );

  const Group = ({ label, tone }: { label: string; tone: 'brand' | 'warn' | 'ink' }) => (
    <tr><th colSpan={cols.length + 1} className={`border-b border-line bg-white px-3 pb-1.5 pt-4 text-left text-2xs font-semibold uppercase tracking-[0.08em] ${tone === 'brand' ? 'text-brand' : tone === 'warn' ? 'text-warn' : 'text-ink-faint'}`}>{label}</th></tr>
  );

  return (
    <div className="space-y-5">
      <PageHead
        breadcrumb={<Link href={`/interventions${caseId ? `?case=${caseId}` : ''}`} className="link">{pick(lang, 'Interventions', 'हस्तक्षेप')}</Link>}
        title={pick(lang, 'Compare options', 'विकल्पों की तुलना')}
        sub={caseId && match ? L(`For ${caseId}: ${match.caseTitle}`, `${caseId} के लिए: ${match.caseTitle}`) : pick(lang, 'Pick two or three interventions. Open from a case to also see how each fits it.', 'दो या तीन हस्तक्षेप चुनें।')}
      />

      <form method="get" className="card flex flex-wrap items-end gap-2 p-3">
        {caseId ? <input type="hidden" name="case" value={caseId} /> : null}
        {[0, 1, 2].map((n) => (
          <label key={n} className="min-w-[220px] flex-1">
            <span className="label">{L('Option', 'विकल्प')} {n + 1}{n === 2 ? L(' (optional)', ' (वैकल्पिक)') : ''}</span>
            <select name="id" defaultValue={chosen[n]?.id ?? ''} className="input mt-1 h-9 text-sm">
              <option value="">—</option>
              {all.map((i) => <option key={i.id} value={i.id}>{i.id} · {i.name}</option>)}
            </select>
          </label>
        ))}
        <button type="submit" className="btn-primary h-9"><Icon name="scale" size={14} />{L('Compare', 'तुलना करें')}</button>
      </form>

      {cols.length < 2 ? (
        <div className="card px-6 py-12 text-center">
          <Icon name="scale" size={28} className="mx-auto text-ink-faint" />
          <p className="mt-3 font-medium text-ink">{L('Choose at least two options', 'कम से कम दो विकल्प चुनें')}</p>
          <p className="mt-1 text-sm text-ink-soft">{L('Use the selectors above, or tick rows in the catalogue.', 'ऊपर से चुनें, या सूची में पंक्तियाँ चिह्नित करें।')}</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className="w-48 border-b border-line bg-paper-sunk" />
                {cols.map(({ iv, m }) => (
                  <th key={iv.id} scope="col" className="border-b border-l border-line px-3 py-3 text-left align-top">
                    <p className="font-mono text-xs font-normal text-ink-faint">{iv.id}</p>
                    <Link href={`/interventions/${iv.id}${caseId ? `?case=${caseId}` : ''}`} className="text-base font-semibold leading-snug text-ink hover:text-brand">{iv.name}</Link>
                    {m?.isCurrentPlan ? <span className="chip ml-1 border-brand/30 bg-brand-light align-middle text-brand">{L('Current plan', 'वर्तमान योजना')}</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {match ? (
                <Row label={L(`Relevance to ${caseId}`, `${caseId} से मेल`)} hint={L('Rule-based points; not an effect estimate', 'नियम-आधारित अंक; प्रभाव का अनुमान नहीं')}>
                  {cols.map(({ m }) => m && m.eligible ? (
                    <div key="r"><p className="tnum text-lg font-semibold text-ink">{m.points} {L('pts', 'अंक')}</p><ul className="mt-1 space-y-0.5 text-xs">{m.reasons.map((r) => <li key={r.text}>+{r.points} {hi ? r.hi ?? r.text : r.text}</li>)}</ul></div>
                  ) : <span key="r" className="text-crit">{L('Not a fit', 'उपयुक्त नहीं')} — {hi ? m?.excludedBecauseHi ?? m?.excludedBecause : m?.excludedBecause}</span>)}
                </Row>
              ) : null}
              <Group label={L('Fit', 'मेल')} tone="ink" />
              <Row label={L('Targets', 'लक्ष्य')}>{cols.map(({ iv }) => <span key="t">{L('Class', 'कक्षा')} {iv.grades.join(', ')} · {iv.competency_ids.map((c) => comps.get(c) ?? c).join(', ')}</span>)}</Row>
              <Group label={L('Documented evidence', 'दर्ज साक्ष्य')} tone="brand" />
              <Row label={L('Evidence quality', 'साक्ष्य की गुणवत्ता')}>{cols.map(({ iv }) => <div key="e" className="space-y-1"><EvidenceStrength status={iv.evidence.status} lang={lang} /><p className="text-xs">{iv.evidence.summary}</p></div>)}</Row>
              <Row label={L('Effect estimate', 'प्रभाव का अनुमान')} hint={L('Only where the card cites one', 'केवल जहाँ कार्ड में दिया हो')}>{cols.map(({ iv }) => iv.evidence.effect_size_text ? <span key="x" className="text-ink">{iv.evidence.effect_size_text} <span className="text-warn">{L('(verify before production)', '(उपयोग से पहले जाँचें)')}</span></span> : <span key="x" className="text-ink-faint">{L('No effect-size claim made', 'प्रभाव के आकार का कोई दावा नहीं')}</span>)}</Row>
              <Group label={L('Assumptions & delivery — not evidence', 'मान्यताएँ और क्रियान्वयन — साक्ष्य नहीं')} tone="warn" />
              <Row label={L('Cost', 'लागत')} hint={L('UP PAB 2025-26 unit cost where a line exists; otherwise illustrative', 'जहाँ पंक्ति है वहाँ UP PAB 2025-26 इकाई लागत; अन्यथा उदाहरण')}>{cols.map(({ iv, cost }) => <span key="c" className="tnum">{fmtInr(iv.cost_basis.amount_inr)} {unitLabel(iv.cost_basis.unit, lang)} <CostSource cost={iv.cost_basis} lang={lang} />{caseId && cost !== null ? <span className="block text-xs text-ink-faint">≈ {fmtInr(cost)} {L(`for this case’s ${caseSchools} school(s)`, `इस प्रकरण के ${caseSchools} विद्यालयों के लिए`)}</span> : null}</span>)}</Row>
              <Row label={L('Duration', 'अवधि')}>{cols.map(({ iv }) => <span key="d">{iv.duration_weeks ? L(`${iv.duration_weeks} weeks`, `${iv.duration_weeks} सप्ताह`) : L('Next PAB cycle', 'अगला PAB चक्र')}</span>)}</Row>
              <Row label={L('Resources & staff', 'संसाधन और कर्मचारी')}>{cols.map(({ iv }) => <ul key="s" className="list-disc space-y-0.5 pl-4 text-sm">{iv.resources.slice(0, 5).map((r) => <li key={r}>{r}</li>)}</ul>)}</Row>
              <Row label={L('Delivery conditions', 'क्रियान्वयन की शर्तें')} hint={L('Must be true for it to work', 'काम करने के लिए ये सही होनी चाहिए')}>{cols.map(({ iv }) => <ul key="dc" className="list-disc space-y-0.5 pl-4 text-sm">{iv.delivery_conditions.map((r) => <li key={r}>{r}</li>)}</ul>)}</Row>
              <Row label={L('Risks for this case', 'इस प्रकरण के जोखिम')}>{cols.map(({ m, iv }) => m ? (m.risks.length ? <ul key="rk" className="space-y-0.5 text-sm text-warn">{m.risks.map((r) => <li key={r.text}>{hi ? r.hi ?? r.text : r.text}</li>)}</ul> : <span key="rk" className="text-ink-faint">{L('None read from the diagnosis', 'निदान से कोई नहीं')}</span>) : <ul key="rk" className="list-disc space-y-0.5 pl-4 text-sm">{iv.limitations.slice(0, 3).map((l) => <li key={l}>{l}</li>)}</ul>)}</Row>
              <Row label={L('Ledger outcomes', 'खाते के परिणाम')} hint={L('Aggregate, this fictional ledger', 'कुल, यह काल्पनिक खाता')}>{cols.map(({ h }) => h && h.evaluated ? <span key="h">{L(`${h.improved} of ${h.evaluated} evaluated showed a gain (${h.confirmed} confirmed)${h.inconclusive ? `, ${h.inconclusive} inconclusive` : ''}`, `जाँचे गए ${h.evaluated} में से ${h.improved} में सुधार (${h.confirmed} पुष्ट)${h.inconclusive ? `, ${h.inconclusive} अनिर्णीत` : ''}`)}</span> : <span key="h" className="text-ink-faint">{h?.plans ? L(`${h.plans} plans, none evaluated yet`, `${h.plans} योजनाएँ, अभी कोई जाँची नहीं`) : L('Never used', 'कभी उपयोग नहीं')}</span>)}</Row>
              <Group label={L('Decision', 'निर्णय')} tone="ink" />
              <Row label={L('Authority required', 'आवश्यक अधिकार')}>{cols.map(({ auth }) => <span key="a" className={auth.canApprove ? 'text-good' : ''}>{hi ? WHO_HI[auth.who] ?? auth.who : auth.who}{auth.canApprove ? L(' — you can approve', ' — आप स्वीकृत कर सकते हैं') : ''}</span>)}</Row>
              <Row label={L('Success metric', 'सफलता का मापदंड')}>{cols.map(({ iv }) => <span key="sm">{iv.success_metric}</span>)}</Row>
              <Row label={L('Plan it', 'योजना बनाएँ')}>{cols.map(({ iv }) => <Link key="p" href={`/interventions/${iv.id}?${caseId ? `case=${caseId}&` : ''}schools=${caseSchools}#what-if`} className="btn-quiet btn-sm">{L('What-if planner', 'क्या-अगर योजनाकार')}<Icon name="arrow-right" size={13} /></Link>)}</Row>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-faint">{L('Approving a different intervention is done from the case’s plan section by an officer with the authority shown. Karyavahi AI can explain this comparison but cannot choose for you.', 'दूसरा हस्तक्षेप स्वीकृत करना प्रकरण के योजना अनुभाग से, दिखाए गए अधिकार वाले अधिकारी द्वारा होता है। कार्यवाही AI यह तुलना समझा सकता है, पर आपके लिए चुन नहीं सकता।')}</p>
    </div>
  );
}
