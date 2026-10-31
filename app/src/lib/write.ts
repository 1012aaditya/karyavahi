import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { all, one, run, tx, nextId, nextSeq, j, restorePristine } from './db';
import { Refused, actingRole, require_, requireDecideLever } from './guard';
import { casesPred, hasRole } from './scope';
import type { Session } from './session';
import { nowIso, today, addDays } from './clock';
import { canTransition, reasonRequired, closureEligibility } from '@domain/lifecycle';
import { evaluateOutcome, OUTCOME_NOTE } from '@domain/outcome';
import { settingsAt } from '@domain/catalog';
import type { CaseStatus, OutcomeSchoolRow } from '@domain/types';

/**
 * Every write in the app. This is the TypeScript twin of the SECURITY DEFINER functions in
 * sql/schema.sql — transition_case(), verify_evidence(), reminder_sweep(), demo_reset() — and
 * it re-checks the same things in the same order:
 *
 *   signed in → record exists → in scope → rule is legal → reason given → role is empowered
 *   → the specific guards (closure needs proof, nobody verifies their own evidence)
 *
 * Refusals are recorded. An illegal transition writes a failure row to the audit chain before
 * throwing, exactly as the Postgres function does, so an attempt to do something forbidden is
 * itself part of the record.
 *
 * Nothing here trusts an argument. Ids are looked up, never interpolated.
 */

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// ------------------------------------------------------------------ audit chain
/**
 * Append to the tamper-evident chain, using the same scheme as the seed ('ts-json-v1'):
 * sha256 over the JSON of the row's fields in a fixed key order, including the previous hash.
 * Because the scheme matches, the auditor page can recompute every hash in the table — seeded
 * and live alike — rather than only checking that the links line up.
 */
