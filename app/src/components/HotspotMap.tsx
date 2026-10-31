'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Icon } from './Icon';

/**
 * The hotspot explorer's interactive part: a schematic tile map (and list) of the units one
 * level below the current parent. Tiles are laid out as a grid of the administrative hierarchy
 * — there are no coordinates in the data, so position carries no geographic meaning and the
 * map says so. Everything is URL-driven, so a view can be shared and the back button works.
 */

import { SEV_META, type Sev } from '@/lib/sev';
export type { Sev };

export interface MapUnit {
  id: string; name: string; level: string; severity: Sev; reason: string;
  relPp: number | null; overallRelPp: number | null; prevPct: number | null; currPct: number | null; z: number | null;
  nCurr: number; schools: number; openCases: number; criticalCases: number; overdueTasks: number;
  focusLabel: string | null; canDrill: boolean; hotChildren: number; childLabel: string;
}

const ORDER: Sev[] = ['critical', 'significant', 'moderate', 'stable', 'improving', 'insufficient'];
const pp = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} pp`);

export function HotspotMap({ units, selectedId, levelLabel, childLevel, forceList = false }: { units: MapUnit[]; selectedId: string | null; levelLabel: string; childLevel: string; forceList?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState('');
  const [pending, start] = useTransition();
  const view = forceList || sp.get('view') === 'list' ? 'list' : 'map';
  const sevFilter = new Set((sp.get('sev') ?? '').split(',').filter(Boolean));

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') next.delete(k); else next.set(k, v); }
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const shown = useMemo(() => units.filter((u) =>
    (sevFilter.size === 0 || sevFilter.has(u.severity)) &&
    (!q || u.name.toLowerCase().includes(q.toLowerCase()) || u.id.toLowerCase().includes(q.toLowerCase()))), [units, q, sp]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = ORDER.map((s) => ({ s, n: units.filter((u) => u.severity === s).length }));
  const toggleSev = (s: Sev) => {
    const n = new Set(sevFilter); if (n.has(s)) n.delete(s); else n.add(s);
    set({ sev: [...n].join(',') || null });
  };

  return (
    <div className={pending ? 'opacity-70 transition-opacity' : ''}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Icon name="search" size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find a ${childLevel}…`} aria-label={`Find a ${childLevel}`} className="input h-9 w-52 pl-8 text-[13px]" />
        </div>
        <div className={`inline-flex rounded-lg border border-line-strong bg-white p-0.5 ${forceList ? 'hidden' : ''}`} role="group" aria-label="View">
          {(['map', 'list'] as const).map((v) => (
            <button key={v} type="button" onClick={() => set({ view: v === 'map' ? null : 'list' })} aria-pressed={view === v}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] ${view === v ? 'bg-navy text-white' : 'text-ink-soft hover:text-ink'}`}>
              <Icon name={v === 'map' ? 'grid' : 'list'} size={14} />{v === 'map' ? 'Map' : 'List'}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[12px] text-ink-faint">{shown.length} of {units.length} {levelLabel.toLowerCase()}</span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by severity">
        {counts.map(({ s, n }) => (
          <button key={s} type="button" onClick={() => toggleSev(s)} aria-pressed={sevFilter.has(s)} disabled={n === 0}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors disabled:opacity-40 ${sevFilter.has(s) ? 'border-navy bg-navy text-white' : 'border-line-strong bg-white text-ink-soft hover:border-ink-faint'}`}>
            <span className={`h-2.5 w-2.5 rounded-sm ${SEV_META[s].dot}`} aria-hidden />{SEV_META[s].label}<span className="tnum opacity-70">{n}</span>
          </button>
        ))}
        {sevFilter.size > 0 ? <button type="button" onClick={() => set({ sev: null })} className="px-2 text-[12px] text-brand hover:underline">Clear</button> : null}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-white px-6 py-12 text-center text-[13.5px] text-ink-faint">No {levelLabel.toLowerCase()} match these filters.</div>
      ) : view === 'map' ? (
        <div className="rounded-xl border border-line bg-[radial-gradient(circle_at_1px_1px,#e8e4da_1px,transparent_0)] bg-[length:16px_16px] p-3">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5" aria-label={`${levelLabel} — schematic layout`}>
            {shown.map((u) => {
              const m = SEV_META[u.severity];
              const sel = u.id === selectedId;
              return (
                <li key={u.id}>
                  <button
                    type="button" onClick={() => set({ selected: u.id, level: u.level })}
                    onDoubleClick={() => (u.canDrill ? set({ plevel: u.level, parent: u.id, selected: null, level: null }) : undefined)}
                    title={`${u.name}\n${m.label}: ${u.reason}\nOpen cases ${u.openCases} · Overdue tasks ${u.overdueTasks}${u.canDrill ? '\nDouble-click to drill in' : ''}`}
                    aria-pressed={sel}
                    className={`group relative flex h-[104px] w-full flex-col justify-between overflow-hidden rounded-lg border p-2.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lift ${m.tile} ${sel ? 'ring-4 ring-navy/70 ring-offset-2 ring-offset-ivory' : ''}`}
                  >
                    <span className="line-clamp-2 text-[12.5px] font-semibold leading-tight">{u.name}</span>
                    <span>
                      <span className="tnum block text-[18px] font-semibold leading-none">{u.severity === 'insufficient' ? 'n/a' : pp(u.relPp)}</span>
                      <span className="mt-1 block truncate text-[10.5px] opacity-85">{u.focusLabel ?? (u.severity === 'insufficient' ? 'too few assessed' : 'all grades & competencies')}</span>
                    </span>
                    {u.hotChildren > 0 ? (
                      <span className="absolute bottom-1.5 right-1.5 rounded bg-crit px-1 text-[10px] font-semibold text-white shadow-sm" title={`${u.hotChildren} ${u.childLabel} inside with a critical or significant decline`}>{u.hotChildren} hot {u.childLabel}</span>
                    ) : null}
                    {u.openCases > 0 ? (
                      <span className="absolute right-1.5 top-1.5 rounded bg-white/90 px-1 text-[10px] font-semibold text-ink shadow-sm" title={`${u.openCases} open case(s)`}>{u.openCases} case{u.openCases > 1 ? 's' : ''}</span>
                    ) : null}
                    <span className="sr-only">{m.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
            <Icon name="info" size={13} />Schematic layout of the administrative hierarchy — tile position is not geographic and no school coordinates are shown. Click to select, double-click to drill in.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="table min-w-[720px]">
            <thead><tr><th>{levelLabel.replace(/s$/, '')}</th><th>Severity</th><th className="text-right">Worst cell vs district</th><th className="text-right">Overall vs district</th><th className="text-right">Students</th><th className="text-right">Open cases</th><th className="text-right">Overdue</th><th /></tr></thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id} className={u.id === selectedId ? 'bg-brand-light/50' : ''}>
                  <td><button type="button" onClick={() => set({ selected: u.id, level: u.level })} className="text-left font-medium text-ink hover:text-brand">{u.name}</button><span className="block text-[11.5px] text-ink-faint">{u.focusLabel ?? u.id}{u.hotChildren ? ` · ${u.hotChildren} hot ${u.childLabel} inside` : ''}</span></td>
                  <td><span className={`inline-flex items-center gap-1.5 text-[12.5px] ${SEV_META[u.severity].text}`}><span className={`h-2.5 w-2.5 rounded-sm ${SEV_META[u.severity].dot}`} />{SEV_META[u.severity].label}</span></td>
                  <td className="tnum text-right">{pp(u.relPp)}</td>
                  <td className="tnum text-right text-ink-soft">{pp(u.overallRelPp)}</td>
                  <td className="tnum text-right text-ink-soft">{u.nCurr.toLocaleString('en-IN')}</td>
                  <td className="tnum text-right">{u.openCases}</td>
                  <td className={`tnum text-right ${u.overdueTasks ? 'text-crit' : ''}`}>{u.overdueTasks}</td>
                  <td className="text-right">{u.canDrill ? <button type="button" onClick={() => set({ plevel: u.level, parent: u.id, selected: null, level: null })} className="btn-ghost btn-sm">Drill in<Icon name="chevron-right" size={14} /></button> : <Link href={`/schools/${u.id}`} className="btn-ghost btn-sm">School<Icon name="chevron-right" size={14} /></Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Filter selects that write to the URL. */
export function HotspotFilters({ competencies, rounds }: { competencies: { id: string; label: string }[]; rounds: { id: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v); else next.delete(k);
    next.delete('selected'); next.delete('level');
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const sel = 'h-9 rounded-lg border border-line-strong bg-white px-2.5 text-[13px] text-ink focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="hf-grade">Grade</label>
      <select id="hf-grade" className={sel} value={sp.get('grade') ?? ''} onChange={(e) => set('grade', e.target.value)}>
        <option value="">All classes</option><option value="1">Class 1</option><option value="2">Class 2</option><option value="3">Class 3</option>
      </select>
      <label className="sr-only" htmlFor="hf-subject">Subject</label>
      <select id="hf-subject" className={sel} value={sp.get('subject') ?? ''} onChange={(e) => { set('subject', e.target.value); }}>
        <option value="">Both subjects</option><option value="N">Numeracy</option><option value="L">Literacy</option>
      </select>
      <label className="sr-only" htmlFor="hf-comp">Competency</label>
      <select id="hf-comp" className={sel} value={sp.get('comp') ?? ''} onChange={(e) => set('comp', e.target.value)}>
        <option value="">All competencies</option>
        {competencies.filter((c) => !sp.get('subject') || c.id.startsWith(`CMP-${sp.get('subject')}`)).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <label className="sr-only" htmlFor="hf-round">Assessment round</label>
      <select id="hf-round" className={sel} value={sp.get('round') ?? ''} onChange={(e) => set('round', e.target.value)}>
        <option value="">Latest round</option>
        {rounds.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
      {['grade', 'comp', 'round', 'subject', 'sev'].some((k) => sp.get(k)) ? (
        <button type="button" onClick={() => start(() => router.push(pathname + (sp.get('parent') ? `?plevel=${sp.get('plevel')}&parent=${sp.get('parent')}` : ''), { scroll: false }))} className="btn-ghost btn-sm"><Icon name="refresh" size={14} />Reset filters</button>
      ) : null}
    </div>
  );
}
