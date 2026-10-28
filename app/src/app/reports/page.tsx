import Link from 'next/link';
import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { listReports, reportTypeCounts } from '@/lib/feed';
import { userNames, scopeName } from '@/lib/repo';
import { may } from '@/lib/guard';
import { pick } from '@/lib/i18n';
import { Card, CardHead, PageHead, Callout, Toolbar, Empty, Mono, fmtDate } from '@/components/ui';
import { Pill, AiDrafted } from '@/components/labels';
import { FilterChips } from '@/components/lists';

/** Generated reports: action-taken reports, review packs, escalations and briefs. */

const TYPE_LABEL: Record<string, { en: string; hi: string }> = {
  atr: { en: 'Action-taken report', hi: 'कृत कार्यवाही रिपोर्ट' },
  review_pack: { en: 'Review pack', hi: 'समीक्षा संकलन' },
  district_escalation: { en: 'District escalation', hi: 'ज़िला संदर्भ' },
  overdue_tasks: { en: 'Overdue work', hi: 'विलंबित काम' },
  learning_outcome: { en: 'Learning outcome', hi: 'अधिगम परिणाम' },
  data_quality: { en: 'Data quality', hi: 'डेटा गुणवत्ता' },
  executive_brief: { en: 'Executive brief', hi: 'कार्यकारी सारांश' },
};

export default async function ReportsPage({
  searchParams,
}: { searchParams: Promise<{ type?: string }> }) {
  const session = await pageSession();
  const lang = await getLanguage();
  const sp = await searchParams;

  if (!may(session, 'report.export')) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHead title={pick(lang, 'Reports', 'रिपोर्ट')} />
        <Callout tone="warn">{pick(lang, 'Your role does not export reports.', 'आपकी भूमिका रिपोर्ट नहीं निकालती।')}</Callout>
      </div>
    );
  }

  const counts = reportTypeCounts(session);
  const reports = listReports(session, { type: sp.type || undefined, limit: 120 });
  const users = userNames(reports.map((r) => r.generated_by));

  return (
    <div>
      <PageHead
        title={pick(lang, 'Reports', 'रिपोर्ट')}
        sub={pick(
          lang,
          'Built from the case ledger, so a report cannot say something the records do not. Every one carries the demo disclaimer.',
          'प्रकरण-पंजी से बनी, अतः रिपोर्ट वह नहीं कह सकती जो रिकॉर्ड में नहीं है।',
        )}
      />
      <Toolbar>
        <FilterChips
          base="/reports" param="type" current={sp.type} lang={lang}
          options={[
            { value: '', label: pick(lang, 'All', 'सभी'), count: Object.values(counts).reduce((a, b) => a + b, 0) },
            ...Object.entries(counts).map(([t, c]) => ({
              value: t,
              label: pick(lang, TYPE_LABEL[t]?.en ?? t, TYPE_LABEL[t]?.hi ?? t),
              count: c,
            })),
          ]}
        />
      </Toolbar>
      <Card>
        <CardHead title={pick(lang, 'Generated reports', 'निर्मित रिपोर्ट')} hint={`${reports.length} ${pick(lang, 'shown', 'दिखाई')}`} />
        {reports.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{pick(lang, 'Report', 'रिपोर्ट')}</th>
                  <th scope="col">{pick(lang, 'Type', 'प्रकार')}</th>
                  <th scope="col">{pick(lang, 'Scope', 'दायरा')}</th>
                  <th scope="col">{pick(lang, 'Period', 'अवधि')}</th>
                  <th scope="col">{pick(lang, 'Cases', 'प्रकरण')}</th>
                  <th scope="col">{pick(lang, 'Generated', 'निर्मित')}</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td className="max-w-sm">
                      <Link href={`/reports/${r.id}`} className="link font-medium">{r.title}</Link>
                      <p className="text-[11.5px] text-ink-faint">
                        <Mono>{r.id}</Mono>
                        {r.narrative_model ? <> · <AiDrafted lang={lang} model={r.narrative_model} /></> : null}
                      </p>
                    </td>
                    <td className="text-[12.5px]">
                      <Pill>{pick(lang, TYPE_LABEL[r.report_type]?.en ?? r.report_type, TYPE_LABEL[r.report_type]?.hi ?? r.report_type)}</Pill>
                    </td>
                    <td className="text-[12.5px]">{scopeName(r.scope_type, r.scope_id)}</td>
                    <td className="tnum text-[12px]">{r.period_start} → {r.period_end}</td>
                    <td className="tnum text-[13px]">{r.case_ids.length}</td>
                    <td className="text-[12.5px]">
                      <span className="tnum">{fmtDate(r.generated_at)}</span>
                      <span className="block text-[11.5px] text-ink-faint">{users.get(r.generated_by) ?? r.generated_by}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
