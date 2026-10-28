'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireSession } from './session';
import { Refused } from './guard';
import * as w from './write';
import type { CaseStatus } from '@domain/types';

/**
 * Server actions. Thin wrappers: they read the session, hand the arguments to the guarded
 * write layer in write.ts, and turn a refusal into a message on the page the user is on.
 *
 * No authority decisions are made here. A form that posts a case id it should not have is
 * refused by write.ts, because that is where scope, role and the lifecycle are checked.
 */

type State = { error?: string; ok?: string };

/** Run a write and come back with either a confirmation or the reason it was refused. */
async function attempt(fn: () => void | Promise<void>, ok: string): Promise<State> {
  try {
    await fn();
    return { ok };
  } catch (e) {
    if (e instanceof Refused) return { error: e.message };
    // An unexpected failure is a bug, not a refusal; say so plainly rather than silently.
    return { error: `The change could not be saved: ${(e as Error).message}` };
  }
}

const str = (f: FormData, k: string): string => String(f.get(k) ?? '').trim();

// ------------------------------------------------------------------ case lifecycle
export async function transitionAction(_prev: State, form: FormData): Promise<State> {
  const s = await requireSession();
  const caseId = str(form, 'case_id');
  const to = str(form, 'to') as CaseStatus;
  const reason = str(form, 'reason');
  const res = await attempt(
    () => { w.transitionCase(s, caseId, to, reason || null); },
    `Case moved to "${to.replace(/_/g, ' ')}".`,
  );
  revalidatePath(`/cases/${caseId}`);
  revalidatePath('/cases');
  // A refusal keeps the form on screen to show why. A success often removes the very panel
  // the button lived in — a decided case no longer offers a decision — so the confirmation
  // travels in the URL instead of dying with the component that would have displayed it.
  if (res.ok) redirect(`/cases/${caseId}?done=${encodeURIComponent(res.ok)}`);
  return res;
}

export async function decidePlanAction(_prev: State, form: FormData): Promise<State> {
  const s = await requireSession();
  const caseId = str(form, 'case_id');
  const planId = str(form, 'plan_id');
  const decision = str(form, 'decision') as 'approved' | 'rejected' | 'revision_requested' | 'approved_for_pab';
  const reason = str(form, 'reason');
  const res = await attempt(
    () => { w.decidePlan(s, { caseId, planId, decision, reason: reason || null }); },
    decision === 'approved' ? 'Plan approved. The work can now be assigned.'
      : decision === 'approved_for_pab' ? 'Referred to the PAB.'
      : decision === 'revision_requested' ? 'Sent back for changes.'
      : 'Plan rejected; the case returns to investigation.',
  );
  revalidatePath(`/cases/${caseId}`);
  revalidatePath('/approvals');
  if (res.ok) redirect(`/cases/${caseId}?done=${encodeURIComponent(res.ok)}`);
  return res;
}

export async function setConclusionAction(_prev: State, form: FormData): Promise<State> {
  const s = await requireSession();
  const caseId = str(form, 'case_id');
  const res = await attempt(
    () => { w.setHumanConclusion(s, caseId, str(form, 'text')); },
    'Your conclusion has been recorded alongside the AI hypothesis.',
  );
  revalidatePath(`/cases/${caseId}`);
  return res;
}

// ------------------------------------------------------------------ evidence
export async function verifyEvidenceAction(_prev: State, form: FormData): Promise<State> {
  const s = await requireSession();
  const evidenceId = str(form, 'evidence_id');
  const accept = str(form, 'accept') === 'yes';
  const method = (str(form, 'method') || 'desk_review') as 'desk_review' | 'spot_check_visit' | 'cross_source_assessment';
  const res = await attempt(
    () => { w.verifyEvidence(s, { evidenceId, accept, reason: str(form, 'reason') || null, method }); },
    accept ? 'Proof accepted.' : 'Proof sent back to the person who submitted it.',
  );
  revalidatePath('/evidence');
  const caseId = str(form, 'case_id');
  if (caseId) revalidatePath(`/cases/${caseId}`);
  return res;
}

export async function submitEvidenceAction(_prev: State, form: FormData): Promise<State> {
  const s = await requireSession();
  const taskId = str(form, 'task_id');
  const res = await attempt(
    () => {
      w.submitEvidence(s, {
        taskId,
        note: str(form, 'note'),
        schoolId: str(form, 'school_id') || null,
        gps: (str(form, 'gps') || 'not_captured') as 'matched' | 'not_captured' | 'outside_radius',
      });
    },
    'Proof submitted. Someone other than you has to check it.',
  );
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath('/tasks');
  return res;
}

// ------------------------------------------------------------------ tasks
export async function acknowledgeTaskAction(_prev: State, form: FormData): Promise<State> {
  const s = await requireSession();
  const taskId = str(form, 'task_id');
  const res = await attempt(() => { w.acknowledgeTask(s, taskId); }, 'Marked as seen.');
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath('/tasks');
  return res;
}

export async function startTaskAction(_prev: State, form: FormData): Promise<State> {
  const s = await requireSession();
  const taskId = str(form, 'task_id');
  const res = await attempt(() => { w.startTask(s, taskId); }, 'Marked as started.');
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath('/tasks');
  return res;
}

