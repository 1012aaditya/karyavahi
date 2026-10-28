import type { Session } from './session';
import { may } from './guard';
import { ROLE_LABELS } from '@domain/permissions';

/**
 * Navigation, derived from the permission matrix rather than hand-listed per role, so a role
 * never sees a link to something it would be refused. `home` matches ROLE_LABELS in
 * src/domain/permissions.ts, which already assigns each role its landing route.
 */

export interface NavItem {
  href: string;
  key: string;
  /** Shown when the badge count is worth surfacing in the nav. */
  badge?: 'approvals' | 'evidence' | 'tasks' | 'notifications';
}

export interface NavGroup { label: { en: string; hi: string }; items: NavItem[] }

export const homeFor = (s: Session): string => ROLE_LABELS[s.role]?.home ?? '/cases';

export function navFor(s: Session): NavGroup[] {
  const groups: NavGroup[] = [];
  const work: NavItem[] = [{ href: homeFor(s), key: 'navHome' }];

  const fieldRole = s.roles.some((r) => ['crc', 'brc', 'headmaster'].includes(r.role));
  if (fieldRole || may(s, 'task.update_own')) work.push({ href: '/tasks', key: 'navTasks', badge: 'tasks' });
  if (may(s, 'plan.approve_block') || may(s, 'plan.approve_district_or_pab')) {
    work.push({ href: '/approvals', key: 'navApprovals', badge: 'approvals' });
  }
  if (may(s, 'evidence.verify')) work.push({ href: '/evidence', key: 'navEvidence', badge: 'evidence' });
  work.push({ href: '/cases', key: 'navCases' });
  if (may(s, 'case.view') && !s.roles.every((r) => r.role === 'headmaster')) {
    work.push({ href: '/findings', key: 'navFindings' });
  }
  groups.push({ label: { en: 'Work', hi: 'काम' }, items: work });

  const ref: NavItem[] = [];
  ref.push({ href: '/schools', key: 'navSchools' });
  if (fieldRole) ref.push({ href: '/visits', key: 'navVisits' });
  ref.push({ href: '/interventions', key: 'navInterventions' });
  if (may(s, 'report.export')) ref.push({ href: '/reports', key: 'navReports' });
  if (may(s, 'ai.assistant')) ref.push({ href: '/assistant', key: 'navAssistant' });
  groups.push({ label: { en: 'Reference', hi: 'संदर्भ' }, items: ref });

  const admin: NavItem[] = [];
  if (may(s, 'data.import')) admin.push({ href: '/import', key: 'navImport' });
  if (may(s, 'audit.view')) admin.push({ href: '/audit', key: 'navAudit' });
  if (may(s, 'audit.view')) admin.push({ href: '/ai-log', key: 'navAi' });
  if (may(s, 'settings.configure')) admin.push({ href: '/settings', key: 'navSettings' });
  if (may(s, 'users.manage')) admin.push({ href: '/users', key: 'navUsers' });
  if (may(s, 'demo.reset')) {
    admin.push({ href: '/admin/outbox', key: 'navOutbox' });
    admin.push({ href: '/admin/jobs', key: 'navJobs' });
    admin.push({ href: '/admin', key: 'navAdmin' });
  } else if (may(s, 'settings.configure')) {
    admin.push({ href: '/admin/jobs', key: 'navJobs' });
  }
  if (admin.length > 0) groups.push({ label: { en: 'Administration', hi: 'प्रशासन' }, items: admin });

  // De-duplicate: a role's home may also appear as a section link.
  const seen = new Set<string>();
  for (const g of groups) {
    g.items = g.items.filter((i) => (seen.has(i.href) ? false : (seen.add(i.href), true)));
  }
  return groups.filter((g) => g.items.length > 0);
}
