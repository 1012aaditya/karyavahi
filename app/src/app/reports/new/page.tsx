import Link from 'next/link';
import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { may } from '@/lib/guard';
import { buildReport, REPORT_TYPES, type ReportType } from '@/lib/reports';
import { today, addDays } from '@/lib/clock';
import { pick } from '@/lib/i18n';
import { PageHead, Callout } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ReportView } from '@/components/ReportView';
import { ActionForm } from '@/components/ActionForm';
import { generateReportAction } from '@/lib/actions';

/**
 * Report builder. Choose a type and options, see a full preview built from current records,
 * then save it as a snapshot. Options that do not apply to the chosen type are not shown.
 */

type SP = { type?: string; from?: string; to?: string; ev?: string; un?: string; dq?: string; sum?: string };

const ICON: Record<ReportType, string> = {
  atr: 'clipboard', learning_impact: 'target', exceptions: 'alert', review_pack: 'briefcase',
  block_performance: 'map', intervention_effectiveness: 'flask', data_quality: 'database', executive_summary: 'file',
};
const OPTIONS: Record<ReportType, ('ev' | 'un' | 'dq' | 'sum')[]> = {
  atr: ['ev', 'un'], learning_impact: [], exceptions: [], review_pack: ['dq'], block_performance: [],
  intervention_effectiveness: [], data_quality: [], executive_summary: ['dq'],
};
const OPT_LABEL = { ev: 'Include evidence (proof) status', un: 'Include unresolved cases', dq: 'Include data-quality caveats', sum: 'Include executive summary' };

export default async function ReportBuilder({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await pageSession();
  const lang = await getLanguage();
  const sp = await searchParams;

  if (!may(session, 'report.export')) {
    return <div className="mx-auto max-w-2xl"><PageHead title="Report builder" /><Callout tone="warn">Your role cannot generate reports.</Callout></div>;
  }

  const type = (REPORT_TYPES.some((r) => r.key === sp.type) ? sp.type : null) as ReportType | null;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : today();
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : addDays(to, -365);
  const opt = (k: 'ev' | 'un' | 'dq' | 'sum') => sp[k] !== '0';
  const preview = type ? buildReport(session, { type, from, to, includeEvidence: opt('ev'), includeUnresolved: opt('un'), includeDataQuality: opt('dq'), includeSummary: opt('sum') }) : null;

  return (
    <div className="space-y-5">
      <PageHead
        breadcrumb={<Link href="/reports" className="link">{pick(lang, 'Impact & reports', 'प्रभाव व रिपोर्ट')}</Link>}
        title={pick(lang, 'Report builder', 'रिपोर्ट बनाएँ')}
        sub={pick(lang, 'Every report is derived from the current case ledger. Preview it, then save a snapshot that will not change when the records do.', 'हर रिपोर्ट वर्तमान प्रकरण-पंजी से बनती है।')}
      />

      <section aria-label="Report type">
        <h2 className="h-section mb-2">1 · Choose a report</h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {REPORT_TYPES.map((r) => {
            const on = r.key === type;
            return (
              <li key={r.key}>
                <Link href={`/reports/new?type=${r.key}`} aria-current={on ? 'true' : undefined}
                  className={`flex h-full gap-3 rounded-xl border bg-white p-4 shadow-card transition-all hover:shadow-lift ${on ? 'border-brand ring-2 ring-brand/30' : 'border-line'}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${on ? 'bg-brand text-white' : 'bg-navy-100 text-navy-700'}`}><Icon name={ICON[r.key]} size={17} /></span>
                  <span><span className="block text-[14px] font-semibold text-ink">{r.label}</span><span className="mt-0.5 block text-[12.5px] leading-snug text-ink-soft">{r.blurb}</span></span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {type && preview ? (
        <>
          <section aria-label="Options">
            <h2 className="h-section mb-2">2 · Options</h2>
            <form method="get" className="card flex flex-wrap items-end gap-4 p-4">
              <input type="hidden" name="type" value={type} />
              <label><span className="label">From</span><input type="date" name="from" defaultValue={from} max={to} className="input mt-1 h-9 w-44 text-[13px]" /></label>
              <label><span className="label">To</span><input type="date" name="to" defaultValue={to} className="input mt-1 h-9 w-44 text-[13px]" /></label>
              <div className="text-[13px]">
                <span className="label">Scope</span>
                <p className="mt-1 flex h-9 items-center rounded-lg border border-line bg-paper-sunk px-3 text-ink-soft">{preview.scope} <span className="ml-1 text-[11.5px] text-ink-faint">(your authorised scope)</span></p>
              </div>
              {OPTIONS[type].map((k) => (
                <label key={k} className="flex h-9 items-center gap-2 text-[13px] text-ink">
                  <input type="hidden" name={k} value="0" />
                  <input type="checkbox" name={k} value="1" defaultChecked={opt(k)} className="h-4 w-4 accent-[#0f766e]" />{OPT_LABEL[k]}
                </label>
              ))}
              <button type="submit" className="btn-quiet h-9"><Icon name="refresh" size={14} />Update preview</button>
            </form>
          </section>

          <section aria-label="Preview">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="h-section">3 · Preview and save</h2>
              <ActionForm
                action={generateReportAction}
                hidden={{ type, from, to, include_evidence: opt('ev') ? '1' : '0', include_unresolved: opt('un') ? '1' : '0', include_dq: opt('dq') ? '1' : '0', include_summary: opt('sum') ? '1' : '0' }}
                label="Generate & save snapshot"
              />
            </div>
            <ReportView r={preview} />
          </section>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-line-strong bg-white px-6 py-10 text-center text-[13.5px] text-ink-soft">Choose a report type above to configure and preview it.</div>
      )}
    </div>
  );
}
