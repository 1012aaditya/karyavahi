// Rule-based finding detection. Pure and deterministic: the seed generator and the app's
// import pipeline call the same function, so a re-run on the same rows gives the same findings.
//
// Method: for each cluster × grade × competency, compare % proficient between two rounds and
// subtract the district's change over the same rounds (removes seasonal and state-wide shifts).
// A finding needs ALL of: relative drop ≥ materiality, two-proportion z ≤ −z_threshold,
// enough students, enough schools reporting, enough participation. No statistical model beyond that.

import type { DetectionSettings, DqCheck, DriverSchool, Severity } from './types';

export interface DetectRow {
  school_id: string;
  grade: number;
  competency_id: string;
  enrolled: number;
  n_assessed: number;
  n_proficient: number;
}

export interface DetectSchool {
  id: string;
  cluster_id: string;
  block_id: string;
  district_id: string;
}

export interface Candidate {
  district_id: string;
  block_id: string;
  cluster_id: string;
  grade: number;
  competency_id: string;
  prev_value_pct: number;
  curr_value_pct: number;
  change_pp: number;
  district_change_pp: number;
  relative_change_pp: number;
  z_score: number;
  n_prev: number;
  n_curr: number;
  schools_reporting: number;
  schools_total: number;
  participation_rate: number;
  dq_checks: DqCheck[];
  status: 'flagged' | 'rejected_noise' | 'rejected_data_quality';
  severity: Severity;
  driver_schools: DriverSchool[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function detectFindings(
  prev: readonly DetectRow[],
  curr: readonly DetectRow[],
  schools: readonly DetectSchool[],
  s: DetectionSettings,
): Candidate[] {
  const key = (r: { school_id: string; grade: number; competency_id: string }) => `${r.school_id}|${r.grade}|${r.competency_id}`;
  const prevIdx = new Map<string, DetectRow>();
  for (const r of prev) if (r.n_assessed > 0) prevIdx.set(key(r), r);
  const schoolById = new Map(schools.map((x) => [x.id, x]));
  const schoolsInCluster = new Map<string, number>();
  for (const sc of schools) schoolsInCluster.set(sc.cluster_id, (schoolsInCluster.get(sc.cluster_id) ?? 0) + 1);

  type Agg = { nP: number; pP: number; nC: number; pC: number; enr: number; rows: { prev: DetectRow; curr: DetectRow }[] };
  const district = new Map<string, Agg>();
  const cluster = new Map<string, Agg>();
  const blank = (): Agg => ({ nP: 0, pP: 0, nC: 0, pC: 0, enr: 0, rows: [] });

  for (const c of curr) {
    if (c.n_assessed <= 0) continue;
    const p = prevIdx.get(key(c));
    const sc = schoolById.get(c.school_id);
    if (!p || !sc) continue;
    const dk = `${sc.district_id}|${c.grade}|${c.competency_id}`;
    const ck = `${sc.cluster_id}|${c.grade}|${c.competency_id}`;
    for (const [m, k] of [[district, dk], [cluster, ck]] as const) {
      const a = m.get(k) ?? blank();
      a.nP += p.n_assessed;
      a.pP += p.n_proficient;
      a.nC += c.n_assessed;
      a.pC += c.n_proficient;
      a.enr += c.enrolled;
      if (m === cluster) a.rows.push({ prev: p, curr: c });
      m.set(k, a);
    }
  }

  const out: Candidate[] = [];
  for (const [ck, a] of cluster) {
    const [clusterId, gradeStr, compId] = ck.split('|');
    const grade = Number(gradeStr);
    const anySchool = schoolById.get(a.rows[0].curr.school_id)!;
    const d = district.get(`${anySchool.district_id}|${grade}|${compId}`)!;
    const prevPct = a.pP / a.nP;
    const currPct = a.pC / a.nC;
    const change = (currPct - prevPct) * 100;
    const dChange = (d.pC / d.nC - d.pP / d.nP) * 100;
    const rel = change - dChange;
    if (rel > -s.materiality_pp) continue; // not even a candidate

    const se = Math.sqrt((prevPct * (1 - prevPct)) / a.nP + (currPct * (1 - currPct)) / a.nC) * 100;
    const z = se > 0 ? rel / se : 0;
    const total = schoolsInCluster.get(clusterId) ?? a.rows.length;
    const reportingShare = a.rows.length / total;
    const participation = a.enr > 0 ? a.nC / a.enr : 0;

    const dq: DqCheck[] = [
      { check: 'students_assessed_current', value: a.nC, threshold: s.min_cluster_assessed, passed: a.nC >= s.min_cluster_assessed },
      { check: 'students_assessed_previous', value: a.nP, threshold: s.min_cluster_assessed, passed: a.nP >= s.min_cluster_assessed },
      { check: 'school_reporting_share', value: r3(reportingShare), threshold: s.min_school_reporting_share, passed: reportingShare >= s.min_school_reporting_share },
      { check: 'participation_rate', value: r3(participation), threshold: s.min_participation, passed: participation >= s.min_participation },
    ];
    const dqPassed = dq.every((c) => c.passed);
    const noisePassed = z <= -s.z_threshold;

    // Attribution: each school's share of the cluster's excess drop (weighted by students assessed).
    const contribs = a.rows.map(({ prev: p, curr: c }) => {
      const chg = (c.n_proficient / c.n_assessed - p.n_proficient / p.n_assessed) * 100;
      return {
        school_id: c.school_id,
        prev_pct: r1((p.n_proficient / p.n_assessed) * 100),
        curr_pct: r1((c.n_proficient / c.n_assessed) * 100),
        change_pp: r1(chg),
        contribution: c.n_assessed * (chg - dChange),
      };
    });
    const negTotal = contribs.filter((x) => x.contribution < 0).reduce((t, x) => t + x.contribution, 0);
    const drivers: DriverSchool[] = [];
    let cum = 0;
    for (const x of contribs.filter((x) => x.contribution < 0).sort((p, q) => p.contribution - q.contribution)) {
      if (cum >= s.driver_cumulative_share || drivers.length >= s.max_driver_schools) break;
      const share = negTotal < 0 ? x.contribution / negTotal : 0;
      cum += share;
      drivers.push({ school_id: x.school_id, prev_pct: x.prev_pct, curr_pct: x.curr_pct, change_pp: x.change_pp, contribution_share: r3(share) });
    }

    const severity: Severity = rel <= -s.severity_critical_pp ? 'critical' : rel <= -s.severity_high_pp ? 'high' : 'medium';
    out.push({
      district_id: anySchool.district_id,
      block_id: anySchool.block_id,
      cluster_id: clusterId,
      grade,
      competency_id: compId,
      prev_value_pct: r1(prevPct * 100),
      curr_value_pct: r1(currPct * 100),
      change_pp: r1(change),
      district_change_pp: r1(dChange),
      relative_change_pp: r1(rel),
      z_score: Math.round(z * 100) / 100,
      n_prev: a.nP,
      n_curr: a.nC,
      schools_reporting: a.rows.length,
      schools_total: total,
      participation_rate: r3(participation),
      dq_checks: dq,
      status: !dqPassed ? 'rejected_data_quality' : !noisePassed ? 'rejected_noise' : 'flagged',
      severity,
      driver_schools: drivers,
    });
  }
  // stable order: most severe first, then ids
  return out.sort((a, b) => a.relative_change_pp - b.relative_change_pp || a.cluster_id.localeCompare(b.cluster_id) || a.grade - b.grade || a.competency_id.localeCompare(b.competency_id));
}