export function appendAudit(o: {
  actorUserId: string | null;
  actorLabel?: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  correlationId?: string;
  source?: 'web' | 'mobile' | 'whatsapp_sim' | 'ivr_sim' | 'system' | 'import';
  result?: 'success' | 'failure';
}): string {
  const prev = one<{ hash: string }>(
    'select hash from audit_events order by ts desc, id desc limit 1',
  )?.hash ?? '0'.repeat(64);

  const id = nextId('audit', 'AUD-', 7);
  const row = {
    id,
    ts: nowIso(),
    actor_user_id: o.actorUserId,
    actor_label: o.actorLabel ?? o.actorUserId ?? 'system',
    actor_role: o.actorRole,
    action: o.action,
    entity_type: o.entityType,
    entity_id: o.entityId,
    before: (o.before as Record<string, unknown>) ?? null,
    after: (o.after as Record<string, unknown>) ?? null,
    reason: o.reason ?? null,
    correlation_id: o.correlationId ?? `COR-${sha(`${o.entityId}:${o.action}:${nowIso()}`).slice(0, 12)}`,
    source: o.source ?? (o.actorRole === 'system' ? 'system' : 'web'),
    result: o.result ?? 'success',
  };
  const hash = sha(JSON.stringify({ ...row, prev_hash: prev }));

  run(
    `insert into audit_events
      (id, ts, actor_user_id, actor_label, actor_role, action, entity_type, entity_id,
       before, after, reason, correlation_id, source, result, prev_hash, hash, hash_version)
     values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    row.id, row.ts, row.actor_user_id, row.actor_label, row.actor_role, row.action,
    row.entity_type, row.entity_id,
    row.before === null ? null : JSON.stringify(row.before),
    row.after === null ? null : JSON.stringify(row.after),
    row.reason, row.correlation_id, row.source, row.result, prev, hash, 'ts-json-v1',
  );
  return id;
}

function addCaseEvent(o: {
  caseId: string; actorUserId: string | null; actorLabel: string; kind: string; summary: string;
  fromStatus?: CaseStatus | null; toStatus?: CaseStatus | null; related?: string | null;
}): void {
  const n = nextSeq('case_event');
  run(
    `insert into case_events (id, case_id, ts, actor_user_id, actor_label, kind, summary, from_status, to_status, related_entity)
     values (?,?,?,?,?,?,?,?,?,?)`,
    `CEV-${String(n).padStart(6, '0')}`, o.caseId, nowIso(), o.actorUserId, o.actorLabel,
    o.kind, o.summary, o.fromStatus ?? null, o.toStatus ?? null, o.related ?? null,
  );
}

export function notify(o: {
  userId: string; kind: string; title: string; body: string;
  entityType: string; entityId: string; link: string;
}): void {
  const n = nextSeq('notification');
  run(
    `insert into notifications (id, user_id, ts, kind, title, body, entity_type, entity_id, link, read_at)
     values (?,?,?,?,?,?,?,?,?,null)`,
    `NTF-${String(n).padStart(6, '0')}`, o.userId, nowIso(), o.kind, o.title, o.body,
    o.entityType, o.entityId, o.link,
  );
}

function recordJob(type: string, status: string, summary: unknown, error: string | null = null): void {
  const n = nextSeq('job');
  run(
    `insert into system_jobs (id, job_type, started_at, finished_at, status, summary, error)
     values (?,?,?,?,?,?,?)`,
    `JOB-${String(n).padStart(5, '0')}`, type, nowIso(), nowIso(), status, JSON.stringify(summary), error,
  );
}

// ------------------------------------------------------------------ helpers
interface CaseCore {
  id: string; status: CaseStatus; lever: 'block' | 'district' | 'pab'; current_plan_id: string | null;
  state_id: string; district_id: string; block_id: string; cluster_id: string; school_ids: string;
  title: string; owner_user_id: string; reopen_count: number;
}

function loadCaseForWrite(s: Session, caseId: string): CaseCore {
  // Scope first, then the row — a refusal must not reveal anything about a case out of scope
  // beyond the fact that it exists, which is what the Postgres function also leaks.
  const p = casesPred(s, 'c');
  const row = one<CaseCore>(
    `select c.* from cases c where c.id = ? and (${p.sql})`, caseId, ...p.params,
  );
  if (row) return row;
  const exists = (one<{ c: number }>('select count(*) c from cases where id = ?', caseId)?.c ?? 0) > 0;
  throw new Refused(
    exists ? `Case ${caseId} is outside your scope.` : `Case ${caseId} does not exist.`,
    exists ? 'scope' : 'not_found',
  );
}

// ------------------------------------------------------------------ transition_case
export interface TransitionResult { caseId: string; from: CaseStatus; to: CaseStatus }

export function transitionCase(
  s: Session, caseId: string, to: CaseStatus, reason?: string | null,
): TransitionResult {
  // Validation happens before any transaction is opened. A refused attempt is itself part of
  // the record, so its audit row must not be rolled back along with the change it refused.
  const c = loadCaseForWrite(s, caseId);
  const from = c.status;
  const role = actingRole(s);
  const corr = randomUUID();

  // 1. is the move legal at all?
  if (!canTransition(from, to)) {
    appendAudit({
      actorUserId: s.user_id, actorRole: role, action: 'case.status_change_refused',
      entityType: 'case', entityId: caseId,
      before: { status: from }, after: { status: to },
      reason: 'illegal transition', correlationId: corr, result: 'failure',
    });
    throw new Refused(`A case cannot go from "${from}" to "${to}".`, 'illegal_transition');
  }

  // 2. does it need a written reason?
  if (reasonRequired(from, to) && !reason?.trim()) {
    throw new Refused(`Moving a case from "${from}" to "${to}" needs a written reason.`, 'reason_required');
  }

  // 3. is this role empowered to make this particular move?
  if (to === 'approved' || to === 'referred_pab' || to === 'revision_requested'
      || (from === 'awaiting_approval' && to === 'under_investigation')) {
    requireDecideLever(s, c.lever);
    require_(s, to === 'approved' && c.lever === 'block' ? 'plan.approve_block'
      : to === 'approved' ? 'plan.approve_district_or_pab' : 'plan.reject_or_revise');
  }
  if (to === 'dismissed') require_(s, 'case.edit_diagnosis', 'to dismiss a finding');
  if (to === 'reopened') {
    if (!hasRole(s, 'beo', 'deo', 'state_admin')) {
      throw new Refused(`A ${role} cannot reopen a case.`, 'role');
    }
    require_(s, 'case.reopen');
  }

  // 4. the proof gates — delivery verified, independently checked, and a measured gain
  if (to === 'outcome_pending') {
    const unverified = one<{ c: number }>(
      'select count(*) c from tasks where plan_id = ? and verified_at is null', c.current_plan_id,
    )?.c ?? 0;
    if (unverified > 0) {
      appendAudit({
        actorUserId: s.user_id, actorRole: role, action: 'case.status_change_refused',
        entityType: 'case', entityId: caseId, before: { status: from }, after: { status: to },
        reason: `${unverified} task(s) without verified proof`, correlationId: corr, result: 'failure',
      });
      throw new Refused(
        `${unverified} task${unverified === 1 ? '' : 's'} on this plan still have no verified proof.`,
        'unverified_tasks',
      );
    }
    const crossSource = one<{ c: number }>(
      'select count(*) c from tasks where plan_id = ? and cross_source = 1 and verified_at is not null',
      c.current_plan_id,
    )?.c ?? 0;
    if (crossSource === 0) {
      throw new Refused(
        'An independent (cross-source) verification is required before the outcome check.',
        'no_cross_source',
      );
    }
  }

  if (to === 'closed') {
    if (!hasRole(s, 'beo', 'deo')) throw new Refused('Only a BEO or DEO can close a case.', 'role');
    require_(s, 'case.close');
    const eligible = one<{ c: number }>(
      'select count(*) c from outcome_evaluations where case_id = ? and plan_id = ? and closure_eligible = 1',
      caseId, c.current_plan_id,
    )?.c ?? 0;
    if (eligible === 0) {
      const latest = one<{ category: string; closure_blockers: string }>(
        'select category, closure_blockers from outcome_evaluations where case_id = ? order by evaluated_at desc limit 1',
        caseId,
      );
      const blockers = latest ? j<string[]>(latest.closure_blockers, []) : [];
      appendAudit({
        actorUserId: s.user_id, actorRole: role, action: 'case.close_refused',
        entityType: 'case', entityId: caseId,
        reason: blockers.join('; ') || 'no eligible outcome evaluation',
        correlationId: corr, result: 'failure',
      });
      throw new Refused(
        blockers.length > 0
          ? `Closure is blocked: ${blockers.join('; ')}.`
          : 'Closure is blocked: there is no eligible outcome evaluation for the current plan.',
        'closure_blocked',
      );
    }
  }

  // 5. do it
  return tx(() => {
    const closedAt = to === 'closed' ? nowIso() : null;
    run(
      `update cases set status = ?, updated_at = ?,
         closed_at = case when ? = 'closed' then ? else closed_at end,
         reopen_count = reopen_count + case when ? = 'reopened' then 1 else 0 end
       where id = ?`,
      to, nowIso(), to, closedAt, to, caseId,
    );
    addCaseEvent({
      caseId, actorUserId: s.user_id, actorLabel: s.user_id, kind: 'status_changed',
      summary: reason?.trim() || `${from} → ${to}`, fromStatus: from, toStatus: to,
    });
    appendAudit({
      actorUserId: s.user_id, actorRole: role, action: 'case.status_changed',
      entityType: 'case', entityId: caseId,
      before: { status: from }, after: { status: to }, reason: reason ?? null, correlationId: corr,
    });

    // 6. tell the people who need to know
    if (to === 'approved' || to === 'revision_requested' || to === 'closed' || to === 'reopened') {
      const kind = to === 'approved' ? 'assignment'
        : to === 'revision_requested' ? 'evidence_rejected'
        : to === 'closed' ? 'case_closed' : 'case_reopened';
      const title = {
        approved: 'Plan approved', revision_requested: 'Plan sent back for changes',
        closed: 'Case closed on a verified outcome', reopened: 'Case reopened',
      }[to as 'approved' | 'revision_requested' | 'closed' | 'reopened'];
      if (c.owner_user_id !== s.user_id) {
        notify({
          userId: c.owner_user_id, kind, title, body: c.title,
          entityType: 'case', entityId: caseId, link: `/cases/${caseId}`,
        });
      }
    }

    return { caseId, from, to };
  });
}

// ------------------------------------------------------------------ plan decisions
/**
 * Record an approval decision and move the case. One call so the approval row and the case
 * status can never disagree; if the transition is refused, the decision is rolled back too.
 */
export function decidePlan(
  s: Session,
  o: { caseId: string; planId: string; decision: 'approved' | 'approved_with_edits' | 'rejected' | 'revision_requested' | 'approved_for_pab'; reason?: string | null },
): TransitionResult {
  return tx(() => {
    const c = loadCaseForWrite(s, o.caseId);
    requireDecideLever(s, c.lever);
    if (c.status !== 'awaiting_approval') {
      throw new Refused(`This case is "${c.status}", not waiting for a decision.`, 'wrong_status');
    }
    const plan = one<{ id: string; case_id: string }>('select id, case_id from case_plans where id = ?', o.planId);
    if (!plan || plan.case_id !== o.caseId) throw new Refused('That plan does not belong to this case.', 'mismatch');

    if ((o.decision === 'rejected' || o.decision === 'revision_requested') && !o.reason?.trim()) {
      throw new Refused('Sending a plan back needs a written reason.', 'reason_required');
    }

    const to: CaseStatus =
      o.decision === 'rejected' ? 'under_investigation'
      : o.decision === 'revision_requested' ? 'revision_requested'
      : o.decision === 'approved_for_pab' ? 'referred_pab'
      : 'approved';

    const pending = one<{ id: string }>(
      `select id from approvals where case_id = ? and plan_id = ? and decision = 'pending' limit 1`,
      o.caseId, o.planId,
    );
    if (pending) {
      run(
        `update approvals set decision = ?, decided_by = ?, decided_at = ?, reason = ? where id = ?`,
        o.decision, s.user_id, nowIso(), o.reason ?? null, pending.id,
      );
    }
    const planStatus =
      o.decision === 'rejected' ? 'rejected'
      : o.decision === 'revision_requested' ? 'revision_requested'
      : o.decision === 'approved_for_pab' ? 'referred_pab'
      : 'approved';
    run('update case_plans set status = ? where id = ?', planStatus, o.planId);

    appendAudit({
      actorUserId: s.user_id, actorRole: actingRole(s), action: `plan.${o.decision}`,
      entityType: 'case_plan', entityId: o.planId,
      before: { status: 'submitted' }, after: { status: planStatus },
      reason: o.reason ?? null,
    });
    addCaseEvent({
      caseId: o.caseId, actorUserId: s.user_id, actorLabel: s.user_id, kind: 'plan_decision',
      summary: o.reason?.trim() || `Plan ${o.decision.replace(/_/g, ' ')}`, related: o.planId,
    });

    return transitionCase(s, o.caseId, to, o.reason);
  });
}

// ------------------------------------------------------------------ verify_evidence
export function verifyEvidence(
  s: Session,
  o: { evidenceId: string; accept: boolean; reason?: string | null; method?: 'desk_review' | 'spot_check_visit' | 'cross_source_assessment' },
): { evidenceId: string; status: 'verified' | 'rejected' } {
  const e = one<{
    id: string; case_id: string; task_id: string; submitted_by: string; status: string; evidence_type: string;
  }>('select id, case_id, task_id, submitted_by, status, evidence_type from evidence where id = ?', o.evidenceId);
  if (!e) throw new Refused(`Evidence ${o.evidenceId} does not exist.`, 'not_found');

  loadCaseForWrite(s, e.case_id); // scope check

  if (!hasRole(s, 'beo', 'brc', 'crc', 'deo')) {
    throw new Refused(`A ${actingRole(s)} cannot verify evidence.`, 'role');
  }
  require_(s, 'evidence.verify');

  // Separation of duties: the rule that makes the proof mean anything.
  if (e.submitted_by === s.user_id) {
    appendAudit({
      actorUserId: s.user_id, actorRole: actingRole(s), action: 'evidence.verify_refused',
      entityType: 'evidence', entityId: o.evidenceId,
      reason: 'submitter cannot verify their own evidence', result: 'failure',
    });
    throw new Refused('You cannot verify evidence you submitted yourself.', 'separation_of_duties');
  }
  if (e.status !== 'pending') {
    throw new Refused(`This proof has already been ${e.status}.`, 'already_decided');
  }
  if (!o.accept && !o.reason?.trim()) {
    throw new Refused('Sending proof back needs a reason.', 'reason_required');
  }

  const method = o.method ?? 'desk_review';
  return tx(() => {
    run(
      `update evidence set status = ?, verified_by = ?, verified_at = ?, verification_method = ?, rejection_reason = ?
       where id = ?`,
      o.accept ? 'verified' : 'rejected', s.user_id, nowIso(), method,
      o.accept ? null : (o.reason ?? null), o.evidenceId,
    );

    // The task follows its proof: enough verified pieces and the task is verified; a rejection
    // sends the task back to the owner.
    const task = one<{ id: string; proof_count: number; owner_user_id: string; title_en: string; status: string }>(
      'select id, proof_count, owner_user_id, title_en, status from tasks where id = ?', e.task_id,
    );
    if (task) {
      if (o.accept) {
        const verified = one<{ c: number }>(
          `select count(*) c from evidence where task_id = ? and status = 'verified'`, task.id,
        )?.c ?? 0;
        if (verified >= task.proof_count) {
          run(`update tasks set status = 'verified', verified_at = ? where id = ?`, nowIso(), task.id);
        }
      } else {
        run(`update tasks set status = 'sent_back', submitted_at = null where id = ?`, task.id);
        notify({
          userId: task.owner_user_id, kind: 'evidence_rejected',
          title: 'Proof sent back', body: `${task.title_en} — ${o.reason ?? ''}`.trim(),
          entityType: 'task', entityId: task.id, link: `/tasks/${task.id}`,
        });
      }
    }

    appendAudit({
      actorUserId: s.user_id, actorRole: actingRole(s),
      action: o.accept ? 'evidence.verified' : 'evidence.rejected',
      entityType: 'evidence', entityId: o.evidenceId,
      after: { method }, reason: o.reason ?? null,
    });
    addCaseEvent({
      caseId: e.case_id, actorUserId: s.user_id, actorLabel: s.user_id,
      kind: o.accept ? 'evidence_verified' : 'evidence_rejected',
      summary: o.accept ? `Proof accepted (${method.replace(/_/g, ' ')})` : `Proof sent back: ${o.reason}`,
      related: o.evidenceId,
    });

    return { evidenceId: o.evidenceId, status: o.accept ? 'verified' as const : 'rejected' as const };
  });
}

// ------------------------------------------------------------------ task owner actions
export function acknowledgeTask(s: Session, taskId: string): void {
  tx(() => {
    const t = one<{ id: string; owner_user_id: string; status: string; case_id: string }>(
      'select id, owner_user_id, status, case_id from tasks where id = ?', taskId,
    );
    if (!t) throw new Refused('No such task.', 'not_found');
    if (t.owner_user_id !== s.user_id) throw new Refused('This task is not assigned to you.', 'not_owner');
    if (t.status !== 'assigned') throw new Refused(`This task is already "${t.status}".`, 'wrong_status');
    run(`update tasks set status = 'acknowledged', acknowledged_at = ? where id = ?`, nowIso(), taskId);
    appendAudit({
      actorUserId: s.user_id, actorRole: actingRole(s), action: 'task.acknowledged',
      entityType: 'task', entityId: taskId, after: { status: 'acknowledged' },
    });
  });
}

export function startTask(s: Session, taskId: string): void {
  tx(() => {
    const t = one<{ id: string; owner_user_id: string; status: string }>(
      'select id, owner_user_id, status from tasks where id = ?', taskId,
    );
    if (!t) throw new Refused('No such task.', 'not_found');
    if (t.owner_user_id !== s.user_id) throw new Refused('This task is not assigned to you.', 'not_owner');
    if (!['assigned', 'acknowledged', 'sent_back'].includes(t.status)) {
      throw new Refused(`This task is "${t.status}" and cannot be started again.`, 'wrong_status');
    }
    run(`update tasks set status = 'in_progress', started_at = coalesce(started_at, ?) where id = ?`, nowIso(), taskId);
    appendAudit({
      actorUserId: s.user_id, actorRole: actingRole(s), action: 'task.started',
      entityType: 'task', entityId: taskId, after: { status: 'in_progress' },
    });
  });
}

/**
 * Submit a piece of proof against a task. The demo does not take file uploads; it records the
 * same row an upload would produce, with a hash over the declared summary so the record is
 * still self-consistent, and marks where the GPS check landed.
 */
export function submitEvidence(
  s: Session,
  o: { taskId: string; note: string; schoolId?: string | null; gps?: 'matched' | 'not_captured' | 'outside_radius' },
): { evidenceId: string } {
  return tx(() => {
    const t = one<{
      id: string; case_id: string; owner_user_id: string; owner_role: string; status: string;
      proof_type: string; proof_count: number; school_id: string | null; title_en: string;
    }>('select * from tasks where id = ?', o.taskId);
    if (!t) throw new Refused('No such task.', 'not_found');
    if (t.owner_user_id !== s.user_id) throw new Refused('This task is not assigned to you.', 'not_owner');
    require_(s, 'evidence.submit_own');
    if (['verified', 'cancelled'].includes(t.status)) {
      throw new Refused(`This task is "${t.status}"; no more proof is needed.`, 'wrong_status');
    }
    if (!o.note.trim()) throw new Refused('Describe what the proof shows.', 'empty');

    const n = nextId('evidence', 'EVD-', 6);
    const summary = { note: o.note.trim(), declared_by: s.user_id, recorded_on: today() };
    const digest = sha(JSON.stringify({ task: o.taskId, ...summary }));

    run(
      `insert into evidence
        (id, task_id, case_id, school_id, evidence_type, file_name, sha256, visit_id, summary,
         submitted_by, submitted_role, submitted_at, gps_status, channel, status,
         verified_by, verified_at, verification_method, rejection_reason, provenance)
       values (?,?,?,?,?,?,?,null,?,?,?,?,?,'app','pending',null,null,null,null,'user_uploaded')`,
      n, o.taskId, t.case_id, o.schoolId ?? t.school_id, t.proof_type,
      `${o.taskId}-${n}.pdf`, digest, JSON.stringify(summary),
      s.user_id, actingRole(s), nowIso(), o.gps ?? 'not_captured',
    );

    const count = one<{ c: number }>('select count(*) c from evidence where task_id = ?', o.taskId)?.c ?? 1;
    if (count >= t.proof_count) {
      run(`update tasks set status = 'submitted', submitted_at = ? where id = ?`, nowIso(), o.taskId);
    } else {
      run(`update tasks set status = 'in_progress', started_at = coalesce(started_at, ?) where id = ?`, nowIso(), o.taskId);
    }

    appendAudit({
      actorUserId: s.user_id, actorRole: actingRole(s), action: 'evidence.submitted',
      entityType: 'evidence', entityId: n,
      after: { task_id: o.taskId, sha256: digest, pieces: count, of: t.proof_count },
    });
    addCaseEvent({
      caseId: t.case_id, actorUserId: s.user_id, actorLabel: s.user_id, kind: 'evidence_submitted',
      summary: `Proof submitted for "${t.title_en}" (${count} of ${t.proof_count})`, related: n,
    });

    // Whoever can verify in this block should see it. Notify the case's accountable officer.
    const owner = one<{ owner_user_id: string }>('select owner_user_id from cases where id = ?', t.case_id);
    if (owner && owner.owner_user_id !== s.user_id) {
      notify({
        userId: owner.owner_user_id, kind: 'evidence_submitted',
        title: 'Proof to check', body: t.title_en,
        entityType: 'evidence', entityId: n, link: `/cases/${t.case_id}#proof`,
      });
    }

    return { evidenceId: n };
  });
}

