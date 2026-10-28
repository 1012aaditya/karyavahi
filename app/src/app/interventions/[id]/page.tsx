import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { intervention, competencies } from '@/lib/repo';
import { listCases } from '@/lib/cases';
import { lookupsFor } from '@/lib/lookups';
import { pick } from '@/lib/i18n';
import {
  Card, CardHead, PageHead, Callout, Facts, Field, Mono, fmtInr, fmtDate,
} from '@/components/ui';
import { Pill, Illustrative, EvidenceStrength, EvidenceTypeName, RoleName } from '@/components/labels';

/** One intervention card, in full, including the parts that argue against using it. */

export default async function InterventionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await pageSession();
  const lang = await getLanguage();
  const { id } = await params;
  const i = intervention(id);
  if (!i) notFound();

  const comps = new Map(competencies().map((c) => [c.id, pick(lang, c.name_en, c.name_hi)]));
  const using = listCases(session, { limit: 200 }).slice(0, 0); // cases link via plans; listed below from plans
  const look = lookupsFor(lang);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHead
        breadcrumb={
          <>
            <Link href="/interventions" className="link">{pick(lang, 'Interventions', 'हस्तक्षेप')}</Link>
            {' › '}<Mono>{i.id}</Mono>
          </>
        }
        title={i.name}
        sub={i.description}
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Pill tone={i.lever === 'block' ? 'neutral' : 'active'}>
              {i.lever === 'block' ? pick(lang, 'block lever', 'खंड स्तर') : i.lever === 'district' ? pick(lang, 'district lever', 'ज़िला स्तर') : 'PAB'}
            </Pill>
            <EvidenceStrength status={i.evidence.status} lang={lang} />
          </div>
        }
      />

      <Card>
        <CardHead title={pick(lang, 'At a glance', 'एक नज़र में')} />
        <div className="card-pad">
          <Facts cols={4}>
            <Field label={pick(lang, 'Category', 'श्रेणी')}>{i.category.replace(/_/g, ' ')}</Field>
            <Field label={pick(lang, 'Classes', 'कक्षाएँ')}>{i.grades.join(', ')}</Field>
            <Field label={pick(lang, 'Runs for', 'अवधि')}>{i.duration_weeks} {pick(lang, 'weeks', 'सप्ताह')}</Field>
            <Field label={pick(lang, 'Cost', 'लागत')} hint={i.cost_basis.note}>
              <span className="tnum">{fmtInr(i.cost_basis.amount_inr)}</span>
              <span className="text-[12px] text-ink-faint"> / {i.cost_basis.unit}</span>
              <span className="ml-1.5"><Illustrative lang={lang} /></span>
            </Field>
            <Field label={pick(lang, 'Competencies', 'दक्षताएँ')} >
              {i.competency_ids.map((c) => comps.get(c) ?? c).join(', ')}
            </Field>
            <Field label={pick(lang, 'Judged on', 'मापदंड')}>{i.success_metric}</Field>
            <Field label={pick(lang, 'Card version', 'कार्ड संस्करण')}>v{i.version}</Field>
            <Field label={pick(lang, 'Review due', 'समीक्षा तिथि')}><span className="tnum">{fmtDate(i.review_date)}</span></Field>
          </Facts>
        </div>
      </Card>

      <Card>
        <CardHead
          title={pick(lang, 'What the evidence says', 'आधार क्या कहता है')}
          right={<EvidenceStrength status={i.evidence.status} lang={lang} />}
        />
        <div className="card-pad space-y-2.5">
          <p className="text-[13.5px] leading-relaxed text-ink">{i.evidence.summary}</p>
          {i.evidence.effect_size_text ? (
            <Callout tone="warn" title={pick(lang, 'The reported effect, and its spread', 'बताया गया प्रभाव और उसका विस्तार')}>
              {i.evidence.effect_size_text}
            </Callout>
          ) : (
            <Callout tone="method">
              {pick(
                lang,
                'This card makes no claim about how large an effect to expect. It is a reasonable thing to try for the problem described, and the outcome check is what will say whether it worked here.',
                'यह कार्ड प्रभाव के आकार का कोई दावा नहीं करता। यह एक उचित प्रयास है, और परिणाम जाँच बताएगी कि यहाँ काम आया या नहीं।',
              )}
            </Callout>
          )}
          {i.evidence.source_title ? (
            <p className="text-[12.5px]">
              <span className="text-ink-faint">{pick(lang, 'Source: ', 'स्रोत: ')}</span>
              {i.evidence.source_url ? (
                <a href={i.evidence.source_url} className="link" target="_blank" rel="noreferrer noopener">
                  {i.evidence.source_title}
                </a>
              ) : i.evidence.source_title}
            </p>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead title={pick(lang, 'How it is done', 'कैसे किया जाता है')} />
          <div className="card-pad">
            <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink">
              {i.steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
            {i.resources.length > 0 ? (
              <>
                <h3 className="h-section mb-1 mt-4">{pick(lang, 'What is needed', 'आवश्यक सामग्री')}</h3>
                <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-ink-soft">
                  {i.resources.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHead title={pick(lang, 'When it will not work', 'यह कब काम नहीं करेगा')} />
          <div className="card-pad space-y-3">
            <div>
              <h3 className="h-section mb-1">{pick(lang, 'Only works if', 'तभी काम करेगा जब')}</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-ink">
                {i.delivery_conditions.map((d) => <li key={d}>{d}</li>)}
              </ul>
            </div>
            {i.limitations.length > 0 ? (
              <div>
                <h3 className="h-section mb-1">{pick(lang, 'Known limitations', 'ज्ञात सीमाएँ')}</h3>
                <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-ink-soft">
                  {i.limitations.map((l) => <li key={l}>{l}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <Card>
        <CardHead
          title={pick(lang, 'What proof it has to produce', 'कौन सा सबूत देना होगा')}
          hint={pick(lang, 'Approving this intervention creates these tasks, each with its own proof requirement.', 'स्वीकृति पर ये काम बनते हैं, हर एक के लिए सबूत आवश्यक।')}
        />
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{pick(lang, 'Task', 'काम')}</th>
                <th scope="col">{pick(lang, 'Owner', 'ज़िम्मेदार')}</th>
                <th scope="col">{pick(lang, 'Per school?', 'प्रति विद्यालय?')}</th>
                <th scope="col">{pick(lang, 'Days', 'दिन')}</th>
                <th scope="col">{pick(lang, 'Proof', 'सबूत')}</th>
              </tr>
            </thead>
            <tbody>
              {i.task_templates.map((t) => (
                <tr key={t.key}>
                  <td className="max-w-md">
                    {pick(lang, t.title_en, t.title_hi)}
                    {t.cross_source ? (
                      <span className="ml-1.5"><Pill tone="active">{pick(lang, 'independent check', 'स्वतंत्र जाँच')}</Pill></span>
                    ) : null}
                  </td>
                  <td className="text-[13px]"><RoleName role={t.owner_role} lang={lang} /></td>
                  <td className="text-[13px]">{t.per_school ? pick(lang, 'yes', 'हाँ') : pick(lang, 'once', 'एक बार')}</td>
                  <td className="tnum text-[13px]">{t.duration_days}</td>
                  <td className="text-[13px]">{t.proof_count} × <EvidenceTypeName type={t.proof_type} lang={lang} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-4 py-3 sm:px-5">
          <h3 className="h-section mb-1">{pick(lang, 'Accepted as proof', 'सबूत के रूप में स्वीकार्य')}</h3>
          <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-ink">
            {i.required_evidence.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      </Card>
    </div>
  );
}
