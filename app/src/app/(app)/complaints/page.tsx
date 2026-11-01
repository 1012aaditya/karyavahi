import Link from 'next/link';
import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { listComplaints, queueCounts, categories as cats, complaintAccess, slaState, CATEGORY_HI, type ComplaintFilter } from '@/lib/complaints';
import { userNames, scopeName } from '@/lib/repo';
import { can } from '@/lib/authz';
import { pick } from '@/lib/i18n';
import { PageHead } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ComplaintStatus } from '@/components/complaint-bits';
import { ComplaintDetail } from '@/components/ComplaintDetail';

/**
 * Complaints inbox. Action queues as tabs, compact rows, and the selected complaint in a
 * right-hand drawer (?open=CMP-…) on desktop — full screen on mobile. Visibility comes from
 * complaintsPred for the list and complaintAccess for the drawer, the same checks the full
 * page uses, so opening a complaint here never shows more than /complaints/[id] would.
 */

type Q = NonNullable<ComplaintFilter['queue']>;
type SP = { queue?: string; q?: string; category?: string; open?: string };

const PRIORITY_DOT: Record<string, string> = { critical: 'bg-crit', high: 'bg-amber', medium: 'bg-navy-300', low: 'bg-line-strong' };

export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await pageSession();
  const lang = await getLanguage();
  const sp = await searchParams;
  const counts = queueCounts(session);
  const handler = can(session, 'resolve_complaint');
  const canRaise = can(session, 'create_complaint');

  const primary: { key: Q; label: string; hint: string; tone?: 'crit' | 'warn' | 'pend' }[] = [
    ...(handler ? [{ key: 'mine' as Q, label: pick(lang, 'My queue', 'मेरी कतार'), hint: pick(lang, 'Assigned to you and open', 'आपको सौंपी गई और खुली') }] : []),
    { key: 'pending_ack', label: pick(lang, 'Needs acknowledgement', 'स्वीकृति लंबित'), hint: pick(lang, 'Submitted or escalated, not yet acknowledged', 'दर्ज या ऊपर भेजी गई, अभी पावती नहीं'), tone: 'pend' },
    { key: 'investigating', label: pick(lang, 'Under investigation', 'जाँच में'), hint: pick(lang, 'Acknowledged and being worked', 'पावती दी गई और काम जारी') },
    { key: 'overdue', label: pick(lang, 'Overdue', 'विलंबित'), hint: pick(lang, 'Past an acknowledgement or resolution deadline', 'पावती या समाधान की समय-सीमा पार'), tone: 'crit' },
    { key: 'escalated', label: pick(lang, 'Escalated', 'उच्चाधिकारी को'), hint: pick(lang, 'Moved up the hierarchy at least once', 'कम से कम एक बार ऊपर भेजी गई'), tone: 'warn' },
    { key: 'resolved', label: pick(lang, 'Resolved', 'हल'), hint: pick(lang, 'Resolved, closed or rejected with reason', 'हल, बंद, या कारण सहित अस्वीकृत') },
  ];
  const secondary: { key: Q; label: string; hint: string }[] = [
    { key: 'verification', label: pick(lang, 'Awaiting confirmation', 'पुष्टि प्रतीक्षित'), hint: pick(lang, 'Resolution proposed; complainant to confirm', 'समाधान प्रस्तावित; शिकायतकर्ता की पुष्टि बाकी') },
    ...(canRaise ? [{ key: 'submitted_by_me' as Q, label: pick(lang, 'Raised by me', 'मेरे द्वारा'), hint: pick(lang, 'Complaints you submitted', 'आपकी दर्ज की गई शिकायतें') }] : []),
    { key: 'all', label: pick(lang, 'All visible', 'सभी'), hint: pick(lang, 'Everything you are allowed to see', 'वह सब जो आप देख सकते हैं') },
  ];
  const queues = [...primary, ...secondary];
  const queue = (queues.some((q) => q.key === sp.queue) ? sp.queue : handler && counts.mine ? 'mine' : canRaise && !handler ? 'submitted_by_me' : 'pending_ack') as Q;
  const list = listComplaints(session, { queue, q: sp.q?.slice(0, 60), category: sp.category || undefined });
  const names = userNames(list.map((c) => c.assigned_user_id ?? ''));
  const catMap = new Map(cats().map((c) => [c.key, lang === 'hi' ? CATEGORY_HI[c.key]?.label ?? c.label : c.label]));

  // The drawer: resolved with the same access check as the full page.
  const openId = sp.open?.toUpperCase().slice(0, 16);
  const opened = openId ? complaintAccess(session, openId) : null;

  const href = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ queue, q: sp.q, category: sp.category, open: sp.open, ...patch })) if (v) p.set(k, String(v));
    return `/complaints?${p}`;
  };
  const where = (c: (typeof list)[number]) => c.school_id ? scopeName('school', c.school_id) : c.cluster_id ? scopeName('cluster', c.cluster_id) : c.block_id ? scopeName('block', c.block_id) : c.district_id ? scopeName('district', c.district_id) : '—';

  return (
    <div className="space-y-4">
      <PageHead
        title={pick(lang, 'Complaints', 'शिकायतें')}
        sub={pick(lang, 'Each complaint goes to its designated authority and moves up only when a deadline is missed or a handler escalates with a reason.', 'हर शिकायत निर्धारित अधिकारी को जाती है और केवल समय-सीमा चूकने या कारण सहित आगे बढ़ती है।')}
        meta={<>{scopeName(session.scope_type, session.scope_id)} · {counts.overdue} {pick(lang, 'overdue', 'विलंबित')} · {counts.pending_ack} {pick(lang, 'awaiting acknowledgement', 'स्वीकृति लंबित')}</>}
        right={canRaise ? <Link href="/complaints/new" className="btn-primary"><Icon name="plus" size={15} />{pick(lang, 'Raise a complaint', 'शिकायत दर्ज करें')}</Link> : undefined}
      />

      <nav aria-label={pick(lang, 'Complaint queues', 'शिकायत कतारें')} className="-mx-1 flex items-center gap-1 overflow-x-auto border-b border-line px-1">
        {queues.map((q, i) => {
          const on = q.key === queue;
          const tone = 'tone' in q ? q.tone : undefined;
          return (
            <span key={q.key} className="flex shrink-0 items-center">
              {i === primary.length ? <span className="mx-2 h-5 w-px bg-line-strong" aria-hidden /> : null}
              <Link href={href({ queue: q.key, open: undefined })} aria-current={on ? 'page' : undefined} title={q.hint}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm ${on ? 'border-brand font-semibold text-ink' : 'border-transparent text-ink-soft hover:text-ink'} ${i >= primary.length ? 'text-sm' : ''}`}>
                {q.label}
                <span className={`tnum rounded-full px-1.5 text-2xs font-semibold ${on ? 'bg-brand text-white' : tone === 'crit' && counts[q.key] ? 'bg-crit-light text-crit' : tone === 'warn' && counts[q.key] ? 'bg-warn-light text-warn' : tone === 'pend' && counts[q.key] ? 'bg-pend-light text-pend' : 'bg-paper-deep text-ink-soft'}`}>{counts[q.key]}</span>
              </Link>
            </span>
          );
        })}
      </nav>

      <div className={`grid gap-4 ${opened ? 'lg:grid-cols-[minmax(0,1fr)_minmax(440px,46%)]' : ''}`}>
        <section className="card min-w-0 self-start overflow-hidden">
          <form method="get" className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
            <input type="hidden" name="queue" value={queue} />
            <div className="relative min-w-[180px] flex-1">
              <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input type="search" name="q" defaultValue={sp.q ?? ''} placeholder={pick(lang, 'Search titles or ids…', 'शीर्षक या आईडी खोजें…')} aria-label={pick(lang, 'Search complaints', 'शिकायतें खोजें')} className="input h-9 pl-8 text-sm" />
            </div>
            <select name="category" defaultValue={sp.category ?? ''} aria-label={pick(lang, 'Category', 'श्रेणी')} className="h-9 rounded-lg border border-line-strong bg-white px-2.5 text-sm">
              <option value="">{pick(lang, 'All categories', 'सभी श्रेणियाँ')}</option>
              {[...catMap].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button type="submit" className="btn-quiet h-9"><Icon name="filter" size={14} />{pick(lang, 'Filter', 'छाँटें')}</button>
          </form>
          {list.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <Icon name="check-circle" size={28} className="mx-auto text-good" />
              <p className="mt-3 font-medium text-ink">{pick(lang, 'Nothing in this queue', 'इस कतार में कुछ नहीं')}</p>
              <p className="mt-1 text-sm text-ink-soft">{queues.find((q) => q.key === queue)?.hint}</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {list.map((c) => {
                const sla = slaState(c, lang);
                const on = opened?.complaint.id === c.id;
                const mine = c.assigned_user_id === session.user_id;
                return (
                  <li key={c.id}>
                    <Link href={href({ open: c.id })} scroll={false} aria-current={on ? 'true' : undefined}
                      className={`flex items-start gap-3 px-4 py-3 transition-colors ${on ? 'bg-brand-light/60 shadow-[inset_3px_0_0_rgb(var(--c-brand))]' : 'hover:bg-paper-sunk/70'}`}>
                      <span className={`dot mt-[7px] ${PRIORITY_DOT[c.priority] ?? 'bg-line-strong'}`} title={lang === 'hi' ? `प्राथमिकता: ${({ critical: 'अति गंभीर', high: 'अधिक', medium: 'मध्यम', low: 'कम' } as Record<string, string>)[c.priority] ?? c.priority}` : `${c.priority} priority`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-base font-medium text-ink">{c.title}</span>
                          {c.confidentiality === 'restricted' ? <Icon name="lock" size={12} className="shrink-0 text-crit" /> : null}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-faint">
                          <span className="font-mono">{c.id}</span>
                          <span>{catMap.get(c.category_key) ?? c.category_key}</span>
                          <span className="inline-flex items-center gap-0.5"><Icon name="pin" size={11} />{where(c)}</span>
                          <span>{mine ? <strong className="font-medium text-navy">{pick(lang, 'you', 'आप')}</strong> : names.get(c.assigned_user_id ?? '') ?? '—'}</span>
                          {c.escalation_level > 0 ? <span className="text-crit">{pick(lang, `escalated ×${c.escalation_level}`, `${c.escalation_level}× ऊपर भेजी गई`)}</span> : null}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <ComplaintStatus status={c.status} lang={lang} />
                        {sla.label ? <span className={`text-xs ${sla.tone === 'crit' ? 'font-medium text-crit' : sla.tone === 'warn' ? 'text-warn' : 'text-ink-faint'}`}>{sla.label}</span> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {opened ? (
          <aside aria-label={pick(lang, 'Complaint details', 'शिकायत का विवरण')}
            className="fixed inset-0 z-50 overflow-y-auto bg-white animate-slide-in lg:sticky lg:inset-auto lg:top-[84px] lg:z-auto lg:max-h-[calc(100vh-100px)] lg:self-start lg:rounded-xl lg:border lg:border-line">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-white/95 px-4 py-2 backdrop-blur">
              <Link href={href({ open: undefined })} scroll={false} className="btn-ghost btn-sm"><Icon name="x" size={15} />{pick(lang, 'Close', 'बंद करें')}</Link>
              <Link href={`/complaints/${opened.complaint.id}`} className="btn-ghost btn-sm">{pick(lang, 'Open full page', 'पूरा पृष्ठ खोलें')}<Icon name="arrow-up-right" size={13} /></Link>
            </div>
            <ComplaintDetail session={session} id={opened.complaint.id} layout="drawer" lang={lang} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