// ------------------------------------------------------------------ outcome recompute
/**
 * Re-run the pre-registered outcome check from the raw assessment rows.
 *
 * Nothing is taken from the stored evaluation: the treated and comparison schools come from
 * the plan's pre-registration (locked at approval), and the two rounds' numbers are read back
 * out of assessment_results. This is the same code path as src/domain/outcome.ts, so the app
 * cannot produce a number the seed validator would disagree with.
 */
export interface RecomputeResult {
  evaluationId: string;
  category: string;
  did: number | null;
  closureEligible: boolean;
  blockers: string[];
  baselineRoundId: string;
  followupRoundId: string;
  /** True when this re-derivation reproduced the number that was already on record. */
  agreesWithStored: boolean;
}

/**
 * Re-derive a pre-registered outcome check from the raw assessment rows.
 *
 * Nothing is taken from the stored statistics — the two round numbers are read back out of
 * assessment_results and run through src/domain/outcome.ts, the same function the seed
 * validator uses. What *is* taken from the record is the terms of the test, because changing
 * those after the fact is how an evaluation gets talked into saying something it shouldn't:
 *
 *   re-running an existing evaluation reuses that evaluation's own plan, rounds, treated and
 *   comparison schools, success threshold and participation floor. An auditor asking "is this
 *   number right?" gets an answer about that number and not a differently-specified one.
 *
 *   a first evaluation for a plan takes its terms from the plan's pre-registration, locked at
 *   approval, and its rounds from the pre-registration unless a later follow-up round is named
 *   (which is how the November round gets evaluated once it has been uploaded).
 *
 * Why the terms can differ from the pre-registration at all: a follow-up round can arrive too
 * thin to judge, in which case the check is re-run against the next round, and the
 * participation floor in force at evaluation time is the one applied. Several evaluations in
 * the seed went that way. Re-deriving against the pre-registration instead would silently
 * disagree with the published figure.
 */
