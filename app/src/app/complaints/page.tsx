import Link from 'next/link';
import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { listComplaints, queueCounts, categories as cats, type ComplaintFilter } from '@/lib/complaints';
import { userNames } from '@/lib/repo';
import { can } from '@/lib/authz';
import { pick } from '@/lib/i18n';
import { PageHead } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ComplaintRow } from '@/components/complaint-bits';

/**
 * Complaints. Action queues first — what is waiting on you, what is late, what was escalated —
 * then the wider views. Visibility comes from complaintsPred: your own, assigned to you, routed
 * through you, or (for standard complaints only) inside your oversight scope.
 */

type Q = NonNullable<ComplaintFilter['queue']>;

export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<{ queue?: string; q?: string; category?: string }> }) {
  const session = await pageSession();
  const lang = await getLanguage();
  const sp = await searchParams;
  const counts = queueCounts(session);
  const handler = can(session, 'resolve_complaint');
  const canRaise = can(session, 'create_complaint');

  const queues: { key: Q; label: string; hint: string; tone?: string }[] = [
    ...(handler ? [{ key: 'mine' as Q, label: pick(lang, 'Waiting on you', 'आपकी प्रतीक्षा'), hint: 'Assigned to you and open', tone: counts.mine ? 'text-navy' : '' }] : []),
    { key: 'pending_ack', label: pick(lang, 'Pending acknowledgement', 'स्वीकृति लंबित'), hint: 'Submitted or escalated, not yet acknowledged', tone: counts.pending_ack ? 'text-pend' : '' },
    { key: 'overdue', label: pick(lang, 'Overdue', 'विलंबित'), hint: 'Past an acknowledgement or resolution deadline', tone: counts.overdue ? 'text-crit' : '' },
    { key: 'escalated', label: pick(lang, 'Escalated', 'उच्चाधिकारी को'), hint: 'Moved up the hierarchy at least once', tone: counts.escalated ? 'text-warn' : '' },
    { key: 'investigating', label: pick(lang, 'Under investigation', 'जाँच में'), hint: 'Acknowledged and being worked' },
    { key: 'verification', label: pick(lang, 'Awaiting verification', 'सत्यापन प्रतीक्षित'), hint: 'Resolution proposed; complainant to confirm' },
    { key: 'resolved', label: pick(lang, 'Resolved & closed', 'हल'), hint: 'Resolved, closed or rejected with reason' },
    ...(canRaise ? [{ key: 'submitted_by_me' as Q, label: pick(lang, 'Raised by me', 'मेरे द्वारा'), hint: 'Complaints you submitted' }] : []),
    { key: 'all', label: pick(lang, 'All visible', 'सभी'), hint: 'Everything you are allowed to see' },
  ];
  const queue = (queues.some((q) => q.key === sp.queue) ? sp.queue : handler && counts.mine ? 'mine' : canRaise && !handler ? 'submitted_by_me' : 'pending_ack') as Q;
  const list = listComplaints(session, { queue, q: sp.q?.slice(0, 60), category: sp.category || undefined });
  const names = userNames([...list.map((c) => c.reporter_user_id), ...list.map((c) => c.assigned_user_id ?? '')]);
  const catMap = new Map(cats().map((c) => [c.key, c.label]));

  return (
    <div className="space-y-5">
      <PageHead
        title={pick(lang, 'Complaints & grievances', 'शिकायतें')}
        sub={pick(lang, 'Each complaint goes to the complainant’s designated authority and moves up only when an SLA is missed or a handler escalates with a reason. Restricted complaints are routed around anyone they concern.', 'हर शिकायत निर्धारित अधिकारी को जाती है और केवल SLA चूकने या कारण सहित ऊपर भेजने पर आगे बढ़ती है।')}
        right={canRaise ? <Link href="/complaints/new" className="btn-primary"><Icon name="plus" size={15} />{pick(lang, 'Raise a complaint', 'शिकायत दर्ज करें')}</Link> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {queues.slice(0, 4).map((q) => (
          <Link key={q.key} href={`/complaints?queue=${q.key}`} aria-current={q.key === queue ? 'page' : undefined}
            className={`rounded-xl border bg-white px-4 py-3 shadow-card transition-all hover:shadow-lift ${q.key === queue ? 'border-navy ring-1 ring-navy/30' : 'border-line'}`}>
            <p className="label">{q.label}</p>
            <p className={`kpi-num mt-2 ${q.tone || 'text-ink'}`}>{counts[q.key]}</p>
            <p className="mt-1 text-[11.5px] leading-snug text-ink-faint">{q.hint}</p>
          </Link>
        ))}
      </div>

      <nav aria-label="Complaint queues" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
        {queues.map((q) => (
          <Link key={q.key} href={`/complaints?queue=${q.key}`} aria-current={q.key === queue ? 'page' : undefined}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13.5px] ${q.key === queue ? 'border-brand font-semibold text-ink' : 'border-transparent text-ink-soft hover:text-ink'}`}>
            {q.label}<span className={`tnum rounded-full px-1.5 text-[11px] font-semibold ${q.key === queue ? 'bg-brand text-white' : 'bg-paper-deep text-ink-soft'}`}>{counts[q.key]}</span>
          </Link>
        ))}
      </nav>

      <form method="get" className="card flex flex-wrap items-center gap-2 p-3">
        <input type="hidden" name="queue" value={queue} />
        <div className="relative min-w-[220px] flex-1">
          <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input type="search" name="q" defaultValue={sp.q ?? ''} placeholder="Search titles or ids…" aria-label="Search complaints" className="input h-9 pl-9 text-[13px]" />
        </div>
        <select name="category" defaultValue={sp.category ?? ''} aria-label="Category" className="h-9 rounded-lg border border-line-strong bg-white px-2.5 text-[13px]">
          <option value="">All categories</option>
          {[...catMap].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button type="submit" className="btn-primary h-9"><Icon name="filter" size={14} />Apply</button>
      </form>

      <section className="card overflow-hidden">
        {list.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Icon name="check-circle" size={28} className="mx-auto text-good" />
            <p className="mt-3 font-medium text-ink">{pick(lang, 'Nothing in this queue', 'इस कतार में कुछ नहीं')}</p>
            <p className="mt-1 text-[13px] text-ink-soft">{queues.find((q) => q.key === queue)?.hint}</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((c) => <ComplaintRow key={c.id} c={c} names={names} categories={catMap} mine={c.assigned_user_id === session.user_id} />)}
          </ul>
        )}
      </section>
    </div>
  );
}
