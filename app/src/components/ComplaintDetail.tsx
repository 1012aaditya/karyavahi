import Link from 'next/link';
import type { Session } from '@/lib/session';
import { complaintAccess, complaintEvents, availableActions, categories, STATUS, STATUS_HI, CATEGORY_HI, ACTION_HI, slaState, routeHi } from '@/lib/complaints';
import type { Language } from '@domain/types';
import { ROLE_LABELS } from '@domain/permissions';
import { userNames, scopeName } from '@/lib/repo';
import { Mono, fmtDate } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ComplaintStatus, PriorityChip } from '@/components/complaint-bits';
import { ActionForm, ReasonBox, Disclose } from '@/components/ActionForm';
import { complaintActionAction, escalateComplaintAction, linkComplaintCaseAction } from '@/lib/actions';

/**
 * One complaint's content, shared by the full page (/complaints/[id]) and the inbox drawer
 * (/complaints?open=…). Access is resolved here with complaintAccess, so both entry points apply
 * exactly the same rule: the complainant sees status and resolution but never internal notes;
 * the assigned authority sees everything and the actions; oversight is read-only.
 * Returns null when the viewer may not see the complaint.
 */

const RELATION_LABEL = {
  reporter: 'You raised this complaint', assignee: 'This complaint is assigned to you',
  past_handler: 'This complaint was routed through you', oversight: 'Read-only oversight view (inside your scope)', auditor: 'Auditor view of a restricted complaint',
} as const;
const RELATION_LABEL_HI = {
  reporter: 'यह शिकायत आपने दर्ज की', assignee: 'यह शिकायत आपको सौंपी गई है',
  past_handler: 'यह शिकायत आपसे होकर आगे गई', oversight: 'केवल देखने हेतु निगरानी (आपके दायरे में)', auditor: 'प्रतिबंधित शिकायत का लेखा परीक्षक दृश्य',
} as const;
/** Timeline steps with no status of their own, in Hindi. */
const EVENT_HI: Record<string, string> = { submitted: 'दर्ज हुई', status_changed: 'स्थिति बदली', routed: 'मार्ग नियम लागू', system: 'प्रणाली' };
const roleHi = (r: string | null) => (r ? ROLE_LABELS[r as keyof typeof ROLE_LABELS]?.hi ?? r : '');

