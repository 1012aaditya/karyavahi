'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { GeoMap, levelName, type MapPayload } from './GeoMap';
import { SEVERITY_COLORS, severityLabel } from '@/lib/maplayers';
import { Icon } from './Icon';

/**
 * Learning Hotspots — the map-first workspace.
 *
 *   top bar: geographic breadcrumb · place search · blocks/cities · assessment period
 *   map (~70%) with floating toolbar · context panel (~30%) · list view on the same data
 *
 * All navigation inside the workspace updates the URL in place; the panel fetches the selected
 * area's detail from /api/geo/detail, which applies the same scope rule as the map.
 */

type P = Record<string, unknown>;
interface Detail {
  id: string; name: string; level: string; geometry: string; schools: number; compared: string | null; imported: string | null;
  breakdown: { grade: number; competency: string; prev: number | null; curr: number | null; rel: number | null; severity: string; n: number }[];
  cases: { id: string; title: string; severity: string; status: string }[]; caseCount: number; critical: number;
  complaints: { id: string; title: string; status: string; priority: string }[]; complaintCount: number; warnings: string[];
  now: null | {
    enrolment: number; teachers: { sanctioned: number; inPosition: number; short: number }; netTransfersOut: number | null;
    lastVisit: { date: string; role: string; purpose: string; days: number | null } | null;
    attendance: { recent: number | null; before: number | null; change: number | null };
    levels: { teachers: string; visits: string; attendance: string };
    openTasks: number; overdueTasks: number;
  };
}
/** Same colours as the map's "right now" scales; "stable" is fine, shown in green. */
const NOW_DOT: Record<string, string> = { critical: SEVERITY_COLORS.critical, significant: SEVERITY_COLORS.significant, moderate: SEVERITY_COLORS.moderate, stable: SEVERITY_COLORS.improving, insufficient: SEVERITY_COLORS.insufficient };
const pp = (v: unknown) => (v === null || v === undefined ? '—' : `${Number(v) > 0 ? '+' : Number(v) < 0 ? '−' : ''}${Math.abs(Number(v)).toFixed(1)} pp`);
const ORDER = ['critical', 'significant', 'moderate', 'stable', 'improving', 'insufficient'];

/**
 * The map's one-line reason for an area's colour (hotspots.ts classify), in Hindi. Names and
 * figures are carried across; a reason of a shape not listed here stays as written.
 */
function reasonHi(text: string, comp: (en: string) => string): string {
  const one = (r: string): string => {
    let m: RegExpExecArray | null;
    if ((m = /^Worst (block|cluster): (.+?) — (.+)$/.exec(r))) return `सबसे खराब ${m[1] === 'block' ? 'खंड' : 'संकुल'}: ${m[2]} — ${one(m[3])}`;
    if ((m = /^Class (\d) (.+?): (.+?)( \(\+(\d+) more declining\))?$/.exec(r))) return `कक्षा ${m[1]} ${comp(m[2])}: ${one(m[3])}${m[5] ? ` (+${m[5]} और में गिरावट)` : ''}`;
    if ((m = /^([+-]?[\d.]+) pp vs district, z (-?[\d.]+)$/.exec(r))) return `ज़िले की तुलना में ${m[1]} pp, z ${m[2]}`;
    if ((m = /^([+-]?[\d.]+) pp, but not statistically clear \(z (-?[\d.]+)\)$/.exec(r))) return `${m[1]} pp, पर सांख्यिकीय रूप से स्पष्ट नहीं (z ${m[2]})`;
    if ((m = /^Fewer than (\d+) students assessed in one of the rounds$/.exec(r))) return `किसी एक दौर में ${m[1]} से कम विद्यार्थी आकलित`;
    if ((m = /^Participation (\d+)% is below the (\d+)% floor$/.exec(r))) return `भागीदारी ${m[1]}%, न्यूनतम ${m[2]}% से कम`;
    const fixed: Record<string, string> = {
      'No comparable district change': 'ज़िले का तुलनीय बदलाव उपलब्ध नहीं',
      'Within normal variation of the district': 'ज़िले के सामान्य उतार-चढ़ाव के भीतर',
      'Every grade × competency cell has too few students assessed': 'हर कक्षा × दक्षता में आकलित विद्यार्थी बहुत कम',
      'No demo data in this district': 'इस ज़िले में डेमो डेटा नहीं',
      'No assessment data in scope': 'दायरे में आकलन डेटा नहीं',
    };
    return fixed[r] ?? r;
  };
  return one(text);
}

