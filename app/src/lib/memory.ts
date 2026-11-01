import 'server-only';
import { all, j } from './db';
import { casesPred, and } from './scope';
import type { Session } from './session';
import { getCase, caseDiagnosis } from './cases';
import type { FactorCode, OutcomeCategory } from '@domain/types';

/**
 * Learning memory: "similar cases and what we learned".
 *
 * Deterministic similarity over structured fields — competency, grade, the conditions the
 * diagnosis found, the intervention chosen. Only cases inside the user's scope are returned,
 * through the same predicate as the case list. No vector search: the fields that matter are
 * already structured, and an exact rule is easier to audit than an embedding distance.
 */

export interface SimilarCase {
  id: string;
  title: string;
  block: string;
  grade: number;
  competency_id: string;
  status: string;
  intervention: string | null;
  interventionName: string | null;
  score: number;
  why: string[];
  outcome: {
    category: OutcomeCategory;
    did_pp: number | null;
    ci_low_pp: number | null;
    ci_high_pp: number | null;
    delivery_verified: boolean;
    participation_passed: boolean;
    note: string;
  } | null;
  reopenCount: number;
}

export function similarCases(s: Session, caseId: string, limit = 5): SimilarCase[] {
  const c = getCase(s, caseId);
  if (!c) return [];
  const dx = caseDiagnosis(s, caseId);
  const myFactors = new Set((dx?.ranked_factors ?? []).filter((f) => f.schools_flagged > 0).map((f) => f.factor));
  const myDomain = c.competency_id.startsWith('CMP-N') ? 'N' : 'L';

  const p = and(casesPred(s, 'c'), { sql: 'c.id <> ?', params: [caseId] });
  const rows = all<{
    id: string; title: string; block: string; grade: number; competency_id: string; status: string; reopen_count: number;
    intervention_id: string | null; iv_name: string | null; ranked_factors: string | null;
    category: OutcomeCategory | null; did_pp: number | null; ci_low_pp: number | null; ci_high_pp: number | null;
    delivery_verified: number | null; participation_check: string | null; interpretation_note: string | null;
  }>(
    `select c.id, c.title, b.name block, c.grade, c.competency_id, c.status, c.reopen_count,
            p.intervention_id, iv.name iv_name, d.ranked_factors,
            oe.category, oe.did_pp, oe.ci_low_pp, oe.ci_high_pp, oe.delivery_verified, oe.participation_check, oe.interpretation_note
       from cases c
       left join blocks b on b.id = c.block_id
       left join case_plans p on p.id = c.current_plan_id
       left join interventions iv on iv.id = p.intervention_id
       left join diagnoses d on d.case_id = c.id
       left join outcome_evaluations oe on oe.id = (select id from outcome_evaluations x where x.case_id = c.id order by x.evaluated_at desc limit 1)
      where ${p.sql}`,
    ...p.params,
  );

  const currentPlanIv = all<{ intervention_id: string }>('select intervention_id from case_plans where id = ?', c.current_plan_id ?? '')[0]?.intervention_id;

  const scored = rows.map((r) => {
    const why: string[] = [];
    let score = 0;
    if (r.competency_id === c.competency_id) { score += 3; why.push('same competency'); }
    else if (r.competency_id.startsWith(`CMP-${myDomain}`)) { score += 1; why.push('same subject'); }
    if (r.grade === c.grade) { score += 2; why.push(`Class ${c.grade}`); }
    const theirs = j<{ factor: FactorCode; schools_flagged: number }[]>(r.ranked_factors, []).filter((f) => f.schools_flagged > 0).map((f) => f.factor);
    const shared = theirs.filter((f) => myFactors.has(f));
    if (shared.length) { score += 2 * shared.length; why.push(`shared conditions: ${shared.map((f) => f.replace(/_/g, ' ')).join(', ')}`); }
    if (currentPlanIv && r.intervention_id === currentPlanIv) { score += 2; why.push('same intervention'); }
    if (r.category) score += 1; // a case with a measured result teaches more
    const pc = j<{ passed?: boolean }>(r.participation_check, {});
    return {
      id: r.id, title: r.title, block: r.block, grade: r.grade, competency_id: r.competency_id, status: r.status,
      intervention: r.intervention_id, interventionName: r.iv_name, score, why, reopenCount: Number(r.reopen_count),
      outcome: r.category ? {
        category: r.category, did_pp: r.did_pp, ci_low_pp: r.ci_low_pp, ci_high_pp: r.ci_high_pp,
        delivery_verified: Boolean(r.delivery_verified), participation_passed: Boolean(pc.passed), note: r.interpretation_note ?? '',
      } : null,
    } satisfies SimilarCase;
  });

  return scored.filter((r) => r.score >= 4).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}

/** A plain, deterministic summary of what similar cases showed — no generalising beyond them. */
export function lessonsFrom(cases: SimilarCase[], lang: 'en' | 'hi' = 'en'): string[] {
  const out: string[] = [];
  const hi = lang === 'hi';
  const byIv = new Map<string, SimilarCase[]>();
  for (const c of cases) if (c.intervention) byIv.set(c.intervention, [...(byIv.get(c.intervention) ?? []), c]);
  for (const [iv, list] of byIv) {
    const evaluated = list.filter((c) => c.outcome);
    if (evaluated.length === 0) { out.push(hi ? `${list.length} मिलते-जुलते प्रकरणों में ${iv} लगाया गया; किसी की परिणाम जाँच अभी नहीं हुई।` : `${list.length} similar case${list.length > 1 ? 's' : ''} used ${iv}; none has an outcome check yet.`); continue; }
    const gained = evaluated.filter((c) => c.outcome!.category.startsWith('improved')).length;
    const lowPart = evaluated.filter((c) => !c.outcome!.participation_passed).length;
    out.push(hi
      ? `${evaluated.length} मिलते-जुलते प्रकरणों में ${iv} लगाया गया और जाँचा गया: ${gained} में सुधार दिखा${evaluated.length - gained > 0 ? `, ${evaluated.length - gained} में नहीं` : ''}${lowPart ? ` (${lowPart} में भागीदारी न्यूनतम से कम)` : ''}।`
      : `${evaluated.length} similar case${evaluated.length > 1 ? 's' : ''} used ${iv} and were evaluated: ${gained} showed a gain${evaluated.length - gained > 0 ? `, ${evaluated.length - gained} did not` : ''}${lowPart ? ` (${lowPart} with participation below the floor)` : ''}.`);
  }
  const reopened = cases.filter((c) => c.reopenCount > 0).length;
  if (reopened) out.push(hi ? `इनमें से ${reopened} प्रकरण काम पूरा होने पर भी सुधार न दिखने से फिर खोलने पड़े।` : `${reopened} of these cases had to be reopened after delivery did not produce the gain.`);
  return out;
}
