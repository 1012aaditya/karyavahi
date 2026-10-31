import 'server-only';
import { one } from './db';
import type { Session } from './session';
import { grant, Refused } from './guard';
import { scopeContains, contains, ROLE_RANK, ROLE_LEVEL, type ScopeType } from './org';
import type { Action } from '@domain/permissions';
import type { RoleCode } from '@domain/types';
import { complaintAccess } from './complaints';

/**
 * The central permission service.
 *
 *   authorize(session, permission, resource?) → { allowed, reason }
 *
 * It evaluates, in order: account status → role grant → geographic scope → resource ownership
 * → organisational relationship → confidentiality. Granular permissions map onto the domain
 * matrix in src/domain/permissions.ts where one exists (so the seed validator and the app keep
 * one source of truth); new capabilities — complaints, accounts, geography — are defined here.
 *
 * Every protected operation in the new modules calls this. The older write layer keeps its own
 * guard calls, which use the same matrix, so the rules cannot drift apart.
 */

export const PERMISSIONS = [
  'view_dashboard', 'view_aggregated_metrics', 'view_cases', 'create_case', 'investigate_case',
  'recommend_intervention', 'approve_intervention', 'assign_task', 'submit_evidence', 'verify_evidence',
  'verify_outcome', 'close_case', 'reopen_case',
  'create_complaint', 'view_complaint', 'assign_complaint', 'resolve_complaint', 'escalate_complaint', 'oversee_complaints',
  'view_reports', 'generate_reports', 'export_reports',
  'manage_users', 'approve_accounts', 'manage_hierarchy', 'manage_geography', 'view_audit', 'view_map',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: RoleCode[] = ['state_admin', 'deo', 'beo', 'brc', 'crc', 'headmaster', 'auditor', 'demo_admin'];
const HANDLERS: RoleCode[] = ['state_admin', 'deo', 'beo', 'brc', 'crc'];

/** Either a domain-matrix action, or an explicit list of roles. */
const MAP: Record<Permission, Action | Action[] | RoleCode[]> = {
  view_dashboard: ALL,
  view_aggregated_metrics: ['state_admin', 'deo', 'beo', 'brc', 'crc', 'auditor', 'demo_admin'],
  view_map: ALL,
  view_cases: 'case.view',
  create_case: 'case.create',
  investigate_case: 'case.edit_diagnosis',
  recommend_intervention: 'case.edit_diagnosis',
  approve_intervention: ['plan.approve_block', 'plan.approve_district_or_pab'],
  assign_task: 'task.assign',
  submit_evidence: 'evidence.submit_own',
  verify_evidence: 'evidence.verify',
  verify_outcome: 'outcome.recompute',
  close_case: 'case.close',
  reopen_case: 'case.reopen',
  create_complaint: ['state_admin', 'deo', 'beo', 'brc', 'crc', 'headmaster'],
  view_complaint: ALL,
  assign_complaint: HANDLERS,
  resolve_complaint: HANDLERS,
  escalate_complaint: HANDLERS,
  oversee_complaints: ['state_admin', 'deo', 'beo', 'auditor'],
  view_reports: 'report.export',
  generate_reports: 'report.export',
  export_reports: 'report.export',
  manage_users: ['state_admin', 'deo', 'beo', 'demo_admin'],
  approve_accounts: ['state_admin', 'deo', 'beo', 'demo_admin'],
  manage_hierarchy: ['state_admin', 'deo', 'beo', 'demo_admin'],
  manage_geography: ['state_admin', 'demo_admin'],
  view_audit: 'audit.view',
};

export interface Decision { allowed: boolean; reason: string }
const yes: Decision = { allowed: true, reason: '' };
const no = (reason: string): Decision => ({ allowed: false, reason });

export type Resource =
  | { kind: 'scope'; type: ScopeType; id: string }
  | { kind: 'user'; userId: string }
  | { kind: 'role_grant'; role: RoleCode; type: ScopeType; id: string }
  | { kind: 'complaint'; id: string };

function roleGrant(s: Session, p: Permission): boolean {
  const m = MAP[p];
  if (typeof m === 'string') return grant(s, m as Action) !== 'no';
  if (m.length && (m[0] as string).includes('.')) return (m as Action[]).some((a) => grant(s, a) !== 'no');
  return s.roles.some((r) => (m as RoleCode[]).includes(r.role));
}

/** Highest rank among roles whose scope contains the unit (used for "may manage/approve"). */
function rankOver(s: Session, type: ScopeType, id: string): number {
  return Math.max(-1, ...s.roles.filter((r) => contains(r.scope_type as ScopeType, r.scope_id, type, id)).map((r) => ROLE_RANK[r.role]));
}

export function authorize(s: Session | null, p: Permission, res?: Resource): Decision {
  if (!s) return no('Sign in first.');
  const status = one<{ status: string }>('select status from users where id = ?', s.user_id)?.status;
  if (status !== 'active') return no(`Your account is ${status ?? 'not active'}.`);
  if (!roleGrant(s, p)) return no(`Your role (${s.roles.map((r) => r.role).join(', ')}) does not have “${p.replace(/_/g, ' ')}”.`);
  if (!res) return yes;

  switch (res.kind) {
    case 'scope':
      return scopeContains(s, res.type, res.id) ? yes : no('That area is outside your assigned scope.');

    case 'user': {
      const target = one<{ role: RoleCode; scope_type: ScopeType; scope_id: string }>(
        'select role, scope_type, scope_id from user_roles where user_id = ? limit 1', res.userId,
      );
      if (!target) return no('Unknown user.');
      if (res.userId === s.user_id) return no('You cannot change your own account or authority.');
      if (s.roles.some((r) => r.role === 'demo_admin')) return yes;
      const rank = rankOver(s, target.scope_type, target.scope_id);
      if (rank < 0) return no('That user is outside your scope.');
      if (rank <= ROLE_RANK[target.role]) return no('You can only manage accounts junior to your own role.');
      return yes;
    }

    case 'role_grant': {
      // Approving or assigning a role: the scope must be inside mine and the role junior to mine.
      if (ROLE_LEVEL[res.role] !== res.type) return no(`A ${res.role} is assigned at ${ROLE_LEVEL[res.role]} level, not ${res.type}.`);
      if (res.role === 'demo_admin') return no('The demo administrator role cannot be requested or granted.');
      if (s.roles.some((r) => r.role === 'demo_admin')) return ROLE_RANK[res.role] <= 5 ? yes : no('Not grantable.');
      const rank = rankOver(s, res.type, res.id);
      if (rank < 0) return no('That assignment is outside your scope.');
      if (res.role === 'auditor' && !s.roles.some((r) => r.role === 'state_admin')) return no('Only the state team can grant an auditor role.');
      if (rank <= ROLE_RANK[res.role]) return no('You can only approve roles junior to your own.');
      return yes;
    }

    case 'complaint': {
      const a = complaintAccess(s, res.id);
      if (!a) return no('Complaint not found or not visible to you.');
      if (p === 'view_complaint') return yes;
      if (['assign_complaint', 'resolve_complaint', 'escalate_complaint'].includes(p)) {
        return a.relation === 'assignee' ? yes : no('Only the authority the complaint is currently assigned to can act on it.');
      }
      return yes;
    }
  }
}

/** Throwing form for write paths. */
export function requirePermission(s: Session | null, p: Permission, res?: Resource): void {
  const d = authorize(s, p, res);
  if (!d.allowed) throw new Refused(d.reason, 'authz');
}

export const can = (s: Session | null, p: Permission, res?: Resource): boolean => authorize(s, p, res).allowed;
