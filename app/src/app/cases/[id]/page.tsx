import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { may, canDecideLever } from '@/lib/guard';
import { caseBundle, caseExists } from '@/lib/cases';
import {
  userNames, schoolNames, placeNames, competency, rounds, clusterTrend, intervention, caseVisits,
  type VisitRow,
} from '@/lib/repo';
import { auditFor } from '@/lib/feed';
import { today } from '@/lib/clock';
import { pick } from '@/lib/i18n';
import {
  Card, CardHead, PageHead, Callout, Facts, Field, Grid, Stat, Mono, Empty,
  fmtDate, fmtPct, shortHash,
} from '@/components/ui';
import { Pill, StatusPill, SeverityPill, OutcomePill, ProvenanceChip } from '@/components/labels';
import {
  FindingPanel, DiagnosisPanel, PlanPanel, WorkPanel, ProofPanel, OutcomePanel, TimelinePanel,
  type Names,
} from '@/components/case-panels';
import { ActionForm, ReasonBox, Disclose } from '@/components/ActionForm';
import {
  decidePlanAction, transitionAction, setConclusionAction, recomputeOutcomeAction, reviewOutcomeAction,
} from '@/lib/actions';
import { TRANSITIONS, STATUS_LABELS, reasonRequired } from '@domain/lifecycle';
import type { CaseStatus } from '@domain/types';

/**
 * One case, end to end.
 *
 * The page is laid out as the seven questions in order — what was found, what the data shows,
 * what will be done, who owes what, what proof exists, did it work, and what happened when.
 * Actions appear only where the signed-in role may actually take them; anything else the
 * lifecycle permits is listed but shown as out of this role's hands, so the rule is visible
 * rather than mysterious.
 */