/** The words of the detail panel's warnings (api/geo/detail), in Hindi. */
const WARNING_HI: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^(\d+) class × competency cells? (?:has|have) too few students to judge\.$/, (m) => `${m[1]} कक्षा × दक्षता में आकलन के लिए विद्यार्थी बहुत कम।`],
  [/^Real boundary from OpenStreetMap; the figures inside it are simulated\.$/, () => 'वास्तविक सीमा OpenStreetMap से; अंदर के आँकड़े काल्पनिक हैं।'],
  [/^Simulated boundary drawn inside a real district; not a real boundary\.$/, () => 'वास्तविक ज़िले के भीतर काल्पनिक सीमा; असली सीमा नहीं।'],
  [/^Approximate city area: a circle around the real city centre\.$/, () => 'शहर का अनुमानित क्षेत्र: असली शहर-केंद्र के चारों ओर एक घेरा।'],
  [/^Real school \(UDISE\+\), name withheld; pin moved a few hundred metres\. Its learning results are simulated\.$/, () => 'वास्तविक विद्यालय (UDISE+), नाम छिपा; पिन कुछ सौ मीटर खिसकाया गया। इसके अधिगम परिणाम काल्पनिक हैं।'],
  [/^Boundary is illustrative, not a verified boundary\.$/, () => 'सीमा उदाहरण हेतु है, सत्यापित नहीं।'],
];
const warningHi = (w: string) => { for (const [re, f] of WARNING_HI) { const m = re.exec(w); if (m) return f(m); } return w; };
const PURPOSE_HI: Record<string, string> = { routine: 'नियमित भ्रमण', spot_assessment: 'त्वरित आकलन', coaching: 'शिक्षक सहयोग', spot_check: 'त्वरित जाँच' };

