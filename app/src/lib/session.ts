import 'server-only';
import { cookies } from 'next/headers';
import { all, one } from './db';
import type { Language, RoleCode, ScopeType } from '@domain/types';

/**
 * Demo sign-in. Identity comes from a signed-in cookie holding a user id; there are no
 * passwords because every account and every record is fictional (see the demo banner).
 * In Supabase this is replaced by auth.uid() → users.auth_user_id; nothing else changes,
 * because authority is decided by the role rows below, never by the cookie.
 */

export const SESSION_COOKIE = 'kv_session';
export const LANG_COOKIE = 'kv_lang';

export interface RoleAssignment {
  role: RoleCode;
  scope_type: ScopeType;
  scope_id: string;
}

export interface Session {
  user_id: string;
  full_name: string;
  email: string;
  preferred_language: Language;
  roles: RoleAssignment[];
  /** The strongest role, using the same precedence as transition_case() in sql/schema.sql. */
  role: RoleCode;
  scope_type: ScopeType;
  scope_id: string;
}

/** Same order as the `array_position(...)` call in transition_case(). */
export const ROLE_PRECEDENCE: RoleCode[] = [
  'state_admin', 'deo', 'beo', 'brc', 'crc', 'headmaster', 'auditor', 'demo_admin',
];

export function strongestRole(roles: RoleAssignment[]): RoleAssignment | null {
  if (roles.length === 0) return null;
  return [...roles].sort(
    (a, b) => ROLE_PRECEDENCE.indexOf(a.role) - ROLE_PRECEDENCE.indexOf(b.role),
  )[0];
}

export function loadSession(userId: string): Session | null {
  const u = one<{
    id: string; full_name: string; email: string; preferred_language: Language; status: string;
  }>('select id, full_name, email, preferred_language, status from users where id = ?', userId);
  if (!u || u.status !== 'active') return null;

  const roles = all<RoleAssignment>(
    'select role, scope_type, scope_id from user_roles where user_id = ?', userId,
  );
  const strongest = strongestRole(roles);
  if (!strongest) return null;

  return {
    user_id: u.id,
    full_name: u.full_name,
    email: u.email,
    preferred_language: u.preferred_language,
    roles,
    role: strongest.role,
    scope_type: strongest.scope_type,
    scope_id: strongest.scope_id,
  };
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return loadSession(id);
}

/** For pages that must have a signed-in user. Layouts redirect before this ever throws. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error('not signed in');
  return s;
}

export async function getLanguage(): Promise<Language> {
  const jar = await cookies();
  const fromCookie = jar.get(LANG_COOKIE)?.value;
  if (fromCookie === 'hi' || fromCookie === 'en') return fromCookie;
  const s = await getSession();
  return s?.preferred_language ?? 'en';
}
