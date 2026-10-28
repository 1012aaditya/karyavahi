// Outcome check: school-level difference-in-differences with a Welch t-interval.
//   DiD = (treated follow-up − treated baseline) − (comparison follow-up − comparison baseline)
// computed on unweighted school means, so the point estimate equals mean(Δtreated) − mean(Δcomparison).
// This is NOT a causal estimate: it assumes parallel trends, and treated schools were picked after
// a drop, so regression to the mean can inflate it. The UI must show that note.

import type { OutcomeCategory, OutcomeSchoolRow } from './types';
import { mean, sampleVariance, tCritical975, round } from '../lib/stats';

export interface OutcomeOptions {
  success_threshold_pp: number;
  participation_floor_ratio: number;
  min_participation: number;
}

export interface OutcomeResult {
  treated_baseline_mean: number | null;
  treated_followup_mean: number | null;
  comparison_baseline_mean: number | null;
  comparison_followup_mean: number | null;
  treated_change_pp: number | null;
  comparison_change_pp: number | null;
  did_pp: number | null;
  ci_low_pp: number | null;
  ci_high_pp: number | null;
  ci_method: string;
  participation_check: { treated_baseline: number | null; treated_followup: number | null; floor: number; passed: boolean };
  category: OutcomeCategory;
  reasons: string[];
}

const complete = (r: OutcomeSchoolRow) => r.baseline_pct !== null && r.followup_pct !== null;

export function evaluateOutcome(treated: OutcomeSchoolRow[], comparison: OutcomeSchoolRow[], o: OutcomeOptions): OutcomeResult {
  const reasons: string[] = [];
  const T = treated.filter(complete);
  const C = comparison.filter(complete);
  const empty: OutcomeResult = {
    treated_baseline_mean: null,
    treated_followup_mean: null,
    comparison_baseline_mean: null,
    comparison_followup_mean: null,
    treated_change_pp: null,
    comparison_change_pp: null,
    did_pp: null,
    ci_low_pp: null,
    ci_high_pp: null,
    ci_method: 'not computed',
    participation_check: { treated_baseline: null, treated_followup: null, floor: o.participation_floor_ratio, passed: false },
    category: 'inconclusive',
    reasons,
  };
  if (T.length < treated.length) reasons.push(`${treated.length - T.length} treated school(s) missing baseline or follow-up data`);
  if (T.length === 0 || C.length === 0) {
    if (C.length === 0) reasons.push('No comparison school has both rounds');
    return empty;
  }

  const tb = mean(T.map((r) => r.baseline_pct!));
  const tf = mean(T.map((r) => r.followup_pct!));
  const cb = mean(C.map((r) => r.baseline_pct!));
  const cf = mean(C.map((r) => r.followup_pct!));
  const dT = T.map((r) => r.followup_pct! - r.baseline_pct!);
  const dC = C.map((r) => r.followup_pct! - r.baseline_pct!);
  const did = mean(dT) - mean(dC);

  let ciLow: number | null = null;
  let ciHigh: number | null = null;
  let ciMethod = 'not computed: need at least 2 treated and 2 comparison schools';
  if (dT.length >= 2 && dC.length >= 2) {
    const vT = sampleVariance(dT) / dT.length;
    const vC = sampleVariance(dC) / dC.length;
    const se = Math.sqrt(vT + vC);
    const df = (vT + vC) ** 2 / ((vT ** 2) / (dT.length - 1) + (vC ** 2) / (dC.length - 1) || 1);
    const t = tCritical975(df);
    ciLow = did - t * se;
    ciHigh = did + t * se;
    ciMethod = `95% Welch t-interval on school-level changes (df ≈ ${round(df, 1)}); schools treated as independent`;
  }

  const partT = T.map((r) => r.baseline_participation).filter((x): x is number => x !== null);
  const partF = T.map((r) => r.followup_participation).filter((x): x is number => x !== null);
  const pb = partT.length ? mean(partT) : null;
  const pf = partF.length ? mean(partF) : null;
  const partPassed = pb !== null && pf !== null && pf >= o.participation_floor_ratio * pb && pf >= o.min_participation;
  if (!partPassed) reasons.push('Follow-up participation in treated schools fell below the floor (possible exclusion of weak students)');

  let category: OutcomeCategory;
  if (T.length < treated.length || !partPassed) category = 'inconclusive';
  else if (did >= o.success_threshold_pp) category = ciLow !== null && ciLow > 0 ? 'improved_confirmed' : 'improved_indicative';
  else if (did <= -o.success_threshold_pp) category = 'worsened';
  else if (did <= 0) category = 'no_change';
  else category = 'below_target';

  return {
    treated_baseline_mean: round(tb, 1),
    treated_followup_mean: round(tf, 1),
    comparison_baseline_mean: round(cb, 1),
    comparison_followup_mean: round(cf, 1),
    treated_change_pp: round(tf - tb, 1),
    comparison_change_pp: round(cf - cb, 1),
    did_pp: round(did, 1),
    ci_low_pp: ciLow === null ? null : round(ciLow, 1),
    ci_high_pp: ciHigh === null ? null : round(ciHigh, 1),
    ci_method: ciMethod,
    participation_check: {
      treated_baseline: pb === null ? null : round(pb, 3),
      treated_followup: pf === null ? null : round(pf, 3),
      floor: o.participation_floor_ratio,
      passed: partPassed,
    },
    category,
    reasons,
  };
}

export const OUTCOME_NOTE =
  'Illustrative estimate on fictional data. Difference-in-differences assumes treated and comparison schools would have moved in parallel without the intervention. Treated schools were selected after a drop, so part of any rebound may be regression to the mean. Read as indicative, not causal.';