export function recomputeOutcome(
  s: Session,
  caseId: string,
  opts: { evaluationId?: string; followupRoundId?: string } = {},
): RecomputeResult {
  return tx(() => {
    const c = loadCaseForWrite(s, caseId);
    require_(s, 'outcome.recompute');

    interface StoredEval {
      id: string; plan_id: string; baseline_round_id: string; followup_round_id: string;
      treated: string; comparison: string; success_threshold_pp: number;
      participation_check: string; did_pp: number | null; category: string; cycle: number;
    }
    const stored = opts.evaluationId
      ? one<StoredEval>('select * from outcome_evaluations where id = ? and case_id = ?', opts.evaluationId, caseId)
      : one<StoredEval>(
          `select * from outcome_evaluations where case_id = ? and plan_id = ?
            order by evaluated_at desc limit 1`,
          caseId, c.current_plan_id,
        );
    if (opts.evaluationId && !stored) throw new Refused('No such outcome evaluation on this case.', 'not_found');

    const planId = stored?.plan_id ?? c.current_plan_id;
    if (!planId) throw new Refused('This case has no plan to evaluate.', 'no_plan');

    const plan = one<{ id: string; cycle: number; pre_registration: string; school_ids: string }>(
      'select id, cycle, pre_registration, school_ids from case_plans where id = ?', planId,
    );
    if (!plan) throw new Refused('The plan is missing.', 'no_plan');
    const pre = j<{
      grade: number; competency_id: string; metric_id: string;
      baseline_round_id: string; followup_round_id: string; comparison_school_ids: string[];
      success_threshold_pp: number; participation_floor_ratio: number; settings_version_id: string;
    } | null>(plan.pre_registration, null);
    if (!pre) throw new Refused('This plan has no pre-registered outcome check.', 'no_prereg');

    // The terms of the test.
    const storedTreated = stored ? j<{ school_id: string }[]>(stored.treated, []) : [];
    const storedComparison = stored ? j<{ school_id: string }[]>(stored.comparison, []) : [];
    const storedPart = stored
      ? j<{ floor: number }>(stored.participation_check, { floor: pre.participation_floor_ratio })
      : null;

    const treatedIds = storedTreated.length > 0
      ? storedTreated.map((r) => r.school_id)
      : j<string[]>(plan.school_ids, []);
    const comparisonIds = storedComparison.length > 0
      ? storedComparison.map((r) => r.school_id)
      : pre.comparison_school_ids;
    const baselineRoundId = stored?.baseline_round_id ?? pre.baseline_round_id;
    const followupRoundId = opts.followupRoundId ?? stored?.followup_round_id ?? pre.followup_round_id;
    const threshold = stored?.success_threshold_pp ?? pre.success_threshold_pp;
    const floor = storedPart?.floor ?? pre.participation_floor_ratio;

    if (!one<{ id: string }>('select id from assessment_rounds where id = ?', followupRoundId)) {
      throw new Refused(`Round ${followupRoundId} does not exist.`, 'bad_input');
    }

    /** Read both rounds for a set of schools straight out of assessment_results. */
    const readRows = (ids: string[]): OutcomeSchoolRow[] => {
      if (ids.length === 0) return [];
      const q = ids.map(() => '?').join(',');
      const rows = all<{
        school_id: string; round_id: string; pct_proficient: number; n_assessed: number; participation_rate: number;
      }>(
        `select school_id, round_id, pct_proficient, n_assessed, participation_rate
           from assessment_results
          where school_id in (${q}) and grade = ? and competency_id = ? and round_id in (?, ?)`,
        ...ids, pre.grade, pre.competency_id, baselineRoundId, followupRoundId,
      );
      return ids.map((id) => {
        const b = rows.find((r) => r.school_id === id && r.round_id === baselineRoundId);
        const f = rows.find((r) => r.school_id === id && r.round_id === followupRoundId);
        return {
          school_id: id,
          baseline_pct: b ? b.pct_proficient : null,
          followup_pct: f ? f.pct_proficient : null,
          baseline_n: b ? b.n_assessed : 0,
          followup_n: f ? f.n_assessed : 0,
          baseline_participation: b ? b.participation_rate : null,
          followup_participation: f ? f.participation_rate : null,
        };
      });
    };

    const treatedRows = readRows(treatedIds);
    const comparisonRows = readRows(comparisonIds);
    const settings = settingsAt(today());
    const result = evaluateOutcome(treatedRows, comparisonRows, {
      success_threshold_pp: threshold,
      participation_floor_ratio: floor,
      min_participation: settings.outcome.min_participation,
    });

    // Delivery and the independent check are facts about the ledger, not about the statistics.
    const unverified = one<{ c: number }>(
      'select count(*) c from tasks where plan_id = ? and verified_at is null', plan.id,
    )?.c ?? 0;
    const crossSource = (one<{ c: number }>(
      'select count(*) c from tasks where plan_id = ? and cross_source = 1 and verified_at is not null', plan.id,
    )?.c ?? 0) > 0;
    const deliveryVerified = unverified === 0;

    const { eligible, blockers } = closureEligibility({
      allTasksVerified: deliveryVerified,
      crossSourceVerified: crossSource,
      outcomeCategory: result.category,
      participationPassed: result.participation_check.passed,
    });

    const payload = [
      JSON.stringify(treatedRows), JSON.stringify(comparisonRows),
      result.treated_baseline_mean, result.treated_followup_mean,
      result.comparison_baseline_mean, result.comparison_followup_mean,
      result.treated_change_pp, result.comparison_change_pp,
      result.did_pp, result.ci_low_pp, result.ci_high_pp, result.ci_method,
      threshold, JSON.stringify(result.participation_check),
      result.category, deliveryVerified ? 1 : 0, crossSource ? 1 : 0, eligible ? 1 : 0,
      JSON.stringify(blockers), result.reasons.join(' ') || OUTCOME_NOTE, 1,
      pre.settings_version_id, nowIso(),
    ];

    // Re-running the same rounds updates that evaluation in place; evaluating a newly arrived
    // round is a new evaluation, so the earlier one stays on the record.
    const inPlace = stored && followupRoundId === stored.followup_round_id;
    let evaluationId: string;
    if (inPlace) {
      evaluationId = stored!.id;
      run(
        `update outcome_evaluations set
           treated = ?, comparison = ?, treated_baseline_mean = ?, treated_followup_mean = ?,
           comparison_baseline_mean = ?, comparison_followup_mean = ?, treated_change_pp = ?,
           comparison_change_pp = ?, did_pp = ?, ci_low_pp = ?, ci_high_pp = ?, ci_method = ?,
           success_threshold_pp = ?, participation_check = ?, category = ?, delivery_verified = ?,
           cross_source_verified = ?, closure_eligible = ?, closure_blockers = ?,
           interpretation_note = ?, is_illustrative = ?, settings_version_id = ?, evaluated_at = ?
         where id = ?`,
        ...payload, evaluationId,
      );
    } else {
      evaluationId = `OUT-${nextSeq('outcome').toString().padStart(5, '0')}L`;
      run(
        `insert into outcome_evaluations
          (id, case_id, plan_id, cycle, grade, competency_id, baseline_round_id, followup_round_id,
           treated, comparison, treated_baseline_mean, treated_followup_mean,
           comparison_baseline_mean, comparison_followup_mean, treated_change_pp, comparison_change_pp,
           did_pp, ci_low_pp, ci_high_pp, ci_method, success_threshold_pp, participation_check,
           category, delivery_verified, cross_source_verified, closure_eligible, closure_blockers,
           interpretation_note, is_illustrative, settings_version_id, evaluated_at, reviewed_by, reviewed_at)
         values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,null,null)`,
        evaluationId, caseId, plan.id, plan.cycle, pre.grade, pre.competency_id,
        baselineRoundId, followupRoundId, ...payload,
      );
    }

    const agreesWithStored = !stored
      || (result.did_pp === stored.did_pp && result.category === stored.category);

    appendAudit({
      actorUserId: s.user_id, actorRole: actingRole(s), action: 'outcome.recomputed',
      entityType: 'outcome_evaluation', entityId: evaluationId,
      before: stored ? { did_pp: stored.did_pp, category: stored.category } : null,
      after: {
        did_pp: result.did_pp, category: result.category, closure_eligible: eligible,
        baseline_round_id: baselineRoundId, followup_round_id: followupRoundId,
        agrees_with_stored: agreesWithStored,
      },
    });
    addCaseEvent({
      caseId, actorUserId: s.user_id, actorLabel: s.user_id, kind: 'outcome_recomputed',
      summary: `Outcome check re-derived from raw rows: ${result.category.replace(/_/g, ' ')}` +
        (result.did_pp === null ? '' : ` (${result.did_pp > 0 ? '+' : ''}${result.did_pp} pp)`),
      related: plan.id,
    });
    recordJob('outcome_run', 'succeeded', {
      case_id: caseId, evaluation_id: evaluationId, category: result.category,
      did_pp: result.did_pp, baseline_round_id: baselineRoundId, followup_round_id: followupRoundId,
      agrees_with_stored: agreesWithStored,
    });

    return {
      evaluationId, category: result.category, did: result.did_pp,
      closureEligible: eligible, blockers, baselineRoundId, followupRoundId, agreesWithStored,
    };
  });
}

