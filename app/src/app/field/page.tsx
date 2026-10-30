import Link from 'next/link';
import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { listTasks, countTasks, listCases, evidenceToCheck } from '@/lib/cases';
import { lookupsFor } from '@/lib/lookups';
import { scopeName, visitsBy, schoolsIn, schoolNames } from '@/lib/repo';
import { countUnread } from '@/lib/feed';
import { may, grant } from '@/lib/guard';
import { today, daysAgo } from '@/lib/clock';
import { pick } from '@/lib/i18n';
import { Card, CardHead, PageHead, Grid, Stat, Callout, Empty, Mono, fmtDate } from '@/components/ui';
import { TaskTable, CaseTable } from '@/components/lists';
import { Pill, RoleName } from '@/components/labels';

/**
 * The field view, for block and cluster resource coordinators.
 *
 * Coordinators do not approve anything; they do the coaching, run the spot assessments and
 * carry out the independent checks that let a case close. So this page is their own work first,
 * and the cases behind that work second.
 */

export default async function FieldHome() {
  const session = await pageSession();
  const lang = await getLanguage();
  const role = session.roles.find((r) => ['crc', 'brc'].includes(r.role)) ?? session.roles[0];

  const mine = { ownerUserId: session.user_id };
  const todo = listTasks(session, { ...mine, status: ['assigned', 'acknowledged', 'in_progress', 'sent_back'], limit: 40 });
  const overdueCount = countTasks(session, { ...mine, overdue: true });
  const submitted = countTasks(session, { ...mine, status: ['submitted'] });
  const verified = countTasks(session, { ...mine, status: ['verified'] });
  const sentBack = listTasks(session, { ...mine, status: ['sent_back'], limit: 10 });
  const crossSource = todo.filter((t) => t.cross_source);
  const cases = listCases(session, { open: true, limit: 20 });
  const visits = visitsBy(session, session.user_id, 12);
  const proof = may(session, 'evidence.verify') ? evidenceToCheck(session, { limit: 6 }) : [];
  const schools = schoolsIn(session, { limit: 500 });

  const look = lookupsFor(lang, {
    users: [...todo.map((t) => t.owner_user_id), ...cases.map((c) => c.owner_user_id), ...proof.map((e) => e.submitted_by)],
    schools: [...todo.map((t) => t.school_id ?? ''), ...visits.map((v) => v.school_id), ...proof.map((e) => e.school_id ?? '')],
  });
  const visitSchools = schoolNames(visits.map((v) => v.school_id));

  return (
    <div className="space-y-4">
      <PageHead
        title={`${pick(lang, 'Field work', 'क्षेत्र कार्य')} — ${scopeName(role.scope_type, role.scope_id)}`}
        sub={pick(
          lang,
          'Your tasks, your visits, and the cases they belong to. Submitting proof is not the end of a task — somebody who did not do the work has to check it.',
          'आपके काम, आपके भ्रमण, और उनसे जुड़े प्रकरण। सबूत जमा करना अंत नहीं — कोई और उसे जाँचेगा।',
        )}
      />

      <Grid cols={5}>
        <Stat label={pick(lang, 'To do', 'करना है')} value={todo.length} tone="brand" href="/tasks?filter=todo" />
        <Stat label={pick(lang, 'Overdue', 'विलंबित')} value={overdueCount} tone={overdueCount > 0 ? 'crit' : 'neutral'} href="/tasks?filter=overdue" />
        <Stat label={pick(lang, 'Sent back to me', 'मुझे लौटाया')} value={sentBack.length} tone={sentBack.length > 0 ? 'warn' : 'neutral'} href="/tasks?filter=sent_back" />
        <Stat label={pick(lang, 'Waiting on a checker', 'जाँच प्रतीक्षित')} value={submitted} tone="pend" href="/tasks?filter=submitted" />
        <Stat label={pick(lang, 'Verified', 'सत्यापित')} value={verified} tone="good" href="/tasks?filter=verified" />
      </Grid>

      {sentBack.length > 0 ? (
        <Card>
          <CardHead
            title={pick(lang, 'Proof that came back', 'लौटाए गए सबूत')}
            hint={pick(lang, 'Read the reason, then submit again.', 'कारण पढ़ें, फिर दोबारा जमा करें।')}
          />
          <TaskTable tasks={sentBack} look={look} lang={lang} today={today()} />
        </Card>
      ) : null}

      {crossSource.length > 0 ? (
        <Card>
          <CardHead
            title={pick(lang, 'Independent checks assigned to you', 'आपको सौंपी स्वतंत्र जाँच')}
            hint={pick(
              lang,
              'These are the checks a case cannot close without. They carry weight because you did not deliver the work being checked.',
              'इनके बिना प्रकरण बंद नहीं हो सकता। इनका महत्व इसलिए है कि यह काम आपने नहीं किया।',
            )}
          />
          <TaskTable tasks={crossSource} look={look} lang={lang} today={today()} />
        </Card>
      ) : null}

      <Card>
        <CardHead
          title={pick(lang, 'Everything on your plate', 'आपके सभी काम')}
          right={<Link href="/tasks" className="link text-[13px]">{pick(lang, 'All my tasks', 'सभी काम')}</Link>}
        />
        <TaskTable
          tasks={todo} look={look} lang={lang} today={today()}
          emptyText={pick(lang, 'Nothing assigned to you right now.', 'अभी आपको कुछ नहीं सौंपा गया।')}
        />
      </Card>

      {proof.length > 0 ? (
        <Card>
          <CardHead
            title={pick(lang, 'Proof you can spot-check', 'आप जाँच सकते हैं')}
            hint={grant(session, 'evidence.verify') === 'spot'
              ? pick(lang, 'You verify by going and looking, not by reading a form.', 'आप जाकर देखकर सत्यापित करते हैं, फ़ॉर्म पढ़कर नहीं।')
              : undefined}
            right={<Link href="/evidence" className="btn-quiet">{pick(lang, 'Open the queue', 'कतार खोलें')}</Link>}
          />
          <ul className="divide-y divide-line">
            {proof.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2.5 text-[13px] sm:px-5">
                <Link href={`/cases/${e.case_id}`} className="link"><Mono>{e.case_id}</Mono></Link>
                <span className="text-ink">{e.evidence_type.replace(/_/g, ' ')}</span>
                <span className="text-ink-soft">{look.users.get(e.submitted_by) ?? e.submitted_by}</span>
                {e.school_id ? <span className="text-ink-faint">{look.schools.get(e.school_id)}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHead
          title={pick(lang, 'Cases in your area', 'आपके क्षेत्र के प्रकरण')}
          hint={`${cases.length} ${pick(lang, 'open', 'खुले')} · ${schools.length} ${pick(lang, 'schools', 'विद्यालय')}`}
        />
        <CaseTable
          cases={cases} look={look} lang={lang} showBlock={role.scope_type !== 'cluster'}
          emptyText={pick(lang, 'No open cases here.', 'यहाँ कोई खुला प्रकरण नहीं।')}
        />
      </Card>

      <Card>
        <CardHead
          title={pick(lang, 'Your recent visits', 'आपके हाल के भ्रमण')}
          right={<Link href="/visits" className="link text-[13px]">{pick(lang, 'All visits', 'सभी भ्रमण')}</Link>}
        />
        {visits.length === 0 ? <Empty /> : (
          <ul className="divide-y divide-line">
            {visits.map((v) => (
              <li key={v.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 sm:px-5">
                <span className="tnum w-24 shrink-0 text-[12.5px] text-ink-faint">{fmtDate(v.visit_date)}</span>
                <Pill>{v.purpose.replace(/_/g, ' ')}</Pill>
                <Link href={`/schools/${v.school_id}`} className="link text-[13px]">
                  {visitSchools.get(v.school_id) ?? v.school_id}
                </Link>
                {v.case_id ? <Link href={`/cases/${v.case_id}`} className="text-[12px] text-ink-faint hover:text-ink">{v.case_id}</Link> : null}
                {v.sync_status === 'pending_sync' ? (
                  <Pill tone="warn">{pick(lang, 'not yet synced', 'सिंक नहीं हुआ')}</Pill>
                ) : null}
                {v.notes ? <span className="basis-full text-[12.5px] text-ink-soft">{v.notes}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {todo.length === 0 && overdueCount === 0 ? (
        <Callout tone="good">{pick(lang, 'Nothing is waiting on you.', 'आपकी प्रतीक्षा में कुछ नहीं।')}</Callout>
      ) : null}
    </div>
  );
}
