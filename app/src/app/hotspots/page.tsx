import Link from 'next/link';
import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { hotspotUnits, unitBreakdown, unitPath, canSeeUnit, topLevel, comparableRounds, RULES, type Level, type HotspotFilters as HF } from '@/lib/hotspots';
import { listCases } from '@/lib/cases';
import { competencies, scopeName } from '@/lib/repo';
import { listBlockers } from '@/lib/blockers';
import { pick } from '@/lib/i18n';
import { PageHead, fmtDate } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { StatusPill, SeverityPill } from '@/components/labels';
import { HotspotMap, HotspotFilters, type MapUnit } from '@/components/HotspotMap';
import { SEV_META, type Sev } from '@/lib/sev';
import { GeoMap } from '@/components/GeoMap';
import { Suspense } from 'react';
import { all as dbAll } from '@/lib/db';
import { complaintsPred, OPEN_STATUSES } from '@/lib/complaints';

/**
 * Learning hotspots. Drill from district to block to cluster to school, with filters for class,
 * subject, competency and round. The map is a schematic of the administrative hierarchy (the
 * seed has no coordinates); the numbers are computed by src/lib/hotspots.ts with the detector's
 * method, and every unit links straight to its schools and cases.
 */

const LEVELS: Level[] = ['district', 'block', 'cluster', 'school'];
const PLURAL: Record<Level, string> = { district: 'Districts', block: 'Blocks', cluster: 'Clusters', school: 'Schools' };
const pp = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} pp`);

type SP = { plevel?: string; parent?: string; level?: string; selected?: string; grade?: string; comp?: string; subject?: string; round?: string; view?: string; layer?: string; h?: string };

export default async function HotspotsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await pageSession();
  const lang = await getLanguage();
  const sp = await searchParams;
  const comps = competencies();
  const compName = new Map(comps.map((c) => [c.id, pick(lang, c.name_en, c.name_hi)]));

  const filters: HF = {
    grade: ['1', '2', '3'].includes(sp.grade ?? '') ? Number(sp.grade) : undefined,
    competencyId: comps.some((c) => c.id === sp.comp) ? sp.comp : undefined,
    subject: sp.subject === 'N' || sp.subject === 'L' ? sp.subject : undefined,
    roundId: comparableRounds().some((r) => r.id === sp.round) ? sp.round : undefined,
  };

  // Resolve the drill parent: explicit, or the parent of a selected unit, or the user's top level.
  const top = topLevel(session);
  let parent: { level: Level; id: string } | undefined;
  if (sp.plevel && sp.parent && LEVELS.includes(sp.plevel as Level) && canSeeUnit(session, sp.plevel as Level, sp.parent)) {
    parent = { level: sp.plevel as Level, id: sp.parent };
  } else if (sp.selected && sp.level && LEVELS.includes(sp.level as Level) && canSeeUnit(session, sp.level as Level, sp.selected)) {
    const path = unitPath(sp.level as Level, sp.selected);
    const up = path.at(-2);
    if (up && LEVELS.indexOf(up.level) >= LEVELS.indexOf(top) - 1 && canSeeUnit(session, up.level, up.id)) parent = { level: up.level, id: up.id };
  }
  if (parent && LEVELS.indexOf(parent.level) < LEVELS.indexOf(top) - 1) parent = undefined;

  const { level, units, pair } = hotspotUnits(session, filters, parent);
  let selected = sp.selected ? units.find((u) => u.id === sp.selected) ?? null : null;
  // Selected from the map, search or a city view: resolve it among its own siblings.
  if (!selected && sp.selected && LEVELS.includes(sp.level as Level) && canSeeUnit(session, sp.level as Level, sp.selected)) {
    const up = unitPath(sp.level as Level, sp.selected).at(-2);
    if (up && canSeeUnit(session, up.level, up.id)) selected = hotspotUnits(session, filters, { level: up.level, id: up.id }).units.find((u) => u.id === sp.selected) ?? null;
    else if (!up || session.scope_id === sp.selected) selected = hotspotUnits(session, filters).units.find((u) => u.id === sp.selected) ?? null;
  }
  const view = sp.view === 'list' ? 'list' : 'map';
  // Only levels below the user's own scope appear after the scope root.
  const scopeIdx = LEVELS.indexOf(session.scope_type as Level);
  const crumbs = parent ? unitPath(parent.level, parent.id).filter((c) => LEVELS.indexOf(c.level) > scopeIdx) : [];
  const childIdx = LEVELS.indexOf(level);

  const mapUnits: MapUnit[] = units.map((u) => ({
    id: u.id, name: u.name, level: u.level, severity: u.severity as Sev, reason: u.reason,
    relPp: u.relPp, overallRelPp: u.overallRelPp, prevPct: u.prevPct, currPct: u.currPct, z: u.z,
    nCurr: u.nCurr, schools: u.schools, openCases: u.openCases, criticalCases: u.criticalCases, overdueTasks: u.overdueTasks,
    focusLabel: u.focus ? `Class ${u.focus.grade} ${compName.get(u.focus.competency_id) ?? u.focus.competency_id}` : null,
    canDrill: childIdx < 3,
    hotChildren: u.hotChildren,
    childLabel: childIdx < 3 ? PLURAL[LEVELS[childIdx + 1]].toLowerCase() : '',
  }));

  // Detail for the selected unit.
  let detail: null | {
    breakdown: ReturnType<typeof unitBreakdown>;
    cases: ReturnType<typeof listCases>;
    blockers: number;
    complaints: number;
  } = null;
  if (selected) {
    const lv = selected.level;
    const cases = lv === 'school'
      ? listCases(session, { open: true, limit: 200 }).filter((c) => c.school_ids.includes(selected.id)).slice(0, 6)
      : listCases(session, { open: true, limit: 6, ...(lv === 'district' ? { districtId: selected.id } : lv === 'block' ? { blockId: selected.id } : { clusterId: selected.id }) });
    const blockers = listBlockers(session, { open: true, limit: 500 }).filter((b) => cases.some((c) => c.id === b.case_id)).length;
    const kp = complaintsPred(session, 'k');
    const complaints = Number(dbAll<{ n: number }>(`select count(*) n from complaints k where (${kp.sql}) and k.status in (${OPEN_STATUSES.map(() => '?').join(',')}) and k.${lv === 'school' ? 'school_id' : `${lv}_id`} = ?`, ...kp.params, ...OPEN_STATUSES, selected.id)[0]?.n ?? 0);
    detail = { breakdown: unitBreakdown(session, lv, selected.id, filters), cases, blockers, complaints };
  }

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ grade: sp.grade, comp: sp.comp, subject: sp.subject, round: sp.round, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  return (
    <div className="space-y-5">
      <PageHead
        title={pick(lang, 'Learning hotspots', 'अधिगम हॉटस्पॉट')}
        sub={pick(lang,
          'Where is proficiency falling faster than the district? Severity is computed from the assessment rows with the same method as the case detector, and small samples are shown as unknown — not as stable.',
          'प्रवीणता ज़िले से तेज़ी से कहाँ गिर रही है? गंभीरता आकलन डेटा से निकाली जाती है; छोटे नमूने "अपर्याप्त डेटा" दिखते हैं।')}
        right={<span className="chip border-warn/30 bg-warn-light text-warn"><Icon name="info" size={13} />Schematic · fictional data</span>}
      />

      <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        {view === 'list' ? (
        <nav aria-label="Drill-down path" className="flex flex-wrap items-center gap-1 text-[13px]">
          <Link href={`/hotspots${qs({})}`} className={`rounded-md px-2 py-1 ${crumbs.length === 0 ? 'bg-navy text-white' : 'text-ink-soft hover:bg-paper-sunk hover:text-ink'}`}>
            <Icon name="layers" size={14} className="mr-1 inline" />{scopeName(session.scope_type, session.scope_id)}
          </Link>
          {crumbs.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              <Icon name="chevron-right" size={14} className="text-ink-faint" />
              <Link href={`/hotspots${qs({ plevel: c.level, parent: c.id })}`} className={`rounded-md px-2 py-1 ${i === crumbs.length - 1 ? 'bg-navy text-white' : 'text-ink-soft hover:bg-paper-sunk hover:text-ink'}`}>{c.name}</Link>
            </span>
          ))}
          <span className="ml-1 text-[12px] text-ink-faint">· showing {PLURAL[level].toLowerCase()}</span>
        </nav>
        ) : <p className="text-[13px] text-ink-soft"><Icon name="map" size={14} className="mr-1 inline text-ink-faint" />Filters apply to the map and the list.</p>}
        <HotspotFilters competencies={comps.map((c) => ({ id: c.id, label: pick(lang, c.name_en, c.name_hi) }))} rounds={comparableRounds().map((r) => ({ id: r.id, label: `${r.code} · ${r.label}` }))} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="card p-4 sm:p-5" aria-label="Hotspot map">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink">{PLURAL[level]} {parent ? `in ${crumbs.at(-1)?.name ?? ''}` : ''}</h2>
            <p className="text-[12px] text-ink-faint">{pair ? `${pair.prev.code} ${pair.prev.label} → ${pair.curr.code} ${pair.curr.label}` : 'No comparable rounds'}</p>
          </div>
          <div className="mb-3 inline-flex rounded-lg border border-line-strong bg-white p-0.5" role="group" aria-label="View">
            <Link href={`/hotspots?${new URLSearchParams(Object.entries({ ...sp, view: undefined }).filter(([, v]) => v) as [string, string][])}`} aria-current={view === 'map' ? 'page' : undefined} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] ${view === 'map' ? 'bg-navy text-white' : 'text-ink-soft hover:text-ink'}`}><Icon name="map" size={14} />Map</Link>
            <Link href={`/hotspots?${new URLSearchParams(Object.entries({ ...sp, view: 'list' }).filter(([, v]) => v) as [string, string][])}`} aria-current={view === 'list' ? 'page' : undefined} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] ${view === 'list' ? 'bg-navy text-white' : 'text-ink-soft hover:text-ink'}`}><Icon name="list" size={14} />List</Link>
          </div>
          {view === 'map' ? (
            <Suspense fallback={<div className="skeleton h-[560px] w-full" />}><GeoMap selectedId={selected?.id ?? sp.selected ?? null} /></Suspense>
          ) : (
            <HotspotMap units={mapUnits} selectedId={selected?.id ?? null} levelLabel={PLURAL[level]} childLevel={level} forceList />
          )}
        </section>

        <aside className="space-y-4 xl:sticky xl:top-[96px] xl:self-start">
          {selected && detail ? (
            <section className="card overflow-hidden" aria-label="Selected area">
              <header className={`px-4 py-3.5 ${SEV_META[selected.severity as Sev].tile} border-0`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-80">{selected.level} · {SEV_META[selected.severity as Sev].label}</p>
                <p className="mt-0.5 text-[17px] font-semibold leading-tight">{selected.name}</p>
                <p className="mt-1 text-[12.5px] opacity-90">{selected.reason}</p>
              </header>
              <dl className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
                <div className="px-2 py-2.5"><dt className="label">Before</dt><dd className="tnum text-[15px] font-semibold text-ink">{selected.focus ? `${selected.focus.prevPct ?? '—'}%` : `${selected.prevPct ?? '—'}%`}</dd></div>
                <div className="px-2 py-2.5"><dt className="label">After</dt><dd className="tnum text-[15px] font-semibold text-ink">{selected.focus ? `${selected.focus.currPct ?? '—'}%` : `${selected.currPct ?? '—'}%`}</dd></div>
                <div className="px-2 py-2.5"><dt className="label">vs district</dt><dd className={`tnum text-[15px] font-semibold ${SEV_META[selected.severity as Sev].text}`}>{pp(selected.relPp)}</dd></div>
              </dl>
              <div className="space-y-4 p-4">
                <p className="text-[12px] leading-snug text-ink-faint">
                  {selected.focus ? `Figures are for Class ${selected.focus.grade} ${compName.get(selected.focus.competency_id)}, the worst cell. ` : ''}
                  Overall {pp(selected.overallRelPp)} vs district · {selected.schools} schools · {selected.nCurr.toLocaleString('en-IN')} student-assessments{selected.participation !== null ? ` · participation ${Math.round(selected.participation * 100)}%` : ''}.
                  {pair?.curr.import_date ? ` Data imported ${fmtDate(pair.curr.import_date)}.` : ''}
                </p>

                <div>
                  <p className="label mb-1.5">Most affected competencies</p>
                  {detail.breakdown.length === 0 ? <p className="text-[12.5px] text-ink-faint">No breakdown available.</p> : (
                    <ul className="space-y-1">
                      {detail.breakdown.slice(0, 5).map((b) => (
                        <li key={`${b.grade}${b.competency_id}`} className="flex items-center gap-2 text-[12.5px]">
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${SEV_META[b.severity as Sev].dot}`} aria-hidden />
                          <span className="flex-1 truncate text-ink-soft">Class {b.grade} · {compName.get(b.competency_id)}</span>
                          <span className="tnum text-ink-faint">{b.prevPct ?? '—'}→{b.currPct ?? '—'}%</span>
                          <span className={`tnum w-16 text-right font-medium ${SEV_META[b.severity as Sev].text}`}>{b.severity === 'insufficient' ? 'n/a' : pp(b.relPp)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="label mb-1.5">Open cases ({selected.openCases}) · overdue tasks {selected.overdueTasks}{detail.blockers ? ` · ${detail.blockers} blockers` : ''}</p>
                  {detail.cases.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-[12.5px] text-ink-soft">
                      No open case here.{['critical', 'significant'].includes(selected.severity) ? ' A clear decline without a case is worth raising at the next review.' : ''}
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {detail.cases.map((c) => (
                        <li key={c.id}>
                          <Link href={`/cases/${c.id}`} className="block rounded-lg border border-line px-3 py-2 hover:border-line-strong hover:bg-paper-sunk">
                            <span className="block truncate text-[13px] font-medium text-ink">{c.id} · {c.title}</span>
                            <span className="mt-1 flex gap-1"><StatusPill status={c.status} lang={lang} /><SeverityPill severity={c.severity} lang={lang} /></span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {selected.severity === 'insufficient' ? (
                  <p className="flex items-start gap-1.5 rounded-lg bg-paper-sunk px-3 py-2 text-[12px] text-ink-soft"><Icon name="alert" size={14} className="mt-0.5 text-warn" />Too little data to judge. This is an unknown, not evidence that learning is fine.</p>
                ) : null}

                <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                  {selected.level !== 'school' ? (
                    <Link href={`/hotspots${qs({ plevel: selected.level, parent: selected.id })}`} className="btn-primary btn-sm"><Icon name="layers" size={14} />Drill into {selected.level}</Link>
                  ) : (
                    <Link href={`/schools/${selected.id}`} className="btn-primary btn-sm"><Icon name="school" size={14} />Open school</Link>
                  )}
                  {selected.level === 'cluster' ? <Link href={`/schools?cluster=${selected.id}`} className="btn-quiet btn-sm">Schools</Link> : null}
                  <Link href={`/cases?status=open&${selected.level === 'block' ? `block=${selected.id}` : selected.level === 'cluster' ? `cluster=${selected.id}` : selected.level === 'district' ? `district=${selected.id}` : `q=`}`} className="btn-quiet btn-sm">Related cases</Link>
                  <Link href={`/complaints?queue=all&q=`} className="btn-quiet btn-sm"><Icon name="inbox" size={14} />Complaints ({detail.complaints})</Link>
                  <Link href={`/reports/new?type=block_performance`} className="btn-quiet btn-sm"><Icon name="file" size={14} />Report</Link>
                </div>
                <p className="text-[11.5px] text-ink-faint">Ask Karyavahi AI about this area — the assistant knows which one you selected.</p>
              </div>
            </section>
          ) : (
            <section className="card p-5 text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-navy-100 text-navy-700"><Icon name="pin" size={19} /></span>
              <p className="mt-3 text-[14px] font-medium text-ink">Select an area</p>
              <p className="mt-1 text-[12.5px] text-ink-soft">Click a tile for its trend, affected competencies, cases and actions. Double-click to drill in.</p>
            </section>
          )}

          <section className="card p-4" aria-label="How severity is decided">
            <p className="text-[13px] font-semibold text-ink">How severity is decided</p>
            <ul className="mt-2 space-y-1.5 text-[12px] leading-snug text-ink-soft">
              {(['critical', 'significant', 'moderate', 'improving', 'stable', 'insufficient'] as Sev[]).map((s) => (
                <li key={s} className="flex items-start gap-2">
                  <span className={`mt-0.5 h-3 w-3 shrink-0 rounded-sm border ${SEV_META[s].tile}`} aria-hidden />
                  <span><strong className="font-medium text-ink">{SEV_META[s].label}</strong>{' — '}{
                    s === 'critical' ? `≤ ${RULES.critical.relPp} pp vs district and z ≤ ${RULES.critical.z}`
                    : s === 'significant' ? `≤ ${RULES.significant.relPp} pp and z ≤ ${RULES.significant.z}`
                    : s === 'moderate' ? `≤ ${RULES.moderate.relPp} pp and z ≤ ${RULES.moderate.z}`
                    : s === 'improving' ? `≥ +${RULES.improving.relPp} pp and z ≥ ${RULES.improving.z}`
                    : s === 'stable' ? 'within normal variation'
                    : `fewer than ${RULES.minAssessed[level]} students assessed per ${level}, or participation < ${RULES.minParticipation * 100}%`
                  }</span>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 border-t border-line pt-2 text-[11.5px] leading-snug text-ink-faint">An area takes the severity of its worst class × competency cell. “vs district” subtracts the district’s own change, which removes seasonal shifts between endline and baseline rounds.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