export function ComplaintDetail({ session, id, layout = 'page', lang = 'en' }: { session: Session; id: string; layout?: 'page' | 'drawer'; lang?: Language }) {
  const L = (en: string, hi: string) => (lang === 'hi' ? hi : en);
  const hi = lang === 'hi';
  const a = complaintAccess(session, id.toUpperCase());
  if (!a) return null;
  const { complaint: c, relation } = a;
  const internal = relation !== 'reporter';
  const events = complaintEvents(c.id, internal);
  const names = userNames([c.reporter_user_id, c.assigned_user_id ?? '', ...events.map((e) => e.actor_user_id ?? ''), ...events.map((e) => e.assigned_to ?? '')]);
  const cat = categories().find((x) => x.key === c.category_key);
  const { acts, canEscalate } = availableActions(session, c, relation);
  const sla = slaState(c, lang);
  const statusText = (s: string) => (hi ? STATUS_HI[s] : undefined) ?? STATUS[s]?.label ?? s;
  const actLabel = (l: string) => (hi ? ACTION_HI[l] ?? l : l);
  const where = c.school_id ? scopeName('school', c.school_id) : c.cluster_id ? scopeName('cluster', c.cluster_id) : c.block_id ? scopeName('block', c.block_id) : c.district_id ? scopeName('district', c.district_id) : '—';
  const expected = ['submitted', 'escalated'].includes(c.status) ? L(`Acknowledgement due ${fmtDate(c.ack_due)}`, `पावती की अंतिम तिथि ${fmtDate(c.ack_due, false, lang)}`) : STATUS[c.status]?.open ? L(`Resolution due ${fmtDate(c.resolve_due)}`, `समाधान की अंतिम तिथि ${fmtDate(c.resolve_due, false, lang)}`) : null;
  const drawer = layout === 'drawer';

  const header = (
    <header className={drawer ? 'border-b border-line px-5 py-4' : 'card p-5 sm:p-6'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-faint"><Mono>{c.id}</Mono> · {(hi ? CATEGORY_HI[c.category_key]?.label : undefined) ?? cat?.label ?? c.category_key} · {where}</p>
          <h1 className={`mt-0.5 font-semibold leading-tight tracking-tight text-ink ${drawer ? 'text-lg' : 'text-2xl'}`}>{c.title}</h1>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ComplaintStatus status={c.status} lang={lang} /><PriorityChip p={c.priority} lang={lang} />
          {c.confidentiality === 'restricted' ? <span className="chip border-crit/30 bg-crit-light text-crit"><Icon name="lock" size={11} />{L('Restricted', 'प्रतिबंधित')}</span> : null}
          {c.provenance === 'synthetic_demo' ? <span className="chip border-warn/30 bg-warn-light text-warn">{L('Fictional', 'काल्पनिक')}</span> : null}
        </div>
      </div>
      <dl className={`mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 text-sm ${drawer ? '' : 'sm:grid-cols-4'}`}>
        <div><dt className="label">{L('Raised by', 'दर्ज करने वाले')}</dt><dd className="mt-0.5 font-medium text-ink">{names.get(c.reporter_user_id)}<span className="block text-xs font-normal uppercase text-ink-faint">{hi ? roleHi(c.reporter_role) : c.reporter_role}</span></dd></div>
        <div><dt className="label">{L('Responsible authority', 'ज़िम्मेदार अधिकारी')}</dt><dd className="mt-0.5 font-medium text-ink">{names.get(c.assigned_user_id ?? '') ?? '—'}<span className="block text-xs font-normal uppercase text-ink-faint">{hi ? roleHi(c.assigned_role) : c.assigned_role}{c.escalation_level ? L(` · escalated ×${c.escalation_level}`, ` · ${c.escalation_level}× ऊपर भेजी गई`) : ''}</span></dd></div>
        <div><dt className="label">{L('Submitted', 'दर्ज')}</dt><dd className="mt-0.5 font-medium text-ink">{fmtDate(c.created_at, false, lang)}</dd></div>
        <div><dt className="label">{L('Expected response', 'अपेक्षित उत्तर')}</dt><dd className={`mt-0.5 font-medium ${sla.tone === 'crit' ? 'text-crit' : sla.tone === 'warn' ? 'text-warn' : 'text-ink'}`}>{expected ?? L('Not open', 'खुली नहीं')}{sla.label ? <span className="block text-xs font-normal">{sla.label}</span> : null}</dd></div>
      </dl>
      <p className="mt-4 rounded-lg bg-paper-sunk px-3 py-2 text-sm text-ink-soft"><Icon name="info" size={13} className="mr-1 inline" />{hi ? `${RELATION_LABEL_HI[relation]}।` : `${RELATION_LABEL[relation]}.`}</p>
    </header>
  );

  const description = (
    <section className={drawer ? 'border-b border-line px-5 py-4' : 'card p-5'}>
      <h2 className="sub-title">{L('Description', 'विवरण')}</h2>
      <p className="mt-1.5 whitespace-pre-wrap text-base leading-relaxed text-ink-soft">{c.description}</p>
      {c.resolution_summary ? <div className="mt-4 rounded-lg border border-good/30 bg-good-light/60 p-3"><p className="text-sm font-semibold text-good">{L('Resolution', 'समाधान')}</p><p className="text-sm text-ink">{c.resolution_summary}</p></div> : null}
      {c.case_id ? <p className="mt-3 text-sm">{L('Linked case:', 'जुड़ा प्रकरण:')} <Link href={`/cases/${c.case_id}`} className="link">{c.case_id}</Link></p> : null}
    </section>
  );

  const nextStep = (
    <section className={drawer ? 'border-b border-line bg-paper-sunk/50 px-5 py-4' : 'card p-4'}>
      <h2 className="sub-title">{L('Next step', 'अगला कदम')}</h2>
      {acts.length === 0 && !canEscalate ? (
        <p className="mt-1.5 text-sm text-ink-soft">{relation === 'oversight' || relation === 'auditor' ? L('Read-only: only the assigned authority can act on this complaint.', 'केवल देखने हेतु: इस शिकायत पर केवल सौंपा गया अधिकारी कार्य कर सकता है।') : relation === 'past_handler' ? L('This complaint has moved on from you.', 'यह शिकायत आपसे आगे जा चुकी है।') : STATUS[c.status]?.open ? L('Waiting on the responsible office.', 'ज़िम्मेदार कार्यालय की प्रतीक्षा।') : L('Nothing further to do.', 'आगे कुछ करना नहीं है।')}</p>
      ) : (
        <div className="mt-2 space-y-2.5">
          {acts.map((t) => t.needsNote ? (
            <Disclose key={t.action} label={actLabel(t.label)}>
              <ActionForm action={complaintActionAction} hidden={{ complaint_id: c.id, action: t.action }} label={actLabel(t.label)} tone={t.action === 'reject' || t.action === 'dispute' ? 'danger' : 'primary'}>
                <ReasonBox name="note" required label={t.action === 'propose' ? L('Proposed resolution', 'प्रस्तावित समाधान') : t.action === 'request_info' ? L('What do you need?', 'आपको क्या चाहिए?') : L('Note', 'टिप्पणी')} rows={3} />
              </ActionForm>
            </Disclose>
          ) : (
            <ActionForm key={t.action} action={complaintActionAction} hidden={{ complaint_id: c.id, action: t.action, note: '' }} label={actLabel(t.label)} tone={t.action === 'confirm' || t.action === 'close' ? 'good' : 'primary'} />
          ))}
          {canEscalate ? (
            <Disclose label={L('Escalate…', 'ऊपर भेजें…')} tone="danger">
              <ActionForm action={escalateComplaintAction} hidden={{ complaint_id: c.id }} label={L('Escalate to next authority', 'अगले अधिकारी को भेजें')} tone="danger">
                <ReasonBox name="reason" required label={L('Why it needs the next level', 'अगले स्तर की ज़रूरत क्यों है')} rows={3} />
              </ActionForm>
            </Disclose>
          ) : null}
        </div>
      )}
      {relation === 'assignee' && !c.case_id ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-sm font-medium text-ink">{L('Link to a learning case', 'अधिगम प्रकरण से जोड़ें')}</p>
          <p className="mt-0.5 text-xs text-ink-faint">{L('A complaint stays separate from a case; linking records the relationship.', 'शिकायत प्रकरण से अलग रहती है; जोड़ने से केवल संबंध दर्ज होता है।')}</p>
          <ActionForm action={linkComplaintCaseAction} hidden={{ complaint_id: c.id }} label={L('Link case', 'प्रकरण जोड़ें')} tone="quiet" className="mt-2">
            <input name="case_id" required placeholder="CASE-0184" className="input mb-2 h-9 text-sm" pattern="CASE-\d{4}" />
          </ActionForm>
        </div>
      ) : null}
    </section>
  );

  const timeline = (
    <section className={drawer ? 'px-5 py-4' : 'card overflow-hidden'} aria-label={L('Timeline', 'घटनाक्रम')}>
      <header className={drawer ? 'mb-3' : 'border-b border-line px-5 py-3'}>
        <h2 className="sub-title">{L('Timeline', 'घटनाक्रम')}</h2>
        <p className="text-xs text-ink-faint">{internal ? L('Includes internal notes (shaded), which the complainant does not see.', 'आंतरिक टिप्पणियाँ (छायांकित) भी शामिल हैं, जो शिकायतकर्ता को नहीं दिखतीं।') : L('Updates from the responsible office.', 'ज़िम्मेदार कार्यालय से अद्यतन।')} {L('Every step is also in the audit chain.', 'हर कदम अंकेक्षण-श्रृंखला में भी दर्ज है।')}</p>
      </header>
      <ol className={drawer ? '' : 'px-5 py-4'}>
        {events.map((e, i) => (
          <li key={e.id} className={`relative flex gap-3 pb-4 last:pb-0 ${e.internal ? 'rounded-lg bg-paper-sunk px-2 py-1.5' : ''}`}>
            {i < events.length - 1 ? <span className="absolute left-[5px] top-4 h-full w-px bg-line" aria-hidden /> : null}
            <span className={`relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-2 ring-white ${e.kind === 'escalated' ? 'bg-crit' : e.kind === 'resolved' || e.kind === 'closed' ? 'bg-good' : 'bg-navy-300'}`} />
            <div className="min-w-0">
              <p className="text-sm text-ink">
                <span className="font-medium">{e.kind === 'routed' ? L('Routing rule applied', 'मार्ग नियम लागू') : e.to_status ? statusText(e.to_status) : (hi ? EVENT_HI[e.kind] : undefined) ?? e.kind.replace(/_/g, ' ')}</span>
                {e.assigned_to ? <span className="text-ink-soft"> → {names.get(e.assigned_to) ?? e.assigned_to}</span> : null}
                {e.internal ? <span className="ml-1.5 chip border-line-strong bg-white text-ink-faint">{L('internal', 'आंतरिक')}</span> : null}
              </p>
              {e.note ? <p className="text-sm text-ink-soft">{hi && e.kind === 'routed' ? routeHi(e.note) : e.note}</p> : null}
              <p className="text-xs text-ink-faint">{e.actor_user_id ? names.get(e.actor_user_id) ?? e.actor_label : (hi ? EVENT_HI[e.actor_label] : undefined) ?? e.actor_label} · {fmtDate(e.ts, true, lang)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );

  const rules = (
    <section className={drawer ? 'border-t border-line px-5 py-4 text-sm text-ink-soft' : 'card p-4 text-sm text-ink-soft'}>
      <h2 className="mb-1 text-base font-semibold text-ink">{L('How this complaint moves', 'यह शिकायत कैसे आगे बढ़ती है')}</h2>
      <ul className="space-y-1">
        <li>• {L(`Acknowledge by ${fmtDate(c.ack_due)}; otherwise it escalates automatically.`, `${fmtDate(c.ack_due, false, lang)} तक पावती दें; अन्यथा यह अपने-आप ऊपर जाती है।`)}</li>
        <li>• {L(`Resolve by ${fmtDate(c.resolve_due)}; otherwise it escalates to the next designated authority.`, `${fmtDate(c.resolve_due, false, lang)} तक हल करें; अन्यथा यह अगले निर्धारित अधिकारी के पास जाती है।`)}</li>
        <li>• {L('The authority may escalate earlier with a written reason. Nobody skips a level unless a policy says so.', 'अधिकारी लिखित कारण सहित पहले भी ऊपर भेज सकता है। नीति के बिना कोई स्तर नहीं छोड़ा जाता।')}</li>
        {c.confidentiality === 'restricted' ? <li className="text-crit">• {L('Restricted: never visible to the officer it concerns, or to seniors not on its route.', 'प्रतिबंधित: संबंधित अधिकारी को, या मार्ग से बाहर के वरिष्ठों को, कभी नहीं दिखती।')}</li> : null}
      </ul>
    </section>
  );

  if (drawer) return <div>{header}{nextStep}{description}{timeline}{rules}</div>;
  return (
    <div className="space-y-5">
      {header}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,68fr)_minmax(300px,32fr)]">
        <div className="space-y-5">{description}{timeline}</div>
        <aside className="space-y-4 lg:sticky lg:top-[96px] lg:self-start">{nextStep}{rules}</aside>
      </div>
    </div>
  );
}