export function HotspotWorkspace({ rounds, competencies, latestLabel, lang = 'en' }: { rounds: { id: string; label: string }[]; competencies: { id: string; label: string; en?: string }[]; latestLabel: string; lang?: 'en' | 'hi' }) {
  const L = (en: string, hi: string) => (lang === 'hi' ? hi : en);
  const hi = lang === 'hi';
  /** A competency's name in the page language, from its id or its English name. */
  const compName = (key: string) => competencies.find((c) => c.id === key || c.en?.toLowerCase() === key.toLowerCase())?.label ?? key;
  const reason = (r: string) => (hi ? reasonHi(r, compName) : r);
  const focusText = (f: string) => { const m = /^Class (\d) (CMP-\w+)$/.exec(f); return hi && m ? `कक्षा ${m[1]} ${compName(m[2])}` : f; };
  const sevLabel = (s: string) => severityLabel(s, lang);
  const sp = useSearchParams();
  const pathname = usePathname();
  const [data, setData] = useState<MapPayload | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; level: string }[]>([]);
  const selId = sp.get('sel');
  const view = sp.get('view') === 'list' ? 'list' : 'map';
  const hierarchy = sp.get('h') === 'urban' ? 'urban' : 'admin';

  const push = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') next.delete(k); else next.set(k, v); }
    const qs = next.toString();
    window.history.pushState(null, '', `${pathname}${qs ? `?${qs}` : ''}`);
  }, [sp, pathname]);

  const features = (data?.features.features ?? []) as { id?: string | number; properties: P }[];
  const selected = features.find((f) => f.properties.id === selId)?.properties ?? null;

  useEffect(() => {
    if (!selId) { setDetail(null); setDetailState('idle'); return; }
    let cancelled = false;
    setDetailState('loading');
    const qs = new URLSearchParams({ id: selId });
    if (hi) qs.set('lang', 'hi');
    for (const k of ['grade', 'round']) { const v = sp.get(k); if (v) qs.set(k, v); }
    fetch(`/api/geo/detail?${qs}`).then(async (r) => {
      if (cancelled) return;
      if (!r.ok) { setDetailState('error'); setDetail(null); return; }
      setDetail(await r.json()); setDetailState('idle');
    }).catch(() => { if (!cancelled) setDetailState('error'); });
    return () => { cancelled = true; };
  }, [selId, sp, hi]);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`); setResults((await r.json()).results ?? []); } catch { setResults([]); }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const crumbs = data?.crumbs ?? [];
  const up = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  // Districts drawn only to complete the state map carry no data; they are not "insufficient".
  const noData = features.filter((f) => Number(f.properties.noData) === 1).length;
  const counts = ORDER.map((s) => ({ s, n: features.filter((f) => f.properties.severity === s && !Number(f.properties.noData)).length }));
  const top = [...features].filter((f) => ['critical', 'significant', 'moderate'].includes(String(f.properties.severity)) || Number(f.properties.hotChildren) > 0)
    .sort((a, b) => ORDER.indexOf(String(a.properties.severity)) - ORDER.indexOf(String(b.properties.severity)) || Number(b.properties.hotChildren) - Number(a.properties.hotChildren)).slice(0, 6);

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label={L('Geographic breadcrumb', 'भौगोलिक क्रम')} className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          {up ? <button type="button" onClick={() => push({ parent: up.id, sel: null })} className="btn-ghost btn-sm" aria-label={L('Back to previous level', 'पिछले स्तर पर वापस')}><Icon name="chevron-left" size={15} /></button> : null}
          {crumbs.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              {i > 0 ? <Icon name="chevron-right" size={13} className="text-ink-faint" /> : null}
              <button type="button" disabled={i === crumbs.length - 1} onClick={() => push({ parent: c.id, sel: null })}
                className={`rounded-md px-2 py-1 ${i === crumbs.length - 1 ? 'font-semibold text-ink' : 'text-ink-soft hover:bg-paper-deep hover:text-ink'}`}>{c.name}</button>
            </span>
          ))}
          {data?.childLevel ? <span className="ml-1 text-xs text-ink-faint">· {levelName(data.childLevel, lang, true)}</span> : null}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Find a place…', 'स्थान खोजें…')} aria-label={L('Find a place', 'स्थान खोजें')} className="input h-9 w-52 pl-8 text-sm" />
            {results.length ? (
              <ul className="absolute right-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-lg border border-line bg-white shadow-pop" role="listbox">
                {results.map((r) => (
                  <li key={r.id}><button type="button" onClick={() => { setQ(''); setResults([]); push(r.level === 'school' ? { sel: r.id } : { parent: r.id, sel: null }); }} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-paper-sunk"><span className="truncate text-ink">{r.name}</span><span className="text-2xs text-ink-faint">{levelName(r.level, lang)}</span></button></li>
                ))}
              </ul>
            ) : null}
          </div>
          {data?.hasUrban ? (
            <div className="inline-flex rounded-lg border border-line-strong bg-white p-0.5" role="group" aria-label={L('Hierarchy', 'पदानुक्रम')}>
              {(['admin', 'urban'] as const).map((h) => (
                <button key={h} type="button" aria-pressed={hierarchy === h} onClick={() => push({ h: h === 'admin' ? null : 'urban', parent: null, sel: null })}
                  className={`rounded-md px-2.5 py-1 text-sm ${hierarchy === h ? 'bg-navy text-white' : 'text-ink-soft hover:text-ink'}`}>{h === 'admin' ? L('Blocks', 'खंड') : L('Cities', 'शहर')}</button>
              ))}
            </div>
          ) : null}
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm text-ink-soft"><Icon name="calendar" size={13} />{data?.compared ?? latestLabel}</span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
        <div>
          <div className={view === 'list' ? 'hidden' : ''}>
            <GeoMap height="max(420px, calc(100vh - 300px))" onData={setData} rounds={rounds} competencies={competencies} lang={lang} />
          </div>
          {view === 'list' ? (
            <div className="overflow-hidden rounded-xl border border-line bg-white">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <p className="text-sm font-medium text-ink">{features.length} {data?.childLevel ? levelName(data.childLevel, lang, true) : L('areas', 'क्षेत्र')}</p>
                <button type="button" onClick={() => push({ view: null })} className="btn-quiet btn-sm"><Icon name="map" size={14} />{L('Map', 'नक्शा')}</button>
              </div>
              <div className="overflow-x-auto">
                <table className="table min-w-[720px]">
                  <thead><tr><th>{L('Area', 'क्षेत्र')}</th><th>{L('Learning status', 'अधिगम स्थिति')}</th><th className="text-right">{L('vs district', 'ज़िले की तुलना में')}</th><th className="text-right">{L('Cases', 'प्रकरण')}</th><th className="text-right">{L('Complaints', 'शिकायतें')}</th><th className="text-right">{L('Overdue', 'विलंबित')}</th><th /></tr></thead>
                  <tbody>
                    {[...features].sort((a, b) => ORDER.indexOf(String(a.properties.severity)) - ORDER.indexOf(String(b.properties.severity))).map((f) => {
                      const p = f.properties;
                      return (
                        <tr key={String(p.id)} className={p.id === selId ? 'bg-brand-light/50' : ''}>
                          <td><button type="button" onClick={() => push({ sel: String(p.id) })} className="text-left font-medium text-ink hover:text-brand">{String(p.name)}</button>{Number(p.hotChildren) ? <span className="block text-xs text-crit">{L(`${String(p.hotChildren)} hot sub-areas`, `${String(p.hotChildren)} अंदरूनी हॉटस्पॉट`)}</span> : null}</td>
                          <td><span className="inline-flex items-center gap-1.5 text-sm"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SEVERITY_COLORS[String(p.severity)] }} />{sevLabel(String(p.severity))}</span></td>
                          <td className="tnum text-right">{p.severity === 'insufficient' ? L('n/a', '—') : pp(p.relPp)}</td>
                          <td className="tnum text-right">{String(p.openCases)}</td>
                          <td className="tnum text-right">{String(p.complaints)}</td>
                          <td className={`tnum text-right ${Number(p.overdue) ? 'text-crit' : ''}`}>{String(p.overdue)}</td>
                          <td className="text-right">{Number(p.canDrill) ? <button type="button" onClick={() => push({ parent: String(p.id), sel: null })} className="btn-ghost btn-sm">{L('Zoom in', 'अंदर देखें')}<Icon name="chevron-right" size={13} /></button> : <Link href={`/schools/${String(p.id)}`} className="btn-ghost btn-sm">{L('School', 'विद्यालय')}<Icon name="chevron-right" size={13} /></Link>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        {/* Context panel */}
        <aside className="overflow-hidden rounded-xl border border-line bg-white xl:max-h-[max(420px,calc(100vh-300px))] xl:overflow-y-auto" aria-label={L('Area details', 'क्षेत्र का विवरण')}>
          {!selected && !detail ? (
            <div>
              <div className="border-b border-line px-5 py-4">
                <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint">{data?.parent.level ? levelName(data.parent.level, lang) : L('Area', 'क्षेत्र')}</p>
                <h2 className="text-lg font-semibold tracking-tight text-ink">{data?.parent.name ?? '…'}</h2>
                <p className="mt-0.5 text-sm text-ink-faint">{features.length} {data?.childLevel ? levelName(data.childLevel, lang, true) : L('areas', 'क्षेत्र')}{noData ? L(` · ${features.length - noData} with demo data`, ` · ${features.length - noData} में डेमो डेटा`) : ''} · {L('select one on the map', 'नक्शे पर कोई एक चुनें')}</p>
              </div>
              <ul className="grid grid-cols-3 gap-px border-b border-line bg-line text-center">
                {counts.map((c) => (
                  <li key={c.s} className="bg-white px-2 py-2.5"><p className="tnum text-lg font-semibold text-ink">{c.n}</p><p className="flex items-center justify-center gap-1 text-2xs text-ink-faint"><span className="h-2 w-2 rounded-sm" style={{ background: SEVERITY_COLORS[c.s] }} />{sevLabel(c.s)}</p></li>
                ))}
              </ul>
              <div className="px-5 py-4">
                <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint">{L('Most important hotspots', 'सबसे अहम हॉटस्पॉट')}</p>
                {top.length === 0 ? <p className="mt-2 text-sm text-ink-soft">{L('No statistically clear declines at this level.', 'इस स्तर पर सांख्यिकीय रूप से स्पष्ट कोई गिरावट नहीं।')}</p> : (
                  <ul className="mt-2 divide-y divide-line">
                    {top.map((f) => (
                      <li key={String(f.properties.id)}>
                        <button type="button" onClick={() => push({ sel: String(f.properties.id) })} className="flex w-full items-center gap-2.5 py-2 text-left hover:text-brand">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SEVERITY_COLORS[String(f.properties.severity)] }} />
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{String(f.properties.name)}</span><span className="block truncate text-xs text-ink-faint">{f.properties.focus ? focusText(String(f.properties.focus)) : sevLabel(String(f.properties.severity))}{Number(f.properties.hotChildren) ? L(` · ${String(f.properties.hotChildren)} hot inside`, ` · अंदर ${String(f.properties.hotChildren)} हॉटस्पॉट`) : ''}</span></span>
                          <span className="tnum text-sm font-semibold text-ink">{pp(f.properties.relPp)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-2 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint">{selected?.level ?? detail?.level ? levelName(String(selected?.level ?? detail?.level), lang) : ''}</p>
                  <h2 className="truncate text-lg font-semibold tracking-tight text-ink">{String(selected?.name ?? detail?.name ?? '')}</h2>
                  {selected ? <p className="mt-1 flex items-center gap-1.5 text-sm text-ink"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SEVERITY_COLORS[String(selected.severity)] }} />{sevLabel(String(selected.severity))}{selected.severity !== 'insufficient' ? <span className="text-ink-soft">· {L(`${pp(selected.relPp)} vs district`, `ज़िले की तुलना में ${pp(selected.relPp)}`)}</span> : null}</p> : null}
                </div>
                <button type="button" onClick={() => push({ sel: null })} className="btn-ghost btn-sm px-1.5" aria-label={L('Close details', 'विवरण बंद करें')}><Icon name="x" size={16} /></button>
              </div>
              {selected?.reason ? <p className="border-b border-line px-5 py-2.5 text-sm text-ink-soft">{reason(String(selected.reason))}</p> : null}
              <dl className="grid grid-cols-2 gap-px border-b border-line bg-line">
                {[
                  [L('Schools', 'विद्यालय'), detail?.schools ?? (selected?.schools as number) ?? '—'],
                  [L('Open cases', 'खुले प्रकरण'), detail?.caseCount ?? selected?.openCases ?? '—'],
                  [L('Complaints', 'शिकायतें'), detail?.complaintCount ?? selected?.complaints ?? '—'],
                  [L('Overdue work', 'विलंबित काम'), selected?.overdue ?? '—'],
                ].map(([k, v]) => <div key={String(k)} className="bg-white px-4 py-2.5"><dt className="text-xs text-ink-faint">{String(k)}</dt><dd className="tnum text-md font-semibold text-ink">{String(v)}</dd></div>)}
              </dl>
              {detailState === 'loading' ? <div className="space-y-2 px-5 py-4"><div className="skeleton h-3 w-32" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-5/6" /></div> : null}
              {detailState === 'error' ? <p className="px-5 py-4 text-sm text-crit">{L('Could not load details for this area.', 'इस क्षेत्र का विवरण लोड नहीं हो सका।')}</p> : null}
              {detail ? (
                <div className="space-y-4 px-5 py-4">
                  {detail.now ? (
                    <div>
                      <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint">{L('Right now', 'अभी की स्थिति')}</p>
                      <ul className="mt-1.5 space-y-1.5 text-sm">
                        <li className="flex items-start gap-2">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: NOW_DOT[detail.now.levels.teachers] }} />
                          <span className="text-ink-soft"><span className="font-medium text-ink">{L(`Teachers ${detail.now.teachers.inPosition} of ${detail.now.teachers.sanctioned}`, `शिक्षक: ${detail.now.teachers.sanctioned} में से ${detail.now.teachers.inPosition}`)}</span>
                            {detail.now.teachers.short ? L(` · ${detail.now.teachers.short} post${detail.now.teachers.short > 1 ? 's' : ''} empty`, ` · ${detail.now.teachers.short} पद खाली`) : L(' · all posts filled', ' · सभी पद भरे')}
                            {detail.now.netTransfersOut ? L(` · ${detail.now.netTransfersOut} left in the last 6 months`, ` · पिछले 6 महीनों में ${detail.now.netTransfersOut} गए`) : ''}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: NOW_DOT[detail.now.levels.visits] }} />
                          <span className="text-ink-soft">{detail.now.lastVisit
                            ? <><span className="font-medium text-ink">{L(`Last visit ${detail.now.lastVisit.days} days ago`, `पिछला भ्रमण ${detail.now.lastVisit.days} दिन पहले`)}</span> · {detail.now.lastVisit.role.toUpperCase()}, {hi ? PURPOSE_HI[detail.now.lastVisit.purpose] ?? detail.now.lastVisit.purpose.replace(/_/g, ' ') : detail.now.lastVisit.purpose.replace(/_/g, ' ')}</>
                            : <span className="font-medium text-ink">{L('Never visited', 'कभी भ्रमण नहीं')}</span>}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: NOW_DOT[detail.now.levels.attendance] }} />
                          <span className="text-ink-soft">{detail.now.attendance.change === null
                            ? <span className="font-medium text-ink">{L('Attendance: not enough months', 'उपस्थिति: पर्याप्त महीने नहीं')}</span>
                            : <><span className="font-medium text-ink">{L('Attendance', 'उपस्थिति')} {detail.now.attendance.recent}%</span> · {detail.now.attendance.change > 0 ? '+' : ''}{detail.now.attendance.change} {L('pts on the 3 months before', 'अंक, पिछले 3 महीनों की तुलना में')}</>}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${detail.now.overdueTasks ? 'bg-crit' : 'bg-line-strong'}`} />
                          <span className="text-ink-soft"><span className="font-medium text-ink">{L(`${detail.now.openTasks} open task${detail.now.openTasks === 1 ? '' : 's'}`, `${detail.now.openTasks} खुले काम`)}</span>{detail.now.overdueTasks ? L(` · ${detail.now.overdueTasks} overdue`, ` · ${detail.now.overdueTasks} विलंबित`) : ''} · {L(`${detail.now.enrolment} children in classes 1–3`, `कक्षा 1–3 में ${detail.now.enrolment} बच्चे`)}</span>
                        </li>
                      </ul>
                    </div>
                  ) : null}
                  {detail.breakdown.length ? (
                    <div>
                      <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint">{L('Most affected competencies', 'सबसे प्रभावित दक्षताएँ')}</p>
                      <ul className="mt-1.5 space-y-1">
                        {detail.breakdown.map((b) => (
                          <li key={`${b.grade}${b.competency}`} className="flex items-center gap-2 text-sm">
                            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: SEVERITY_COLORS[b.severity] }} />
                            <span className="min-w-0 flex-1 truncate text-ink-soft">{L('Class', 'कक्षा')} {b.grade} · {compName(b.competency)}</span>
                            <span className="tnum text-ink-faint">{b.prev ?? '—'}→{b.curr ?? '—'}%</span>
                            <span className="tnum w-14 text-right font-medium text-ink">{b.severity === 'insufficient' ? L('n/a', '—') : pp(b.rel)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {detail.cases.length ? (
                    <div>
                      <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint">{L('Open cases', 'खुले प्रकरण')}</p>
                      <ul className="mt-1 divide-y divide-line">{detail.cases.map((c) => <li key={c.id}><Link href={`/cases/${c.id}`} className="block py-1.5 text-sm text-ink hover:text-brand"><span className="font-mono text-xs text-ink-faint">{c.id}</span> {c.title}</Link></li>)}</ul>
                    </div>
                  ) : null}
                  {detail.complaints.length ? (
                    <div>
                      <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint">{L('Open complaints', 'खुली शिकायतें')}</p>
                      <ul className="mt-1 divide-y divide-line">{detail.complaints.map((c) => <li key={c.id}><Link href={`/complaints?open=${c.id}`} className="block py-1.5 text-sm text-ink hover:text-brand"><span className="font-mono text-xs text-ink-faint">{c.id}</span> {c.title}</Link></li>)}</ul>
                    </div>
                  ) : null}
                  <div className="rounded-lg bg-paper-sunk px-3 py-2 text-xs text-ink-soft">
                    <p>{L('Data:', 'डेटा:')} {detail.compared ?? '—'}{detail.imported ? ` · ${L('imported', 'आयात')} ${new Date(detail.imported).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}</p>
                    {detail.warnings.map((w) => <p key={w} className="mt-0.5 flex items-start gap-1 text-warn"><Icon name="alert" size={12} className="mt-0.5" />{hi ? warningHi(w) : w}</p>)}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Number(selected?.canDrill ?? 0) ? <button type="button" onClick={() => push({ parent: String(selected!.id), sel: null })} className="btn-primary btn-sm"><Icon name="layers" size={14} />{L('Zoom in', 'अंदर देखें')}</button> : null}
                    {detail.level === 'school' ? <Link href={`/schools/${detail.id}`} className="btn-primary btn-sm"><Icon name="school" size={14} />{L('Open school', 'विद्यालय खोलें')}</Link> : null}
                    {['cluster', 'block'].includes(detail.level) ? <Link href={`/schools?${detail.level}=${detail.id}`} className="btn-quiet btn-sm">{L('View schools', 'विद्यालय देखें')}</Link> : null}
                    <Link href={`/cases?status=open&${detail.level === 'block' ? `block=${detail.id}` : detail.level === 'cluster' ? `cluster=${detail.id}` : detail.level === 'district' ? `district=${detail.id}` : ''}`} className="btn-quiet btn-sm">{L('View cases', 'प्रकरण देखें')}</Link>
                    <Link href={`/reports/new?type=block_performance`} className="btn-quiet btn-sm">{L('Report', 'रिपोर्ट')}</Link>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