/** An officer signing off that they have read an outcome evaluation. */
export function reviewOutcome(s: Session, outcomeId: string): void {
  tx(() => {
    const o = one<{ id: string; case_id: string }>('select id, case_id from outcome_evaluations where id = ?', outcomeId);
    if (!o) throw new Refused('No such outcome evaluation.', 'not_found');
    loadCaseForWrite(s, o.case_id);
    require_(s, 'outcome.recompute');
    run('update outcome_evaluations set reviewed_by = ?, reviewed_at = ? where id = ?', s.user_id, nowIso(), outcomeId);
    appendAudit({
      actorUserId: s.user_id, actorRole: actingRole(s), action: 'outcome.reviewed',
      entityType: 'outcome_evaluation', entityId: outcomeId,
    });
  });
}

// ------------------------------------------------------------------ diagnosis conclusion
/** The officer's own note on a diagnosis, kept separate from the AI hypothesis. */
export function setHumanConclusion(s: Session, caseId: string, text: string): void {
  tx(() => {
    loadCaseForWrite(s, caseId);
    require_(s, 'case.edit_diagnosis');
    if (!text.trim()) throw new Refused('Write a conclusion first.', 'empty');
    const d = one<{ id: string; human_conclusion: string | null }>(
      'select id, human_conclusion from diagnoses where case_id = ?', caseId,
    );
    if (!d) throw new Refused('This case has no diagnosis.', 'not_found');
    run(
      'update diagnoses set human_conclusion = ?, human_conclusion_by = ? where id = ?',
      text.trim(), s.user_id, d.id,
    );
    appendAudit({
      actorUserId: s.user_id, actorRole: actingRole(s), action: 'diagnosis.conclusion_set',
      entityType: 'diagnosis', entityId: d.id,
      before: { human_conclusion: d.human_conclusion }, after: { human_conclusion: text.trim() },
    });
    addCaseEvent({
      caseId, actorUserId: s.user_id, actorLabel: s.user_id, kind: 'diagnosis_updated',
      summary: 'Officer recorded their own conclusion', related: d.id,
    });
  });
}

