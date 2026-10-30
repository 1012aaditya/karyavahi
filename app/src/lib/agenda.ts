import 'server-only';
import type { Session } from './session';
import { approvalQueue, listTasks, outcomesToReview, listCases } from './cases';
import { listBlockers, blockerMeta } from './blockers';
import { hotspotUnits } from './hotspots';
import { rounds } from './repo';
import { today, daysBetween } from './clock';

/**
 * Review meeting agenda — assembled deterministically from the ledger, in the order a review
 * meeting should take things: decisions first, then what is off track, then what is coming.
 */

export interface AgendaItem { section: string; title: string; detail: string; href: string; sources: string[] }

export function reviewAgenda(s: Session): { date: string; items: AgendaItem[]; upcoming: string | null } {
  const items: AgendaItem[] = [];
  for (const q of approvalQueue(s, { limit: 10 })) {
    items.push({ section: '1. Decisions needed', title: `${q.case.id}: approve, revise or reject the plan`, detail: q.case.title, href: `/cases/${q.case.id}#plan`, sources: [q.case.id] });
  }
  for (const o of outcomesToReview(s, { limit: 20 }).filter((x) => ['below_target', 'no_change', 'worsened'].includes(x.outcome.category)).slice(0, 6)) {
    items.push({ section: '1. Decisions needed', title: `${o.outcome.case_id}: delivered without a demonstrated gain — reopen?`, detail: `Outcome check: ${o.outcome.category.replace(/_/g, ' ')}`, href: `/cases/${o.outcome.case_id}#outcome`, sources: [o.outcome.id, o.outcome.case_id] });
  }
  for (const t of listTasks(s, { overdue: true, escalated: true, limit: 10 })) {
    items.push({ section: '2. Escalations and overdue work', title: `${t.id}: ${t.title_en}`, detail: `${t.case_id} · ${daysBetween(t.due_date, today())} days overdue · ${t.owner_role.toUpperCase()}`, href: `/tasks/${t.id}`, sources: [t.id, t.case_id] });
  }
  for (const b of listBlockers(s, { open: true, limit: 8 }).filter((b) => b.responsible_level !== 'block' || b.status === 'escalated')) {
    items.push({ section: '3. Blockers needing higher authority', title: `${b.id}: ${blockerMeta(b.blocker_type).label}`, detail: `${b.case_id} · ${b.description}`, href: `/execution?tab=blockers`, sources: [b.id, b.case_id] });
  }
  const hs = hotspotUnits(s, {});
  for (const u of hs.units.filter((x) => x.severity === 'critical' && x.openCases === 0).slice(0, 5)) {
    items.push({ section: '4. New hotspots without a case', title: `${u.name}: ${u.relPp} pp vs district`, detail: 'Critical decline with no open case — investigate or record why not.', href: `/hotspots?level=${u.level}&selected=${u.id}`, sources: [u.id] });
  }
  const pending = listCases(s, { status: ['outcome_pending'], limit: 200 });
  const next = rounds().find((r) => r.status === 'scheduled');
  return { date: today(), items, upcoming: next ? `${pending.length} delivered case(s) await ${next.code} (${next.label}), window ${next.window_start} to ${next.window_end}.` : null };
}
