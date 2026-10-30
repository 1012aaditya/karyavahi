import Link from 'next/link';
import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { interventions, competencies } from '@/lib/repo';
import { pick } from '@/lib/i18n';
import { Card, CardHead, PageHead, Callout, Toolbar, Grid, Stat, Mono, fmtInr } from '@/components/ui';
import { Pill, Illustrative, EvidenceStrength } from '@/components/labels';
import { FilterChips } from '@/components/lists';

/**
 * The intervention library.
 *
 * Three of these cards cite published evidence and are flagged for verification before anyone
 * relies on them in production; the rest make no effect-size claim at all and say so. That
 * distinction is the most important thing on the page, so it is on every card rather than
 * buried in a footnote.
 */

export default async function InterventionsPage({
  searchParams,
}: { searchParams: Promise<{ category?: string; lever?: string }> }) {
  const session = await pageSession();
  const lang = await getLanguage();
  const sp = await searchParams;

  const all = interventions();
  const comps = new Map(competencies().map((c) => [c.id, pick(lang, c.name_en, c.name_hi)]));
  const categories = [...new Set(all.map((i) => i.category))];
  const list = all.filter((i) =>
    (!sp.category || i.category === sp.category) && (!sp.lever || i.lever === sp.lever));
  const sourced = all.filter((i) => i.evidence.status === 'sourced_summary_verify').length;

  return (
    <div className="space-y-4">
      <PageHead
        title={pick(lang, 'Interventions', 'हस्तक्षेप')}
        sub={pick(
          lang,
          'What can be done about a learning drop, what each one costs, what has to be true for it to work, and what the evidence behind it actually says.',
          'गिरावट पर क्या किया जा सकता है, लागत, सफलता की शर्तें, और आधार क्या कहता है।',
        )}
      />

      <Grid cols={4}>
        <Stat label={pick(lang, 'Cards in the library', 'पुस्तिका में कार्ड')} value={all.length} />
        <Stat label={pick(lang, 'Citing a published source', 'प्रकाशित स्रोत सहित')} value={sourced} tone="warn"
          sub={pick(lang, 'flagged: verify before production', 'उपयोग से पहले जाँचें')} />
        <Stat label={pick(lang, 'Making no effect claim', 'प्रभाव का दावा नहीं')} value={all.length - sourced}
          sub={pick(lang, 'plausible, but unevidenced here', 'संभाव्य, पर आधार नहीं')} />
        <Stat label={pick(lang, 'Decided above the block', 'खंड से ऊपर स्वीकृत')} value={all.filter((i) => i.lever !== 'block').length}
          sub={pick(lang, 'district or PAB lever', 'ज़िला या PAB स्तर')} />
      </Grid>

      <Callout tone="warn" title={pick(lang, 'About the costs and the evidence', 'लागत और आधार के बारे में')}>
        {pick(
          lang,
          'Every cost on these cards is illustrative — a plausible figure for the demo, not a PAB unit cost, and not to be quoted. Three cards (INT-01, INT-02, INT-03) summarise a published policy insight on teacher-led remedial instruction; that summary is marked for verification and the range it reports is wide. The other fifteen cards make no claim about effect size, which is an honest position rather than an omission.',
          'इन कार्डों की हर लागत केवल उदाहरण है — PAB इकाई लागत नहीं। तीन कार्ड प्रकाशित नीति-अंतर्दृष्टि का सार देते हैं, जिसे जाँचना आवश्यक है। शेष पंद्रह कार्ड प्रभाव का कोई दावा नहीं करते।',
        )}
      </Callout>

      <Toolbar>
        <FilterChips
          base="/interventions" param="category" current={sp.category} lang={lang}
          options={[
            { value: '', label: pick(lang, 'All', 'सभी'), count: all.length },
            ...categories.map((c) => ({ value: c, label: c.replace(/_/g, ' '), count: all.filter((i) => i.category === c).length })),
          ]}
        />
      </Toolbar>

      <ul className="grid gap-4 lg:grid-cols-2">
        {list.map((i) => (
          <li key={i.id}>
            <Card className="h-full">
              <CardHead
                title={<Link href={`/interventions/${i.id}`} className="link">{i.name}</Link>}
                hint={
                  <>
                    <Mono>{i.id}</Mono> · {i.category.replace(/_/g, ' ')} ·{' '}
                    {pick(lang, 'Class', 'कक्षा')} {i.grades.join(', ')} · {i.duration_weeks} {pick(lang, 'weeks', 'सप्ताह')}
                  </>
                }
                right={
                  <Pill tone={i.lever === 'block' ? 'neutral' : 'active'}>
                    {i.lever === 'block' ? pick(lang, 'block', 'खंड') : i.lever === 'district' ? pick(lang, 'district', 'ज़िला') : 'PAB'}
                  </Pill>
                }
              />
              <div className="card-pad space-y-2.5">
                <p className="text-[13.5px] leading-relaxed text-ink">{i.description}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <EvidenceStrength status={i.evidence.status} lang={lang} />
                  <span className="tnum text-[13px] text-ink-soft">{fmtInr(i.cost_basis.amount_inr)} / {i.cost_basis.unit}</span>
                  <Illustrative lang={lang} />
                </div>
                <p className="text-[12.5px] text-ink-soft">
                  <span className="text-ink-faint">{pick(lang, 'Judged on:', 'मापदंड:')}</span> {i.success_metric}
                </p>
                <p className="text-[12px] text-ink-faint">
                  {i.competency_ids.map((c) => comps.get(c) ?? c).join(' · ')}
                </p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
