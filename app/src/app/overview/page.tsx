import Link from 'next/link';
import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { headline } from '@/lib/dash';
import { priorityActions, recentActivity, learningTrend, lifecycleCounts, deliveryProgress, systemStatus } from '@/lib/overview';
import { outcomeMix } from '@/lib/dash';
import { scopeName } from '@/lib/repo';
import { aiStatus } from '@/lib/ai/config';
import { may } from '@/lib/guard';
import { now } from '@/lib/clock';
import { pick } from '@/lib/i18n';
import { Stat, fmtDate } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { PriorityList, ActivityFeed, StackedBar, HBarList } from '@/components/overview';
import { AiBriefing } from '@/components/AiBriefing';
import { TrendChart } from '@/components/charts';
import { SERIES } from '@/lib/viz';
import { ROLE_LABELS } from '@domain/permissions';
import { ComplaintsPanel, MapPanel, PerformanceTable, EscalationsPanel } from '@/components/role-panels';
import { can } from '@/lib/authz';

/**
 * The operational overview: "what needs my attention today to improve learning outcomes?"
 * Every figure is computed from the records in the user's scope. Technical controls (demo
 * clock, reset, sweep, jobs, outbox) live under Administration → System & demo controls.
 */


export default async function OverviewPage() {
  const session = await pageSession();
  const lang = await getLanguage();

  const h = headline(session);
  const pa = priorityActions(session, 7);
  const trend = learningTrend(session);
  const stages = lifecycleCounts(session);
  const delivery = deliveryProgress(session);
  const outcomes = outcomeMix(session);
  const activity = recentActivity(session, 7);
  const sys = systemStatus();
  const ai = aiStatus();
  const scope = scopeName(session.scope_type, session.scope_id);
  const role = ROLE_LABELS[session.role];

  const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(now()));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = session.full_name.split(' ')[0];

  const outcomeRows = [
    { key: 'confirmed', label: 'Gain confirmed', value: outcomes.find((o) => o.category === 'improved_confirmed')?.c ?? 0, className: 'bg-good' },
    { key: 'indicative', label: 'Gain indicative', value: outcomes.find((o) => o.category === 'improved_indicative')?.c ?? 0, className: 'bg-brand-soft' },
    { key: 'inconclusive', label: 'Inconclusive', value: outcomes.find((o) => o.category === 'inconclusive')?.c ?? 0, className: 'bg-navy-200' },
    { key: 'none', label: 'No gain / below target', value: (outcomes.find((o) => o.category === 'no_change')?.c ?? 0) + (outcomes.find((o) => o.category === 'below_target')?.c ?? 0), className: 'bg-warn' },
    { key: 'worse', label: 'Worsened', value: outcomes.find((o) => o.category === 'worsened')?.c ?? 0, className: 'bg-crit' },
  ].map(({ key, ...r }) => ({ ...r, key }));

  return (
    <div className="space-y-6">
      {/* A — welcome and scope */}
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-[13px] font-medium text-ink-faint">{fmtDate(sys.demoDate)} · {pick(lang, role?.en ?? session.role, role?.hi ?? session.role)} · {scope}</p>
          <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]">
            {pick(lang, `${greet}, ${firstName}.`, `नमस्ते, ${firstName}।`)}
          </h1>
          <p className="mt-1 text-[15px] text-ink-soft">
            {pa.items.length > 0
              ? pick(lang, `Here is what needs your attention today — ${pa.items.length} priority item${pa.items.length === 1 ? '' : 's'}.`, `आज आपके ध्यान की ज़रूरत — ${pa.items.length} प्राथमिक कार्य।`)
              : pick(lang, 'Nothing urgent is waiting on you today.', 'आज कोई तात्कालिक कार्य नहीं।')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="chip border-line-strong bg-white text-ink-soft"><Icon name="database" size={13} />{pick(lang, 'Latest round', 'नवीनतम दौर')}: {sys.latestRound ?? '—'}</span>
          <span className={`chip ${ai.configured ? 'border-good/30 bg-good-light text-good' : 'border-warn/30 bg-warn-light text-warn'}`}><Icon name="sparkles" size={13} />AI {ai.configured ? 'connected' : 'not connected'}</span>
          {sys.clockMoved ? <span className="chip border-warn/30 bg-warn-light text-warn"><Icon name="clock" size={13} />Demo clock moved</span> : null}
          <span className="chip border-warn/30 bg-warn-light text-warn">Fictional data</span>
        </div>
      </header>

      {/* B — key indicators */}
      <section aria-label={pick(lang, 'Key indicators', 'मुख्य संकेतक')} className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={pick(lang, 'Open cases', 'खुले प्रकरण')} value={h.open_cases} href="/cases?status=open" icon={<Icon name="briefcase" size={16} />}
          sub={h.critical > 0 ? <span className="text-crit">{h.critical} critical</span> : 'none critical'} tone={h.critical > 0 ? 'crit' : 'neutral'} />
        <Stat label={pick(lang, 'Pending approvals', 'लंबित स्वीकृतियाँ')} value={pa.counts.approval || h.awaiting_approval} href={may(session, 'plan.approve_block') || may(session, 'plan.approve_district_or_pab') ? '/approvals' : '/cases?status=awaiting_approval'} icon={<Icon name="shield" size={16} />}
          sub={pa.counts.approval ? 'waiting on your decision' : `${h.awaiting_approval} awaiting someone’s decision`} tone={pa.counts.approval ? 'warn' : 'neutral'} />
        <Stat label={pick(lang, 'Overdue actions', 'विलंबित कार्य')} value={h.overdue_tasks} href="/execution?tab=overdue" icon={<Icon name="clock" size={16} />}
          sub={`${h.escalated_tasks} escalated to the district`} tone={h.overdue_tasks > 0 ? 'crit' : 'good'} />
        <Stat label={pick(lang, 'Awaiting outcome check', 'परिणाम जाँच प्रतीक्षित')} value={h.outcome_pending} href="/cases?status=outcome_pending" icon={<Icon name="target" size={16} />}
          sub="delivered; next round decides" tone="pend" />
        <Stat label={pick(lang, 'Verified improvements', 'सत्यापित सुधार')} value={h.closed_verified} href="/impact" icon={<Icon name="check-circle" size={16} />}
          sub={`${h.reopened} reopened — no gain shown`} tone="good" />
      </section>

      {session.scope_type === 'state' || session.scope_type === 'district' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <PerformanceTable s={session} />
          <EscalationsPanel s={session} />
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {/* C — priority actions */}
          <section className="card overflow-hidden" aria-labelledby="pa-title">
            <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
              <div>
                <h2 id="pa-title" className="text-[16px] font-semibold tracking-tight text-ink">{pick(lang, 'Priority actions', 'प्राथमिक कार्य')}</h2>
                <p className="text-[12.5px] text-ink-faint">{pick(lang, 'Ranked by severity, then age. Each links to where the action is taken.', 'गंभीरता और अवधि के क्रम में।')}</p>
              </div>
              <div className="hidden flex-wrap gap-1.5 text-[11.5px] sm:flex">
                {pa.counts.approval ? <span className="chip border-line-strong bg-paper-sunk text-ink-soft">{pa.counts.approval} approvals</span> : null}
                {pa.counts.overdue ? <span className="chip border-line-strong bg-paper-sunk text-ink-soft">{pa.counts.overdue} late tasks</span> : null}
                {pa.counts.evidence ? <span className="chip border-line-strong bg-paper-sunk text-ink-soft">{pa.counts.evidence} proofs</span> : null}
              </div>
            </header>
            <PriorityList items={pa.items} empty={pick(lang, 'Nothing is waiting on you right now.', 'अभी आपकी प्रतीक्षा में कुछ नहीं।')} />
          </section>

          {can(session, 'resolve_complaint') ? <ComplaintsPanel s={session} mode="respond" /> : null}

          {/* D — hotspots, on the live map at the user's own scope */}
          <MapPanel title={pick(lang, 'Learning hotspots', 'अधिगम हॉटस्पॉट')} height={360} />

          {/* E — trends */}
          <section className="card overflow-hidden" aria-labelledby="tr-title">
            <header className="border-b border-line px-4 py-3.5 sm:px-5">
              <h2 id="tr-title" className="text-[16px] font-semibold tracking-tight text-ink">{pick(lang, 'Learning across assessment rounds', 'आकलन दौरों में अधिगम')}</h2>
              <p className="text-[12.5px] text-ink-faint">{pick(lang, 'Pooled % of assessed students at grade benchmark, all grades and competencies. Endline rounds run higher than baselines every year (summer learning loss), so compare like with like.', 'सभी कक्षाओं व दक्षताओं का संयुक्त %।')}</p>
            </header>
            <div className="p-4 sm:p-5">
              <TrendChart
                xLabels={trend.labels}
                series={[
                  { key: 'scope', label: trend.scopeLabel, color: SERIES.one, points: trend.scope },
                  ...(session.scope_type !== 'state' ? [{ key: 'state', label: 'Whole state', color: SERIES.two, points: trend.state, dashed: true }] : []),
                ]}
                yMax={70}
                caption={`% proficient by round for ${trend.scopeLabel}`}
                height={220}
              />
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {/* F — AI briefing */}
          {may(session, 'ai.assistant') ? <AiBriefing /> : null}

          <section className="card p-4 sm:p-5" aria-labelledby="st-title">
            <h2 id="st-title" className="text-[15px] font-semibold text-ink">{pick(lang, 'Cases by stage', 'चरण अनुसार प्रकरण')}</h2>
            <p className="mb-3 text-[12px] text-ink-faint">{pick(lang, 'Click a stage to open those cases.', 'चरण पर क्लिक करें।')}</p>
            <HBarList
              rows={stages.map((st) => ({ key: st.status, label: st.label, value: st.c, tone: st.status === 'closed' ? 'bg-good' : st.status === 'awaiting_approval' ? 'bg-warn' : st.status === 'dismissed' || st.status === 'referred_pab' ? 'bg-navy-200' : 'bg-navy-600' }))}
              href={(k) => `/cases?status=${k}`}
            />
          </section>

          <section className="card p-4 sm:p-5" aria-labelledby="dl-title">
            <h2 id="dl-title" className="text-[15px] font-semibold text-ink">{pick(lang, 'Delivery on open cases', 'खुले प्रकरणों पर कार्य')}</h2>
            <p className="mb-3 text-[12px] text-ink-faint">{pick(lang, 'Tasks by state. Verified means someone other than the submitter accepted the proof.', 'सत्यापित = जमा करने वाले के अलावा किसी ने सबूत स्वीकारा।')}</p>
            <StackedBar label="Task delivery" parts={[
              { label: 'Verified', value: delivery.verified, className: 'bg-good' },
              { label: 'Proof submitted', value: delivery.submitted, className: 'bg-pend' },
              { label: 'In progress', value: delivery.inProgress, className: 'bg-brand-soft' },
              { label: 'Not started', value: delivery.notStarted, className: 'bg-navy-200' },
              { label: 'Sent back', value: delivery.sentBack, className: 'bg-warn' },
            ]} />
          </section>

          <section className="card p-4 sm:p-5" aria-labelledby="oc-title">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 id="oc-title" className="text-[15px] font-semibold text-ink">{pick(lang, 'Did the work move learning?', 'क्या काम से अधिगम बढ़ा?')}</h2>
                <p className="mb-3 text-[12px] text-ink-faint">{pick(lang, 'All pre-registered outcome checks in scope.', 'सभी पूर्व-पंजीकृत परिणाम जाँच।')}</p>
              </div>
              <Link href="/impact" className="link text-[12.5px]">{pick(lang, 'Details', 'विवरण')}</Link>
            </div>
            <StackedBar label="Outcome checks" parts={outcomeRows} />
          </section>

          {/* G — activity */}
          <section className="card overflow-hidden" aria-labelledby="ac-title">
            <header className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
              <h2 id="ac-title" className="text-[15px] font-semibold text-ink">{pick(lang, 'Recent activity', 'हाल की गतिविधि')}</h2>
              {may(session, 'audit.view') ? <Link href="/audit" className="link text-[12.5px]">{pick(lang, 'Full audit history', 'पूर्ण अंकेक्षण')}</Link> : null}
            </header>
            <ActivityFeed items={activity} />
          </section>
        </div>
      </div>
    </div>
  );
}
