import Link from 'next/link';
import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { listCases, countCases, caseStatusCounts, caseSeverityCounts, type CaseFilter } from '@/lib/cases';
import { lookupsFor } from '@/lib/lookups';
import { scopeName } from '@/lib/repo';
import { pick } from '@/lib/i18n';
import { Card, CardHead, PageHead, Grid, Stat, Toolbar } from '@/components/ui';
import { CaseTable, FilterChips } from '@/components/lists';
import { STATUS_LABELS } from '@domain/lifecycle';
import type { CaseStatus, Severity } from '@domain/types';

/** The case ledger. Every case the signed-in role is allowed to see, and nothing else. */

const OPEN: CaseStatus[] = [
  'detected', 'under_investigation', 'awaiting_approval', 'revision_requested', 'approved',
  'assigned', 'in_progress', 'awaiting_verification', 'outcome_pending', 'reopened',
];

export default async function CasesPage({
  searchParams,
}: { searchParams: Promise<{ status?: string; severity?: string; q?: string; order?: string; page?: string }> }) {
  const session = await pageSession();
  const lang = await getLanguage();
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page ?? 1));
  const perPage = 50;
  const filter: CaseFilter = {
    limit: perPage,
    offset: (page - 1) * perPage,
    order: (sp.order as CaseFilter['order']) ?? 'severity',
    q: sp.q || undefined,
  };
  if (sp.status === 'open') filter.open = true;
  else if (sp.status) filter.status = [sp.status as CaseStatus];
  if (sp.severity) filter.severity = [sp.severity as Severity];

  const cases = listCases(session, filter);
  const total = countCases(session, { ...filter, limit: undefined, offset: undefined });
  const byStatus = caseStatusCounts(session);
  const bySeverity = caseSeverityCounts(session);
  const openCount = OPEN.reduce((t, s) => t + (byStatus[s] ?? 0), 0);
  const look = lookupsFor(lang, { users: cases.map((c) => c.owner_user_id) });

  const statusOptions = [
    { value: '', label: pick(lang, 'All', 'सभी'), count: Object.values(byStatus).reduce((a, b) => a + b, 0) },
    { value: 'open', label: pick(lang, 'Open', 'खुले'), count: openCount },
    ...Object.entries(byStatus)
      .sort((a, b) => b[1] - a[1])
      .map(([s, c]) => ({
        value: s,
        label: pick(lang, STATUS_LABELS[s as CaseStatus]?.en ?? s, STATUS_LABELS[s as CaseStatus]?.hi ?? s),
        count: c,
      })),
  ];

  return (
    <div>
      <PageHead
        title={pick(lang, 'Cases', 'प्रकरण')}
        sub={pick(
          lang,
          `Each case is one learning drop, followed from detection to a verified outcome. You are seeing ${scopeName(session.scope_type, session.scope_id)}.`,
          `प्रत्येक प्रकरण एक गिरावट है, पहचान से सत्यापित परिणाम तक। आप ${scopeName(session.scope_type, session.scope_id)} देख रहे हैं।`,
        )}
      />

      <Grid cols={5}>
        <Stat label={pick(lang, 'Open now', 'अभी खुले')} value={openCount} tone="brand" href="/cases?status=open" />
        <Stat label={pick(lang, 'Waiting on a decision', 'निर्णय की प्रतीक्षा')} value={byStatus.awaiting_approval ?? 0} tone="pend" href="/cases?status=awaiting_approval" />
        <Stat label={pick(lang, 'Work under way', 'काम जारी')} value={byStatus.in_progress ?? 0} tone="brand" href="/cases?status=in_progress" />
        <Stat
          label={pick(lang, 'Closed on proof', 'सबूत पर बंद')} value={byStatus.closed ?? 0} tone="good" href="/cases?status=closed"
          sub={pick(lang, 'verified gain', 'सत्यापित सुधार')}
        />
        <Stat
          label={pick(lang, 'Critical', 'अति गंभीर')} value={bySeverity.critical ?? 0} tone="crit" href="/cases?severity=critical"
        />
      </Grid>

      <div className="mt-4">
        <Toolbar>
          <FilterChips base="/cases" param="status" options={statusOptions} current={sp.status} lang={lang} />
        </Toolbar>

        <Card>
          <CardHead
            title={
              sp.status
                ? pick(lang, STATUS_LABELS[sp.status as CaseStatus]?.en ?? sp.status, STATUS_LABELS[sp.status as CaseStatus]?.hi ?? sp.status)
                : pick(lang, 'All cases', 'सभी प्रकरण')
            }
            hint={`${total} ${pick(lang, 'in scope', 'आपके दायरे में')}${total > perPage ? ` · ${pick(lang, 'showing', 'दिख रहे')} ${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)}` : ''}`}
            right={
              <form method="get" action="/cases" className="flex gap-2">
                {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
                <input
                  type="search" name="q" defaultValue={sp.q ?? ''}
                  placeholder={pick(lang, 'Search titles and ids', 'शीर्षक या आईडी खोजें')}
                  className="input w-56 py-1 text-[13px]"
                />
                <button type="submit" className="btn-quiet">{pick(lang, 'Search', 'खोजें')}</button>
              </form>
            }
          />
          <CaseTable
            cases={cases} look={look} lang={lang}
            showBlock={session.scope_type !== 'block' && session.scope_type !== 'cluster'}
            emptyText={pick(lang, 'No cases match. Try a different filter.', 'कोई प्रकरण नहीं मिला।')}
          />
          {total > perPage ? (
            <nav className="flex items-center justify-between border-t border-line px-4 py-3 text-[13px] sm:px-5">
              {page > 1 ? (
                <Link href={`/cases?${new URLSearchParams({ ...sp, page: String(page - 1) } as Record<string, string>)}`} className="link">
                  ← {pick(lang, 'Previous', 'पिछला')}
                </Link>
              ) : <span />}
              <span className="tnum text-ink-faint">
                {pick(lang, 'Page', 'पृष्ठ')} {page} / {Math.ceil(total / perPage)}
              </span>
              {page * perPage < total ? (
                <Link href={`/cases?${new URLSearchParams({ ...sp, page: String(page + 1) } as Record<string, string>)}`} className="link">
                  {pick(lang, 'Next', 'अगला')} →
                </Link>
              ) : <span />}
            </nav>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