// ------------------------------------------------------------------ reminder_sweep
/** One T-2 reminder and one +7 escalation per task, never twice. Idempotent by design. */
export function reminderSweep(s: Session | null, dateOverride?: string): { remindersSent: number; escalationsCreated: number } {
  return tx(() => {
    const day = dateOverride ?? today();
    const dueSoon = addDays(day, 2);

    const toRemind = all<{ id: string; owner_user_id: string; title_en: string }>(
      `select id, owner_user_id, title_en from tasks
        where reminder_sent_at is null and submitted_at is null and due_date = ?`, dueSoon,
    );
    for (const t of toRemind) {
      run('update tasks set reminder_sent_at = ? where id = ?', nowIso(), t.id);
      notify({
        userId: t.owner_user_id, kind: 'deadline_upcoming', title: 'Due in 2 days', body: t.title_en,
        entityType: 'task', entityId: t.id, link: `/tasks/${t.id}`,
      });
      appendAudit({ actorUserId: null, actorRole: 'system', actorLabel: 'system:reminder_sweep', action: 'task.reminder_sent', entityType: 'task', entityId: t.id, source: 'system' });
    }

    const toEscalate = all<{ id: string; case_id: string; title_en: string }>(
      `select id, case_id, title_en from tasks
        where escalated_at is null and submitted_at is null and date(due_date, '+7 day') <= ?`, day,
    );
    for (const t of toEscalate) {
      run('update tasks set escalated_at = ? where id = ?', nowIso(), t.id);
      const deos = all<{ user_id: string }>(
        `select ur.user_id from cases c
           join user_roles ur on ur.role = 'deo' and ur.scope_type = 'district' and ur.scope_id = c.district_id
          where c.id = ?`, t.case_id,
      );
      for (const d of deos) {
        notify({
          userId: d.user_id, kind: 'escalation', title: 'Escalation: task 7 days overdue',
          body: t.title_en, entityType: 'task', entityId: t.id, link: `/tasks/${t.id}`,
        });
      }
      appendAudit({ actorUserId: null, actorRole: 'system', actorLabel: 'system:reminder_sweep', action: 'task.escalated', entityType: 'task', entityId: t.id, source: 'system' });
    }

    run(`update tasks set is_overdue = case when due_date < ? and submitted_at is null then 1 else 0 end`, day);

    const summary = { reminders_sent: toRemind.length, escalations_created: toEscalate.length, as_of: day };
    recordJob('reminder_sweep', 'succeeded', summary);
    return { remindersSent: toRemind.length, escalationsCreated: toEscalate.length };
  });
}