// ------------------------------------------------------------------ outcomes
export async function recomputeOutcomeAction(_prev: State, form: FormData): Promise<State> {
  const s = await requireSession();
  const caseId = str(form, 'case_id');
  const evaluationId = str(form, 'evaluation_id');
  const followupRoundId = str(form, 'followup_round_id');
  let detail = '';
  const res = await attempt(
    () => {
      const r = w.recomputeOutcome(s, caseId, {
        evaluationId: evaluationId || undefined,
        followupRoundId: followupRoundId || undefined,
      });
      detail = r.agreesWithStored
        ? `Re-derived from the raw assessment rows: ${r.did === null ? 'no estimate' : `${r.did > 0 ? '+' : ''}${r.did} pp`}, ${r.category.replace(/_/g, ' ')}. This matches what was on record.`
        : `Re-derived from the raw assessment rows: ${r.did === null ? 'no estimate' : `${r.did > 0 ? '+' : ''}${r.did} pp`}, ${r.category.replace(/_/g, ' ')}. This DIFFERS from what was on record — the evaluation has been updated.`;
    },
    '',
  );
  revalidatePath(`/cases/${caseId}`);
  return res.error ? res : { ok: detail };
}

export async function reviewOutcomeAction(_prev: State, form: FormData): Promise<State> {
  const s = await requireSession();
  const caseId = str(form, 'case_id');
  const res = await attempt(
    () => { w.reviewOutcome(s, str(form, 'outcome_id')); },
    'Signed off as read.',
  );
  revalidatePath(`/cases/${caseId}`);
  return res;
}

// ------------------------------------------------------------------ notifications
export async function markReadAction(form: FormData): Promise<void> {
  const s = await requireSession();
  const id = String(form.get('notification_id') ?? '');
  if (id === 'all') w.markAllRead(s);
  else if (id) w.markNotificationRead(s, id);
  revalidatePath('/notifications');
  const to = String(form.get('then') ?? '');
  if (to) redirect(to);
}

// ------------------------------------------------------------------ people
export async function setUserStatusAction(_prev: State, form: FormData): Promise<State> {
  const s = await requireSession();
  const status = str(form, 'status') === 'active' ? 'active' : 'inactive';
  let detail = '';
  const res = await attempt(
    () => {
      const r = w.setUserStatus(s, { userId: str(form, 'user_id'), status, reason: str(form, 'reason') });
      detail = r.status === 'active'
        ? 'The account works again. They can sign in from the demo list.'
        : 'The account is switched off. They can no longer sign in, and they have gone from the demo sign-in list.';
    },
    '',
  );
  revalidatePath('/users');
  revalidatePath('/login');
  return res.error ? res : { ok: detail };
}

// ------------------------------------------------------------------ settings
/**
 * Nothing is validated here on purpose. A blank or malformed box arrives as NaN and write.ts
 * refuses it by name, so the message beside the button says which field was wrong rather than
 * this layer deciding what counts as a valid threshold.
 */
export async function saveSettingsAction(_prev: State, form: FormData): Promise<State> {
  const s = await requireSession();
  const n = (k: string): number => Number(str(form, k));
  let detail = '';
  const res = await attempt(
    () => {
      const r = w.saveSettingVersion(s, {
        detection: {
          materiality_pp: n('materiality_pp'),
          z_threshold: n('z_threshold'),
          min_cluster_assessed: n('min_cluster_assessed'),
          min_school_reporting_share: n('min_school_reporting_share'),
          min_participation: n('det_min_participation'),
          driver_cumulative_share: n('driver_cumulative_share'),
          max_driver_schools: n('max_driver_schools'),
          severity_critical_pp: n('severity_critical_pp'),
          severity_high_pp: n('severity_high_pp'),
        },
        outcome: {
          success_threshold_pp: n('success_threshold_pp'),
          participation_floor_ratio: n('participation_floor_ratio'),
          min_participation: n('out_min_participation'),
          comparison_schools_per_treated: n('comparison_schools_per_treated'),
        },
        reminders: {
          reminder_days_before_due: n('reminder_days_before_due'),
          escalation_days_overdue: n('escalation_days_overdue'),
        },
        diagnosis: {
          visit_gap_days: n('visit_gap_days'),
          attendance_drop_pp: n('attendance_drop_pp'),
          teacher_transfer_window_days: n('teacher_transfer_window_days'),
          ptr_threshold: n('ptr_threshold'),
        },
        closureRules: str(form, 'closure_rules').split(/\r?\n/),
        changeNote: str(form, 'change_note'),
      });
      detail = `Saved as ${r.id}, in force from today. The previous version stays on the record, and `
        + 'every finding already judged keeps the version it was judged under.';
    },
    '',
  );
  revalidatePath('/settings');
  revalidatePath('/', 'layout');
  return res.error ? res : { ok: detail };
}

// ------------------------------------------------------------------ demo controls
export async function reminderSweepAction(_prev: State, form: FormData): Promise<State> {
  const s = await requireSession();
  let detail = '';
  const res = await attempt(
    () => {
      const r = w.reminderSweep(s, str(form, 'as_of') || undefined);
      detail = `Sweep finished: ${r.remindersSent} reminder${r.remindersSent === 1 ? '' : 's'} sent, `
        + `${r.escalationsCreated} escalation${r.escalationsCreated === 1 ? '' : 's'} raised. `
        + 'Running it again today will send nothing further.';
    },
    '',
  );
  revalidatePath('/admin');
  revalidatePath('/admin/jobs');
  return res.error ? res : { ok: detail };
}

export async function setClockAction(_prev: State, form: FormData): Promise<State> {
  const s = await requireSession();
  const date = str(form, 'date');
  const res = await attempt(
    () => { w.setDemoClock(s, `${date}T06:30:00.000Z`); },
    `The demo clock is now ${date}. Overdue counts and reminder windows move with it.`,
  );
  revalidatePath('/', 'layout');
  return res;
}

export async function demoResetAction(_prev: State, _form: FormData): Promise<State> {
  const s = await requireSession();
  const res = await attempt(
    () => { w.demoReset(s); },
    'The demo has been restored to the canonical seed, and the reset itself is in the audit log.',
  );
  revalidatePath('/', 'layout');
  return res;
}