export default async function CasePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const session = await pageSession();
  const lang = await getLanguage();
  const { id } = await params;
  const { done } = await searchParams;

  const bundle = caseBundle(session, id);
  if (!bundle) {
    if (caseExists(id)) {
      // Say which it is. Pretending the record does not exist would be a worse answer.
      return (
        <div className="mx-auto max-w-2xl">
          <PageHead title={pick(lang, 'Outside your scope', 'आपके दायरे से बाहर')} />
          <Callout tone="warn" title={`${id}`}>
            {pick(
              lang,
              'This case exists but sits outside the block, cluster or school your role covers, and you do not own any task on it. The server refuses the record rather than hiding that it is there.',
              'यह प्रकरण मौजूद है पर आपके दायरे से बाहर है, और इसका कोई काम आपके पास नहीं है।',
            )}
          </Callout>
          <p className="mt-4"><Link href="/cases" className="link">{pick(lang, 'Back to cases', 'प्रकरणों पर वापस')}</Link></p>
        </div>
      );
    }
    notFound();
  }

  const { case: c, finding, diagnosis, plans, currentPlan, approvals, tasks, evidence, outcomes, timeline } = bundle;
  const places = placeNames();
  const comp = competency(c.competency_id);
  const allSchoolIds = [
    ...c.school_ids,
    ...(finding?.driver_schools.map((d) => d.school_id) ?? []),
    ...tasks.map((t) => t.school_id).filter((x): x is string => !!x),
    ...evidence.map((e) => e.school_id).filter((x): x is string => !!x),
    ...outcomes.flatMap((o) => [...o.treated, ...o.comparison].map((r) => r.school_id)),
    ...(currentPlan?.pre_registration?.comparison_school_ids ?? []),
  ];
  const names: Names = {
    users: userNames([
      c.owner_user_id,
      ...tasks.map((t) => t.owner_user_id),
      ...evidence.flatMap((e) => [e.submitted_by, e.verified_by ?? '']),
      ...approvals.flatMap((a) => [a.submitted_by, a.decided_by ?? '']),
      ...timeline.map((e) => e.actor_user_id ?? ''),
      ...outcomes.map((o) => o.reviewed_by ?? ''),
      diagnosis?.human_conclusion_by ?? '',
    ]),
    schools: schoolNames([...new Set(allSchoolIds)]),
    clusters: places.clusters,
    blocks: places.blocks,
    districts: places.districts,
    competency: pick(lang, comp?.name_en ?? c.competency_id, comp?.name_hi ?? c.competency_id),
    roundLabels: new Map(rounds().map((r) => [r.id, `${r.code} · ${r.label}`])),
  };

  const trend = finding
    ? clusterTrend(session, c.cluster_id, c.district_id, c.grade, c.competency_id)
    : [];
  const iv = currentPlan ? intervention(currentPlan.intervention_id) : null;
  const visits = caseVisits(session, c.id);
  const audit = may(session, 'audit.view') ? auditFor(session, 'case', c.id, 60) : [];

  const legalNext = TRANSITIONS[c.status] ?? [];
  const decidesLever = canDecideLever(session, c.lever);
  const pendingApproval = approvals.find((a) => a.decision === 'pending');
  const eligibleOutcome = outcomes.find((o) => o.closure_eligible);

  /** Which of the legal next moves this role may actually make, and why not otherwise. */
  function gate(to: CaseStatus): { allowed: boolean; why: string } {
    const needsLever = ['approved', 'revision_requested', 'referred_pab'].includes(to)
      || (c.status === 'awaiting_approval' && to === 'under_investigation');
    if (needsLever && !decidesLever) {
      return {
        allowed: false,
        why: pick(
          lang,
          c.lever === 'block'
            ? 'Only the block officer or the DEO decides a block-lever plan.'
            : 'Only the DEO or the state programme team decides a district or PAB plan.',
          c.lever === 'block' ? 'केवल खंड अधिकारी या DEO निर्णय ले सकते हैं।' : 'केवल DEO या राज्य दल निर्णय ले सकते हैं।',
        ),
      };
    }
    if (to === 'closed') {
      if (!may(session, 'case.close')) return { allowed: false, why: pick(lang, 'Your role cannot close cases.', 'आपकी भूमिका प्रकरण बंद नहीं कर सकती।') };
      if (!eligibleOutcome) {
        return {
          allowed: false,
          why: pick(
            lang,
            'Closing needs an outcome evaluation that clears every closure rule.',
            'बंद करने के लिए सभी नियम पूरे करने वाली परिणाम जाँच आवश्यक।',
          ),
        };
      }
    }
    if (to === 'reopened' && !may(session, 'case.reopen')) {
      return { allowed: false, why: pick(lang, 'Your role cannot reopen cases.', 'आपकी भूमिका प्रकरण फिर से नहीं खोल सकती।') };
    }
    if (to === 'outcome_pending') {
      const unverified = tasks.filter((t) => !t.verified_at).length;
      if (unverified > 0) {
        return {
          allowed: false,
          why: pick(lang, `${unverified} task(s) still have no verified proof.`, `${unverified} काम का सबूत सत्यापित नहीं।`),
        };
      }
      if (!tasks.some((t) => t.cross_source && t.verified_at)) {
        return { allowed: false, why: pick(lang, 'An independent check is required first.', 'पहले स्वतंत्र जाँच आवश्यक।') };
      }
    }
    if (to === 'dismissed' && !may(session, 'case.edit_diagnosis')) {
      return { allowed: false, why: pick(lang, 'Your role cannot dismiss a finding.', 'आपकी भूमिका निष्कर्ष ख़ारिज नहीं कर सकती।') };
    }
    return { allowed: true, why: '' };
  }

  return (
    <article className="space-y-4">
      <PageHead
        breadcrumb={
          <>
            <Link href="/cases" className="link">{pick(lang, 'Cases', 'प्रकरण')}</Link>
            {' › '}
            <Mono>{c.id}</Mono>
          </>
        }
        title={c.title}
        sub={
          <>
            {pick(lang, 'Class', 'कक्षा')} {c.grade} · {names.competency} ·{' '}
            {names.clusters.get(c.cluster_id) ?? c.cluster_id} {pick(lang, 'cluster', 'संकुल')} ·{' '}
            {names.blocks.get(c.block_id) ?? c.block_id} ·{' '}
            {names.districts.get(c.district_id) ?? c.district_id}
          </>
        }
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StatusPill status={c.status} lang={lang} />
            <SeverityPill severity={c.severity} lang={lang} />
            {c.closure_type ? <OutcomePill category={c.closure_type} lang={lang} /> : null}
            <ProvenanceChip provenance="synthetic_demo" lang={lang} />
          </div>
        }
      />

      <Grid cols={5}>
        <Stat label={pick(lang, 'Accountable officer', 'उत्तरदायी अधिकारी')} value={
          <span className="text-base">{names.users.get(c.owner_user_id) ?? c.owner_user_id}</span>
        } sub={c.lever === 'block' ? pick(lang, 'block lever', 'खंड स्तर') : c.lever === 'district' ? pick(lang, 'district lever', 'ज़िला स्तर') : 'PAB'} />
        <Stat label={pick(lang, 'Opened', 'खोला गया')} value={<span className="text-base">{fmtDate(c.created_at)}</span>}
          sub={c.origin === 'detected' ? pick(lang, 'by the detector', 'पहचान-तंत्र द्वारा') : pick(lang, 'by an officer', 'अधिकारी द्वारा')} />
        <Stat label={pick(lang, 'Due', 'नियत तिथि')} value={<span className="text-base">{fmtDate(c.due_date)}</span>}
          tone={c.due_date && c.due_date < today() && !c.closed_at ? 'crit' : 'neutral'} />
        <Stat label={pick(lang, 'Proof', 'सबूत')} value={`${evidence.filter((e) => e.status === 'verified').length}/${evidence.length}`}
          sub={pick(lang, 'verified', 'सत्यापित')}
          tone={evidence.length > 0 && evidence.every((e) => e.status === 'verified') ? 'good' : 'neutral'} />
        <Stat label={pick(lang, 'Reopened', 'फिर खोला')} value={c.reopen_count}
          tone={c.reopen_count > 0 ? 'warn' : 'neutral'}
          sub={c.reopen_count > 0 ? pick(lang, 'delivered, but no gain shown', 'कार्य हुआ, सुधार नहीं') : undefined} />
      </Grid>

      {done ? (
        <Callout tone="good" title={pick(lang, 'Done', 'पूर्ण')}>
          {done}
        </Callout>
      ) : null}

      {c.reopen_count > 0 ? (
        <Callout tone="warn" title={pick(lang, 'This case has been reopened', 'यह प्रकरण फिर से खोला गया')}>
          {pick(
            lang,
            'The work was delivered and verified, but the next assessment round did not show the gain the plan was built to produce. Reopening is the honest outcome: it says the intervention did not work here, rather than closing on activity.',
            'कार्य हुआ और सत्यापित हुआ, पर अगले आकलन में अपेक्षित सुधार नहीं दिखा। इसलिए प्रकरण फिर खोला गया।',
          )}
        </Callout>
      ) : null}

      <FindingPanel finding={finding} trend={trend} names={names} lang={lang} grade={c.grade} />

      <DiagnosisPanel diagnosis={diagnosis} names={names} lang={lang}>
        {may(session, 'case.edit_diagnosis') ? (
          <div className="mt-3">
            <Disclose label={diagnosis?.human_conclusion
              ? pick(lang, 'Revise your conclusion', 'अपना निष्कर्ष बदलें')
              : pick(lang, 'Write your conclusion', 'अपना निष्कर्ष लिखें')}>
              <ActionForm
                action={setConclusionAction}
                hidden={{ case_id: c.id }}
                label={pick(lang, 'Record conclusion', 'निष्कर्ष दर्ज करें')}
              >
                <ReasonBox
                  name="text"
                  required
                  rows={4}
                  label={pick(lang, 'What you concluded, in your own words', 'आपका निष्कर्ष, अपने शब्दों में')}
                  placeholder={pick(lang, 'What you believe is going on, and what you checked yourself.', 'आपके अनुसार क्या हो रहा है, और आपने स्वयं क्या जाँचा।')}
                />
              </ActionForm>
            </Disclose>
          </div>
        ) : null}
      </DiagnosisPanel>

      <PlanPanel
        plans={plans} currentPlan={currentPlan} approvals={approvals}
        intervention={iv} names={names} lang={lang}
      >
        {c.status === 'awaiting_approval' && currentPlan ? (
          <div className="rounded-md border border-brand/30 bg-brand-light p-3">
            <h3 className="mb-2 text-[13px] font-semibold text-ink">
              {pick(lang, 'Your decision', 'आपका निर्णय')}
            </h3>
            {!decidesLever ? (
              <Callout tone="warn">
                {gate('approved').why}
                {pendingApproval ? (
                  <p className="mt-1">
                    {pick(lang, 'Waiting on:', 'प्रतीक्षा:')} {pendingApproval.required_role.toUpperCase()}
                  </p>
                ) : null}
              </Callout>
            ) : (
              <div className="flex flex-wrap items-start gap-3">
                <ActionForm
                  action={decidePlanAction}
                  hidden={{ case_id: c.id, plan_id: currentPlan.id, decision: 'approved' }}
                  label={pick(lang, 'Approve the plan', 'योजना स्वीकृत करें')}
                  tone="good"
                  confirm={pick(
                    lang,
                    'Approving locks the comparison schools and the success threshold, then creates the tasks.',
                    'स्वीकृति से तुलना विद्यालय और सफलता लक्ष्य तय हो जाते हैं, फिर काम बनते हैं।',
                  )}
                />
                <Disclose label={pick(lang, 'Send back for changes', 'बदलाव के लिए लौटाएँ')}>
                  <ActionForm
                    action={decidePlanAction}
                    hidden={{ case_id: c.id, plan_id: currentPlan.id, decision: 'revision_requested' }}
                    label={pick(lang, 'Send back', 'लौटाएँ')}
                    tone="quiet"
                  >
                    <ReasonBox required label={pick(lang, 'What needs changing', 'क्या बदलना है')} />
                  </ActionForm>
                </Disclose>
                <Disclose label={pick(lang, 'Reject the plan', 'योजना अस्वीकार करें')} tone="danger">
                  <ActionForm
                    action={decidePlanAction}
                    hidden={{ case_id: c.id, plan_id: currentPlan.id, decision: 'rejected' }}
                    label={pick(lang, 'Reject', 'अस्वीकार')}
                    tone="danger"
                  >
                    <ReasonBox required label={pick(lang, 'Why this plan is wrong for this case', 'यह योजना क्यों उपयुक्त नहीं')} />
                  </ActionForm>
                </Disclose>
                {c.lever !== 'block' || may(session, 'plan.approve_district_or_pab') ? (
                  <Disclose label={pick(lang, 'Refer to the PAB', 'PAB को भेजें')}>
                    <ActionForm
                      action={decidePlanAction}
                      hidden={{ case_id: c.id, plan_id: currentPlan.id, decision: 'approved_for_pab' }}
                      label={pick(lang, 'Refer to PAB', 'PAB को भेजें')}
                      tone="quiet"
                    >
                      <ReasonBox label={pick(lang, 'Note for the PAB', 'PAB के लिए टिप्पणी')} />
                    </ActionForm>
                  </Disclose>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </PlanPanel>

      <WorkPanel tasks={tasks} names={names} lang={lang} today={today()} />

      <ProofPanel evidence={evidence} names={names} lang={lang}>
        {evidence.some((e) => e.status === 'pending') && may(session, 'evidence.verify') ? (
          <div className="border-t border-line px-4 py-3 sm:px-5">
            <p className="text-[13px] text-ink-soft">
              {pick(lang, 'Proof waiting to be checked is handled from', 'जाँचने योग्य सबूत यहाँ से देखें')}{' '}
              <Link href="/evidence" className="link">{pick(lang, 'the proof queue', 'सबूत कतार')}</Link>
              {pick(lang, ', where the separation-of-duties rule is applied.', ', जहाँ कर्तव्य-पृथक्करण नियम लागू होता है।')}
            </p>
          </div>
        ) : null}
      </ProofPanel>

      <OutcomePanel outcomes={outcomes} names={names} lang={lang}>
        <div className="mt-3 flex flex-wrap gap-3">
          {may(session, 'outcome.recompute') ? (
            <ActionForm
              action={recomputeOutcomeAction}
              hidden={{ case_id: c.id, evaluation_id: outcomes[0]?.id ?? '' }}
              label={pick(lang, 'Re-derive from the raw rows', 'मूल डेटा से फिर निकालें')}
              tone="quiet"
              confirm={pick(
                lang,
                'Reads the two rounds back out of the assessment table and runs the same function the validator uses, on this evaluation\'s own terms.',
                'आकलन तालिका से दोनों दौर पढ़कर वही गणना दोहराता है जो सत्यापक करता है।',
              )}
            />
          ) : null}
          {outcomes[0] && !outcomes[0].reviewed_by && may(session, 'outcome.recompute') ? (
            <ActionForm
              action={reviewOutcomeAction}
              hidden={{ case_id: c.id, outcome_id: outcomes[0].id }}
              label={pick(lang, 'Sign off as read', 'पढ़ा हुआ दर्ज करें')}
              tone="quiet"
            />
          ) : null}
        </div>
      </OutcomePanel>

      {/* ---- what can happen next ---- */}
      <Card>
        <CardHead
          title={pick(lang, 'What can happen next', 'आगे क्या हो सकता है')}
          hint={pick(
            lang,
            'The only moves the lifecycle allows from here. Anything not listed is refused by the server, not merely hidden.',
            'यहाँ से केवल ये कदम संभव हैं। अन्य कुछ सर्वर द्वारा अस्वीकृत है।',
          )}
        />
        {legalNext.length === 0 ? (
          <Empty>{pick(lang, 'This case is in a final state.', 'यह प्रकरण अंतिम स्थिति में है।')}</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {legalNext.map((to) => {
              const g = gate(to);
              const needsReason = reasonRequired(c.status, to);
              const label = pick(lang, STATUS_LABELS[to].en, STATUS_LABELS[to].hi);
              // Plan decisions have their own buttons above, with the reasons they need.
              if (c.status === 'awaiting_approval' && ['approved', 'revision_requested', 'under_investigation', 'referred_pab'].includes(to)) {
                return (
                  <li key={to} className="px-4 py-2.5 text-[13px] text-ink-soft sm:px-5">
                    <Pill tone={STATUS_LABELS[to].tone}>{label}</Pill>
                    <span className="ml-2">{pick(lang, 'decided in the plan section above', 'ऊपर योजना अनुभाग में')}</span>
                  </li>
                );
              }
              return (
                <li key={to} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Pill tone={STATUS_LABELS[to].tone}>{label}</Pill>
                      <Mono> {to}</Mono>
                      {needsReason ? (
                        <span className="ml-2 text-[12px] text-warn">{pick(lang, 'needs a written reason', 'लिखित कारण आवश्यक')}</span>
                      ) : null}
                      {!g.allowed ? <p className="mt-1 text-[12.5px] text-ink-soft">{g.why}</p> : null}
                    </div>
                    {g.allowed ? (
                      needsReason ? (
                        <Disclose label={label} tone={to === 'dismissed' || to === 'reopened' ? 'danger' : 'quiet'}>
                          <ActionForm
                            action={transitionAction}
                            hidden={{ case_id: c.id, to }}
                            label={pick(lang, 'Confirm', 'पुष्टि करें')}
                            tone={to === 'dismissed' ? 'danger' : 'primary'}
                          >
                            <ReasonBox required label={pick(lang, 'Reason', 'कारण')} />
                          </ActionForm>
                        </Disclose>
                      ) : (
                        <ActionForm
                          action={transitionAction}
                          hidden={{ case_id: c.id, to }}
                          label={label}
                          tone={to === 'closed' ? 'good' : 'quiet'}
                        />
                      )
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {visits.length > 0 ? (
        <Card>
          <CardHead
            title={pick(lang, 'Visits linked to this case', 'इस प्रकरण से जुड़े भ्रमण')}
            hint={pick(lang, 'Coaching, spot assessments and follow-up visits logged against it.', 'सहयोग, त्वरित आकलन और अनुवर्ती भ्रमण।')}
          />
          <ul className="divide-y divide-line">
            {visits.slice(0, 12).map((v: VisitRow) => (
              <li key={v.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 sm:px-5">
                <span className="tnum w-24 shrink-0 text-[12.5px] text-ink-faint">{fmtDate(v.visit_date)}</span>
                <Pill>{v.purpose.replace(/_/g, ' ')}</Pill>
                <Link href={`/schools/${v.school_id}`} className="link text-[13px]">
                  {names.schools.get(v.school_id) ?? v.school_id}
                </Link>
                <span className="text-[13px] text-ink-soft">{names.users.get(v.visitor_user_id) ?? v.visitor_role}</span>
                {v.notes ? <span className="basis-full text-[12.5px] text-ink-soft">{v.notes}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <TimelinePanel events={timeline} names={names} lang={lang} />

      {audit.length > 0 ? (
        <Card>
          <CardHead
            title={pick(lang, 'Audit trail for this case', 'इस प्रकरण का अंकेक्षण')}
            hint={pick(
              lang,
              'Append-only and hash-chained. Refused attempts are recorded too.',
              'केवल जोड़ने योग्य, हैश-श्रृंखलाबद्ध। अस्वीकृत प्रयास भी दर्ज।',
            )}
            right={<Link href={`/audit?entityType=case&entityId=${c.id}`} className="link text-[13px]">{pick(lang, 'Open in the audit trail', 'अंकेक्षण में खोलें')}</Link>}
          />
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{pick(lang, 'When', 'कब')}</th>
                  <th scope="col">{pick(lang, 'Who', 'कौन')}</th>
                  <th scope="col">{pick(lang, 'Action', 'कार्य')}</th>
                  <th scope="col">{pick(lang, 'Result', 'परिणाम')}</th>
                  <th scope="col">{pick(lang, 'Hash', 'हैश')}</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="tnum whitespace-nowrap text-[12.5px]">{fmtDate(a.ts, true)}</td>
                    <td className="text-[12.5px]">
                      {a.actor_user_id ? (names.users.get(a.actor_user_id) ?? a.actor_label) : a.actor_label}
                      <span className="block text-[11px] text-ink-faint">{a.actor_role}</span>
                    </td>
                    <td className="text-[12.5px]">
                      <Mono>{a.action}</Mono>
                      {a.reason ? <span className="block text-[11.5px] text-ink-soft">{a.reason}</span> : null}
                    </td>
                    <td>
                      {a.result === 'success'
                        ? <Pill tone="good">{pick(lang, 'done', 'हुआ')}</Pill>
                        : <Pill tone="critical">{pick(lang, 'refused', 'अस्वीकृत')}</Pill>}
                    </td>
                    <td><Mono>{shortHash(a.hash)}</Mono></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </article>
  );
}
