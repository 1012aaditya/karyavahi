import 'server-only';
import { grantFor, type Action, type Grant } from '@domain/permissions';
import { ROLE_PRECEDENCE, type Session } from './session';
import type { RoleCode } from '@domain/types';

/**
 * Permission checks. The matrix in src/domain/permissions.ts is the single source of truth and
 * is shared with the seed validator, so a role that cannot do something in the data cannot do
 * it in the UI either.
 *
 * A grant is coarse. Scope and ownership are always checked separately against the record —
 * holding 'evidence.verify' does not let a BEO verify evidence in another block, and it never
 * lets anyone verify evidence they submitted themselves.
 */

export class Refused extends Error {
  readonly code: string;
  constructor(message: string, code = 'refused') {
    super(message);
    this.name = 'Refused';
    this.code = code;
  }
}

/** The strongest grant any of the user's roles has for this action. */
export function grant(s: Session, action: Action): Grant {
  const ranked: Grant[] = ['yes', 'spot', 'propose', 'raise', 'own', 'no'];
  let best: Grant = 'no';
  for (const r of s.roles) {
    const g = grantFor(r.role, action);
    if (ranked.indexOf(g) < ranked.indexOf(best)) best = g;
  }
  return best;
}

export const may = (s: Session, action: Action): boolean => grant(s, action) !== 'no';

/** Throws unless the user has some grant for the action. */
export function require_(s: Session, action: Action, what = ''): void {
  if (!may(s, action)) {
    throw new Refused(
      `Your role (${s.roles.map((r) => r.role).join(', ')}) cannot ${action.replace('.', ' ')}${what ? ` ${what}` : ''}.`,
      'role',
    );
  }
}

/** The role this user would act with, same precedence as transition_case(). */
export function actingRole(s: Session): RoleCode {
  return [...s.roles].sort(
    (a, b) => ROLE_PRECEDENCE.indexOf(a.role) - ROLE_PRECEDENCE.indexOf(b.role),
  )[0].role;
}

/**
 * Who may decide a plan, by lever. Mirrors the check inside transition_case():
 *   block lever    → BEO or DEO
 *   district / PAB → DEO or state programme team
 */
export function canDecideLever(s: Session, lever: 'block' | 'district' | 'pab'): boolean {
  const roles = s.roles.map((r) => r.role);
  if (lever === 'block') return roles.includes('beo') || roles.includes('deo');
  return roles.includes('deo') || roles.includes('state_admin');
}

export function requireDecideLever(s: Session, lever: 'block' | 'district' | 'pab'): void {
  if (!canDecideLever(s, lever)) {
    throw new Refused(
      `A ${lever === 'block' ? 'block' : lever === 'district' ? 'district' : 'PAB'}-lever plan is decided by ` +
        `${lever === 'block' ? 'the BEO or DEO' : 'the DEO or the state programme team'}, not by ${actingRole(s)}.`,
      'lever',
    );
  }
}
