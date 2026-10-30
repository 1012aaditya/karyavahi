import 'server-only';
import { all } from './db';
import { and, casesPred, schoolsPred, tasksPred, reportsPred } from './scope';
import type { Session } from './session';
import { may } from './guard';

/**
 * Global search. Every group runs through the same scope predicates as the pages it links to,
 * so a result never points at a record the user would then be refused.
 */

export interface SearchHit { id: string; title: string; sub: string; href: string }
export interface SearchResults {
  q: string;
  cases: SearchHit[];
  schools: SearchHit[];
  interventions: SearchHit[];
  tasks: SearchHit[];
  reports: SearchHit[];
  total: number;
}

const LIMIT = 12;

export function search(s: Session, raw: string): SearchResults {
  const q = raw.trim().slice(0, 80);
  const empty: SearchResults = { q, cases: [], schools: [], interventions: [], tasks: [], reports: [], total: 0 };
  if (q.length < 2) return empty;
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

  const cp = and(casesPred(s, 'c'), { sql: `(c.id like ? escape '\\' or c.title like ? escape '\\')`, params: [like, like] });
  const cases = all<{ id: string; title: string; status: string; block: string | null }>(
    `select c.id, c.title, c.status, b.name block from cases c left join blocks b on b.id = c.block_id
      where ${cp.sql} order by c.updated_at desc limit ${LIMIT}`, ...cp.params,
  ).map((r) => ({ id: r.id, title: r.title, sub: `${r.status.replace(/_/g, ' ')}${r.block ? ` · ${r.block}` : ''}`, href: `/cases/${r.id}` }));

  const sp = and(schoolsPred(s, 'sc'), { sql: `(sc.id like ? escape '\\' or sc.name like ? escape '\\' or sc.village like ? escape '\\')`, params: [like, like, like] });
  const schools = all<{ id: string; name: string; village: string; cluster: string }>(
    `select sc.id, sc.name, sc.village, cl.name cluster from schools sc left join clusters cl on cl.id = sc.cluster_id
      where ${sp.sql} order by sc.name limit ${LIMIT}`, ...sp.params,
  ).map((r) => ({ id: r.id, title: r.name, sub: `${r.village} · ${r.cluster} cluster`, href: `/schools/${r.id}` }));

  const interventions = all<{ id: string; name: string; category: string }>(
    `select id, name, category from interventions where id like ? escape '\\' or name like ? escape '\\' or description like ? escape '\\' order by id limit ${LIMIT}`,
    like, like, like,
  ).map((r) => ({ id: r.id, title: r.name, sub: r.category.replace(/_/g, ' '), href: `/interventions/${r.id}` }));

  const tp = and(tasksPred(s, 't'), { sql: `(t.id like ? escape '\\' or t.title_en like ? escape '\\' or t.title_hi like ? escape '\\')`, params: [like, like, like] });
  const tasks = all<{ id: string; title_en: string; status: string; case_id: string }>(
    `select t.id, t.title_en, t.status, t.case_id from tasks t where ${tp.sql} order by t.due_date desc limit ${LIMIT}`, ...tp.params,
  ).map((r) => ({ id: r.id, title: r.title_en, sub: `${r.case_id} · ${r.status.replace(/_/g, ' ')}`, href: `/tasks/${r.id}` }));

  let reports: SearchHit[] = [];
  if (may(s, 'report.export')) {
    const rp = and(reportsPred(s, 'r'), { sql: `(r.id like ? escape '\\' or r.title like ? escape '\\')`, params: [like, like] });
    reports = all<{ id: string; title: string; report_type: string; generated_at: string }>(
      `select r.id, r.title, r.report_type, r.generated_at from reports r where ${rp.sql} order by r.generated_at desc limit ${LIMIT}`, ...rp.params,
    ).map((r) => ({ id: r.id, title: r.title, sub: `${r.report_type.replace(/_/g, ' ')} · ${r.generated_at.slice(0, 10)}`, href: `/reports/${r.id}` }));
  }

  const total = cases.length + schools.length + interventions.length + tasks.length + reports.length;
  return { q, cases, schools, interventions, tasks, reports, total };
}