// ------------------------------------------------------------------ notifications
export function markNotificationRead(s: Session, id: string): void {
  run('update notifications set read_at = ? where id = ? and user_id = ? and read_at is null', nowIso(), id, s.user_id);
}

export function markAllRead(s: Session): void {
  run('update notifications set read_at = ? where user_id = ? and read_at is null', nowIso(), s.user_id);
}

// ------------------------------------------------------------------ demo controls
export function demoReset(s: Session): void {
  if (!hasRole(s, 'demo_admin')) throw new Refused('Demo admin only.', 'role');
  require_(s, 'demo.reset');
  restorePristine();
  // The chain restarts from the pristine copy, so this row is the first live one after it.
  appendAudit({
    actorUserId: s.user_id, actorRole: 'demo_admin', action: 'demo.reset',
    entityType: 'system', entityId: 'seed', reason: 'Demo reset to the canonical seed',
  });
}

export function setDemoClock(s: Session, iso: string): void {
  if (!hasRole(s, 'demo_admin', 'state_admin')) throw new Refused('Demo admin only.', 'role');
  const before = nowIso();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Refused(`"${iso}" is not a date.`, 'bad_input');
  run(
    `insert into app_state (key, value, updated_at) values ('demo_clock', ?, ?)
     on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`,
    d.toISOString(), new Date().toISOString(),
  );
  appendAudit({
    actorUserId: s.user_id, actorRole: actingRole(s), action: 'demo.clock_set',
    entityType: 'system', entityId: 'demo_clock',
    before: { demo_clock: before }, after: { demo_clock: d.toISOString() },
  });
}
