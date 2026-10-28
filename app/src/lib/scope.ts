import 'server-only';
import type { Param } from './db';
import type { Session } from './session';
import type { RoleCode } from '@domain/types';

/**
 * Row-level security, ported.
 *
 * Postgres enforces visibility with the policies in sql/schema.sql. SQLite has no RLS, so
 * every scoped read in this app composes a predicate from here into its WHERE clause. These
 * are line-for-line ports of in_scope(), can_see_school() and can_see_case(), including the
 * headmaster carve-outs, so the two backends show a given user exactly the same rows.
 *
 * Rule for anyone adding a query: if the table appears in the "scoped data" block of
 * schema.sql, it must be filtered through one of these. Never interpolate a scope id into SQL
 * by hand — always pass the params this module returns.
 */

export interface Pred { sql: string; params: Param[] }

export const TRUE: Pred = { sql: '1=1', params: [] };
export const FALSE: Pred = { sql: '1=0', params: [] };

export function and(...ps: (Pred | null)[]): Pred {
  const live = ps.filter((p): p is Pred => p !== null && p.sql !== '1=1');
  if (live.length === 0) return TRUE;
  if (live.length === 1) return live[0];
  return { sql: `(${live.map((p) => `(${p.sql})`).join(' and ')})`, params: live.flatMap((p) => p.params) };
}

/**
 * Disjunction, wrapped.
 *
 * The outer parentheses are not cosmetic. A predicate containing a bare `or` interpolated into
 * `where ${pred} and status = 'closed'` parses as `A or (B and status = ...)`, because `or`
 * binds looser than `and` — the caller's filter silently applies to only one branch. Returning
 * a parenthesised expression makes that impossible however the caller splices it in.
 */
export function or(...ps: (Pred | null)[]): Pred {
  const live = ps.filter((p): p is Pred => p !== null);
  if (live.length === 0) return FALSE;
  if (live.some((p) => p.sql === '1=1')) return TRUE;
  if (live.length === 1) return live[0];
  return { sql: `(${live.map((p) => `(${p.sql})`).join(' or ')})`, params: live.flatMap((p) => p.params) };
}

export const hasRole = (s: Session, ...roles: RoleCode[]): boolean =>
  s.roles.some((r) => roles.includes(r.role));

export const isHeadmaster = (s: Session): boolean =>
  s.roles.every((r) => r.role === 'headmaster');

/** Columns holding the geography of a row. Mirrors the in_scope() signature. */
export interface GeoCols {
  state?: string;
  district?: string;
  block?: string;
  cluster?: string;
  /** Column holding a JSON array of school ids (cases.school_ids). */
  schoolIds?: string;
  /** Column holding a single school id. */
  school?: string;
  /** JSON array of objects each with a school_id key (findings.driver_schools). */
  driverSchools?: string;
}

/**
 * in_scope(...) for a row whose geography sits in the given columns.
 * A state-scoped user matches on state_id, a district-scoped one on district_id, and so on;
 * a school-scoped user matches when their school appears in the row's school list.
 */
export function inScope(s: Session, c: GeoCols): Pred {
  const parts: Pred[] = [];
  for (const r of s.roles) {
    switch (r.scope_type) {
      case 'state':
        if (c.state) parts.push({ sql: `${c.state} = ?`, params: [r.scope_id] });
        break;
      case 'district':
        if (c.district) parts.push({ sql: `${c.district} = ?`, params: [r.scope_id] });
        break;
      case 'block':
        if (c.block) parts.push({ sql: `${c.block} = ?`, params: [r.scope_id] });
        break;
      case 'cluster':
        if (c.cluster) parts.push({ sql: `${c.cluster} = ?`, params: [r.scope_id] });
        break;
      case 'school': {
        if (c.school) parts.push({ sql: `${c.school} = ?`, params: [r.scope_id] });
        if (c.schoolIds) {
          parts.push({
            sql: `exists (select 1 from json_each(${c.schoolIds}) je where je.value = ?)`,
            params: [r.scope_id],
          });
        }
        if (c.driverSchools) {
          parts.push({
            sql: `exists (select 1 from json_each(${c.driverSchools}) je where json_extract(je.value, '$.school_id') = ?)`,
            params: [r.scope_id],
          });
        }
        break;
      }
    }
  }
  return or(...parts);
}

/** can_see_school(col): resolve the school's geography, then apply in_scope. */
export function canSeeSchool(s: Session, schoolCol: string, alias = 'sc_scope'): Pred {
  const geo = inScope(s, {
    state: `${alias}.state_id`,
    district: `${alias}.district_id`,
    block: `${alias}.block_id`,
    cluster: `${alias}.cluster_id`,
    school: `${alias}.id`,
  });
  return {
    sql: `exists (select 1 from schools ${alias} where ${alias}.id = ${schoolCol} and (${geo.sql}))`,
    params: geo.params,
  };
}

/**
 * can_see_case(col): the case is in scope, OR the user owns a task on it. The second arm is
 * what lets a headmaster or CRC open a case they were given work on but whose cluster-level
 * record they would not otherwise see.
 */
export function canSeeCase(s: Session, caseIdCol: string, alias = 'c_scope'): Pred {
  const geo = inScope(s, {
    state: `${alias}.state_id`,
    district: `${alias}.district_id`,
    block: `${alias}.block_id`,
    cluster: `${alias}.cluster_id`,
    schoolIds: `${alias}.school_ids`,
  });
  return or(
    {
      sql: `exists (select 1 from cases ${alias} where ${alias}.id = ${caseIdCol} and (${geo.sql}))`,
      params: geo.params,
    },
    {
      sql: `exists (select 1 from tasks t_scope where t_scope.case_id = ${caseIdCol} and t_scope.owner_user_id = ?)`,
      params: [s.user_id],
    },
  );
}

/** The predicate for `cases` queried under its own alias (no sub-select needed). */
export function casesPred(s: Session, alias = 'cases'): Pred {
  return or(
    inScope(s, {
      state: `${alias}.state_id`,
      district: `${alias}.district_id`,
      block: `${alias}.block_id`,
      cluster: `${alias}.cluster_id`,
      schoolIds: `${alias}.school_ids`,
    }),
    {
      sql: `exists (select 1 from tasks t_scope where t_scope.case_id = ${alias}.id and t_scope.owner_user_id = ?)`,
      params: [s.user_id],
    },
  );
}

/** `findings`: in_scope over the finding's geography plus its driver schools. */
export function findingsPred(s: Session, alias = 'findings'): Pred {
  return inScope(s, {
    state: `(select d_scope.state_id from districts d_scope where d_scope.id = ${alias}.district_id)`,
    district: `${alias}.district_id`,
    block: `${alias}.block_id`,
    cluster: `${alias}.cluster_id`,
    driverSchools: `${alias}.driver_schools`,
  });
}

/** `schools` queried under its own alias. */
export function schoolsPred(s: Session, alias = 'schools'): Pred {
  return inScope(s, {
    state: `${alias}.state_id`,
    district: `${alias}.district_id`,
    block: `${alias}.block_id`,
    cluster: `${alias}.cluster_id`,
    school: `${alias}.id`,
  });
}

/** `tasks`: mine, or in a case I can see — but headmasters only ever see their own. */
export function tasksPred(s: Session, alias = 'tasks'): Pred {
  const own: Pred = { sql: `${alias}.owner_user_id = ?`, params: [s.user_id] };
  if (isHeadmaster(s)) return own;
  return or(own, canSeeCase(s, `${alias}.case_id`));
}

/** `evidence`: submitted by me, or attached to a case I can see. */
export function evidencePred(s: Session, alias = 'evidence'): Pred {
  return or(
    { sql: `${alias}.submitted_by = ?`, params: [s.user_id] },
    canSeeCase(s, `${alias}.case_id`),
  );
}

/** `staff_events`: school in scope, and never visible to a headmaster. */
export function staffEventsPred(s: Session, alias = 'staff_events'): Pred {
  if (isHeadmaster(s)) return FALSE;
  return canSeeSchool(s, `${alias}.school_id`);
}

/** `audit_events`: auditors and admins see everything; a BEO/DEO sees their own cases. */
export function auditPred(s: Session, alias = 'audit_events'): Pred {
  if (hasRole(s, 'auditor', 'state_admin', 'demo_admin')) return TRUE;
  if (hasRole(s, 'beo', 'deo')) {
    return and(
      { sql: `${alias}.entity_type = 'case'`, params: [] },
      canSeeCase(s, `${alias}.entity_id`),
    );
  }
  return FALSE;
}

/** `ai_interactions`: my own, plus everything for auditors and admins. */
export function aiPred(s: Session, alias = 'ai_interactions'): Pred {
  if (hasRole(s, 'auditor', 'state_admin', 'demo_admin')) return TRUE;
  return { sql: `${alias}.user_id = ?`, params: [s.user_id] };
}

/** `reports`: mine, anything in my scope, plus everything for state/auditor/admin. */
export function reportsPred(s: Session, alias = 'reports'): Pred {
  if (hasRole(s, 'state_admin', 'auditor', 'demo_admin')) return TRUE;
  return or(
    { sql: `${alias}.generated_by = ?`, params: [s.user_id] },
    ...s.roles.map((r) => ({ sql: `${alias}.scope_id = ?`, params: [r.scope_id] as Param[] })),
  );
}

/**
 * `user_roles`: an assignment whose scope sits at or below mine.
 *
 * Both holders of users.manage are state-scoped today, so in practice this short-circuits to TRUE
 * for every caller /users actually has. It is written against the assignment's own geography
 * anyway: if the grant is ever widened to a district officer, they must see their own district's
 * people rather than everybody's, and that has to be true the day the matrix changes, not the day
 * somebody notices.
 */
export function userRolesPred(s: Session, alias = 'ur'): Pred {
  if (hasRole(s, 'state_admin', 'demo_admin')) return TRUE;

  const typed = (t: string, inner: Pred): Pred =>
    and({ sql: `${alias}.scope_type = ?`, params: [t] }, inner);
  const within = (table: string, a: string, geo: Pred): Pred => ({
    sql: `exists (select 1 from ${table} ${a} where ${a}.id = ${alias}.scope_id and (${geo.sql}))`,
    params: geo.params,
  });

  // blocks and clusters carry no state_id, so each arm passes only the columns that exist;
  // inScope skips a role whose scope column is absent from the row it is given.
  return or(
    typed('state', inScope(s, { state: `${alias}.scope_id` })),
    typed('district', within('districts', 'd_ur', inScope(s, { state: 'd_ur.state_id', district: 'd_ur.id' }))),
    typed('block', within('blocks', 'b_ur', inScope(s, { district: 'b_ur.district_id', block: 'b_ur.id' }))),
    typed('cluster', within('clusters', 'c_ur', inScope(s, { district: 'c_ur.district_id', block: 'c_ur.block_id', cluster: 'c_ur.id' }))),
    typed('school', canSeeSchool(s, `${alias}.scope_id`, 'sc_ur')),
  );
}

export function importPred(s: Session): Pred {
  return hasRole(s, 'beo', 'deo', 'state_admin', 'auditor', 'demo_admin') ? TRUE : FALSE;
}
