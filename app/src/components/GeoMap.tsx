'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as MLMap, Marker, MapLayerMouseEvent, ExpressionSpecification } from 'maplibre-gl';
import { SEVERITY_COLORS, severityLabel } from '@/lib/maplayers';
import { PALETTE } from '@/lib/tokens';
import { Icon } from './Icon';
import { loadGoogleMaps, onKeyRefused, GoogleMapView, type Refusal } from './google-map-view';
import type { FeatureCollection, Feature } from 'geojson';

/**
 * The interactive geographic map (MapLibre GL JS), in two modes:
 *
 *   compact   — a preview on dashboards; clicking opens the hotspot workspace or a school record.
 *   workspace — the map-first hotspot page: floating toolbar (layers, filters, legend, reset,
 *               map/list), independently selectable layers, URL state via the history API so
 *               selecting or drilling in never reloads the page.
 *
 * Every shape comes from /api/geo/map, which returns only the user's permitted geography. Labels
 * are HTML markers (no glyph server needed). Where Google Maps would draw (the hotspot workspace,
 * and maps asking for basemap 'auto') but has no key or refuses it, a free OpenStreetMap street
 * layer (OpenFreeMap, no key, no quota) goes underneath; the small dashboard maps stay plain to
 * save data. If the street style cannot be fetched (offline, or the service is down) the map is
 * the plain one, as before.
 */

const PLAIN_STYLE = { version: 8 as const, sources: {}, layers: [{ id: 'bg', type: 'background' as const, paint: { 'background-color': PALETTE.map.DEFAULT } }] };
const STREET_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
let streetStyle: Promise<import('maplibre-gl').StyleSpecification | null> | null = null;
/** The street style, fetched once per page load; null when it cannot be had within a few seconds. */
function loadStreetStyle(): Promise<import('maplibre-gl').StyleSpecification | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(null);
  streetStyle ??= (async () => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    try {
      const r = await fetch(STREET_STYLE_URL, { signal: ctl.signal });
      return r.ok ? ((await r.json()) as import('maplibre-gl').StyleSpecification) : null;
    } catch { return null; } finally { clearTimeout(t); }
  })();
  return streetStyle.then((s) => { if (!s) streetStyle = null; return s; });
}

export interface MapPayload {
  parent: { id: string; name: string; level: string; bbox: number[] | null; geometry_source: string; note: string | null };
  childLevel: string | null;
  crumbs: { id: string; name: string; level: string }[];
  hierarchy: 'admin' | 'urban';
  hasUrban: boolean;
  features: FeatureCollection;
  outline: Feature | null;
  compared: string | null;
  sources: { geometry: string; attribution: string };
}

/** Status classes (which areas are coloured) and overlays (count badges on labels). */
export const STATUS_LAYERS = [
  { key: 'critical', label: 'Critical hotspots', hi: 'गंभीर हॉटस्पॉट', sev: ['critical'], color: SEVERITY_COLORS.critical },
  { key: 'decline', label: 'Learning decline', hi: 'अधिगम में गिरावट', sev: ['significant', 'moderate'], color: SEVERITY_COLORS.significant },
  { key: 'stable', label: 'Stable areas', hi: 'स्थिर क्षेत्र', sev: ['stable'], color: SEVERITY_COLORS.stable },
  { key: 'improving', label: 'Improving areas', hi: 'सुधरते क्षेत्र', sev: ['improving'], color: SEVERITY_COLORS.improving },
] as const;
export const OVERLAYS = [
  { key: 'complaints', label: 'Open complaints', hi: 'खुली शिकायतें', prop: 'complaints', icon: 'inbox', cls: 'bg-pend text-white' },
  { key: 'overdue', label: 'Overdue actions', hi: 'विलंबित काम', prop: 'overdue', icon: 'clock', cls: 'bg-amber text-ink' },
  { key: 'cases', label: 'Active cases', hi: 'सक्रिय प्रकरण', prop: 'openCases', icon: 'briefcase', cls: 'bg-navy text-white' },
] as const;
/** The one-letter badge of an overlay; in Hindi, the first letter of its Hindi word. */
const badgeLetter = (key: string, lang: 'en' | 'hi') => (lang === 'hi'
  ? (key === 'complaints' ? 'शि' : key === 'overdue' ? 'वि' : 'प्र')
  : (key === 'complaints' ? 'C' : key === 'overdue' ? 'O' : 'A'));
const DEFAULT_LAYERS = ['critical', 'decline', 'stable', 'improving'];

/**
 * What the areas and school dots are coloured by. Learning change is the hotspot measure; the
 * other three show each school's situation right now (from school-now.ts on the server), and a
 * larger area by the share of its schools in a serious condition.
 */
export const COLOUR_BY = [
  { key: 'learning', prop: 'severity', label: 'Learning change', hint: 'Against the district, between two assessment rounds.', hi: 'अधिगम में बदलाव', hintHi: 'दो आकलन दौरों के बीच, ज़िले की तुलना में।' },
  { key: 'teachers', prop: 'teacherLevel', label: 'Teacher shortage', hint: 'Sanctioned posts not filled, or a teacher who left without a replacement.', hi: 'शिक्षकों की कमी', hintHi: 'स्वीकृत पद खाली, या कोई शिक्षक गया और उसकी जगह कोई नहीं आया।' },
  { key: 'visits', prop: 'visitLevel', label: 'Visit gaps', hint: 'Days since anyone from the cluster or block visited.', hi: 'भ्रमण में अंतराल', hintHi: 'संकुल या खंड से आखिरी भ्रमण के बाद बीते दिन।' },
  { key: 'attendance', prop: 'attendanceLevel', label: 'Attendance trend', hint: 'Average attendance in the last 3 months against the 3 before.', hi: 'उपस्थिति का रुझान', hintHi: 'पिछले 3 महीनों की औसत उपस्थिति, उससे पहले के 3 महीनों से तुलना।' },
] as const;
export type ColourBy = (typeof COLOUR_BY)[number]['key'];
/** The four steps of the "right now" scales, worst first, with what each means for one school. */
const NOW_STEPS: Record<Exclude<ColourBy, 'learning'>, [string, string, string][]> = {
  teachers: [['critical', '2+ posts empty, or half', '2+ पद खाली, या आधे'], ['significant', '1 post empty', '1 पद खाली'], ['moderate', 'A teacher left, not replaced', 'शिक्षक गया, जगह खाली'], ['stable', 'Fully staffed', 'पूरा स्टाफ़']],
  visits: [['critical', 'Over 90 days, or never', '90 दिन से अधिक, या कभी नहीं'], ['significant', '61–90 days', '61–90 दिन'], ['moderate', '31–60 days', '31–60 दिन'], ['stable', '30 days or less', '30 दिन या कम']],
  attendance: [['critical', 'Down 10+ points', '10+ अंक नीचे'], ['significant', 'Down 5–10 points', '5–10 अंक नीचे'], ['moderate', 'Down 2–5 points', '2–5 अंक नीचे'], ['stable', 'Steady or rising', 'स्थिर या बढ़ती']],
};
/** "Fine" reads better in green than in the grey the learning scale uses for "stable". */
const NOW_COLOUR: Record<string, string> = {
  critical: SEVERITY_COLORS.critical, significant: SEVERITY_COLORS.significant, moderate: SEVERITY_COLORS.moderate,
  stable: SEVERITY_COLORS.improving, insufficient: SEVERITY_COLORS.insufficient,
};

const propOf = (by: ColourBy) => COLOUR_BY.find((c) => c.key === by)!.prop;

/** The colour of one area or school, the same rule for both map engines. */
function colourOf(p: Record<string, unknown>, active: Set<string>, by: ColourBy): string {
  if (Number(p.noData)) return PALETTE.map.muted;
  if (by !== 'learning') return NOW_COLOUR[String(p[propOf(by)])] ?? PALETTE.map.muted;
  const sev = String(p.severity);
  if (sev === 'insufficient') return SEVERITY_COLORS.insufficient;
  const layer = STATUS_LAYERS.find((l) => (l.sev as readonly string[]).includes(sev));
  return layer && active.has(layer.key) ? SEVERITY_COLORS[sev] : PALETTE.map.muted;
}

function fillExpr(active: Set<string>, by: ColourBy = 'learning'): ExpressionSpecification {
  const pairs: string[] = [];
  if (by !== 'learning') {
    for (const [k, c] of Object.entries(NOW_COLOUR)) pairs.push(k, c);
    return ['case', ['==', ['get', 'noData'], 1], PALETTE.map.muted, ['match', ['get', propOf(by)], ...pairs, PALETTE.map.muted]] as unknown as ExpressionSpecification;
  }
  for (const s of STATUS_LAYERS) for (const sev of s.sev) pairs.push(sev, active.has(s.key) ? SEVERITY_COLORS[sev] : PALETTE.map.muted);
  return ['case', ['==', ['get', 'noData'], 1], PALETTE.map.muted,
    ['match', ['get', 'severity'], ...pairs, 'insufficient', SEVERITY_COLORS.insufficient, PALETTE.map.muted]] as unknown as ExpressionSpecification;
}

/** The figure written on an area or beside a school for the current colouring. */
function figureOf(p: Record<string, unknown>, by: ColourBy, isPoint: boolean, lang: 'en' | 'hi' = 'en'): string {
  const hi = lang === 'hi';
  if (by === 'learning') {
    const hot = Number(p.hotChildren ?? 0);
    return p.severity === 'insufficient' ? (hi ? 'अपर्याप्त डेटा' : 'insufficient data') : `${pp(p.relPp)}${hot ? (hi ? ` · ${hot} हॉट` : ` · ${hot} hot`) : ''}`;
  }
  if (isPoint) {
    if (by === 'teachers') return Number(p.teachersShort) > 0 ? (hi ? `${p.teachersShort} पद खाली` : `${p.teachersShort} post${Number(p.teachersShort) > 1 ? 's' : ''} empty`) : Number(p.netTransfersOut) > 0 ? (hi ? 'शिक्षक गया' : 'teacher left') : (hi ? 'पूरा स्टाफ़' : 'staffed');
    if (by === 'visits') return p.daysSinceVisit === null || p.daysSinceVisit === undefined ? (hi ? 'कभी भ्रमण नहीं' : 'never visited') : `${p.daysSinceVisit} ${hi ? 'दिन' : 'days'}`;
    return p.attChange === null || p.attChange === undefined ? (hi ? 'डेटा नहीं' : 'no data') : `${Number(p.attChange) > 0 ? '+' : ''}${Number(p.attChange).toFixed(1)} ${hi ? 'अंक' : 'pts'}`;
  }
  const n = by === 'teachers' ? p.schoolsShort : by === 'visits' ? p.schoolsUnvisited : p.schoolsAttendanceDown;
  if (p.schoolsCounted === undefined) return '';
  return hi ? `${Number(p.schoolsCounted)} में से ${Number(n ?? 0)} विद्यालय` : `${Number(n ?? 0)} of ${Number(p.schoolsCounted)} schools`;
}

/** A label element: name (when there is room), the figure, and any overlay badges. */
function labelEl(p: Record<string, unknown>, o: { isPoint: boolean; isSel: boolean; many: boolean; by: ColourBy; layers: Set<string>; lang?: 'en' | 'hi' }): HTMLElement | null {
  const lang = o.lang ?? 'en';
  if (Number(p.noData)) return null;
  const el = document.createElement('div');
  el.className = `pointer-events-none select-none rounded-md text-center leading-tight ${o.isSel ? 'bg-navy text-white shadow' : 'bg-white/90 text-ink'}`;
  el.style.cssText += `font-size:${o.isPoint && !o.isSel ? 10 : 11}px;padding:${o.isPoint && !o.isSel ? '0 4px' : '2px 6px'};`;
  if (!o.many || o.isSel) { const n = document.createElement('div'); n.style.fontWeight = '600'; n.textContent = String(p.name); el.appendChild(n); }
  const v = document.createElement('div');
  v.style.fontVariantNumeric = 'tabular-nums';
  v.textContent = figureOf(p, o.by, o.isPoint, lang);
  if (v.textContent) el.appendChild(v);
  const badges = OVERLAYS.filter((b) => o.layers.has(b.key) && Number(p[b.prop] ?? 0) > 0);
  if (badges.length) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:3px;justify-content:center;margin-top:2px';
    for (const b of badges) {
      const s = document.createElement('span');
      s.className = `${b.cls} rounded-full`;
      s.style.cssText = 'font-size:10px;padding:0 5px;font-weight:600';
      s.textContent = `${badgeLetter(b.key, lang)} ${Number(p[b.prop])}`;
      s.title = `${Number(p[b.prop])} ${lang === 'hi' ? b.hi : b.label.toLowerCase()}`;
      row.appendChild(s);
    }
    el.appendChild(row);
  }
  return el;
}

/** School dots grow with the number of children in classes 1–3. */
const dotSize = (p: Record<string, unknown>) => Math.round(10 + Math.min(10, Math.sqrt(Number(p.enrolment ?? 0)) / 2));

function hatchImage(): { width: number; height: number; data: Uint8Array } {
  const w = 12, h = 12, data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const on = (x + y) % 6 === 0 || (x + y) % 6 === 1;
    const i = (y * w + x) * 4;
    data[i] = 69; data[i + 1] = 82; data[i + 2] = 106; data[i + 3] = on ? 150 : 0;
  }
  return { width: w, height: h, data };
}

export const LEVEL_NAME: Record<string, string> = { state: 'State', district: 'District', city: 'City', block: 'Block', cluster: 'Cluster', school: 'School' };
export const LEVEL_NAME_HI: Record<string, string> = { state: 'राज्य', district: 'ज़िला', city: 'शहर', block: 'खंड', cluster: 'संकुल', school: 'विद्यालय' };
/** A level's name, one or many, in the page language. */
export const levelName = (level: string, lang: 'en' | 'hi' = 'en', many = false): string => {
  if (lang === 'hi') return many && level === 'district' ? 'ज़िले' : LEVEL_NAME_HI[level] ?? level;
  const n = LEVEL_NAME[level] ?? level;
  return many ? `${n}s` : n;
};
const pp = (v: unknown) => (v === null || v === undefined ? '—' : `${Number(v) > 0 ? '+' : Number(v) < 0 ? '−' : ''}${Math.abs(Number(v)).toFixed(1)} pp`);

function Popover({ label, icon, children, open, setOpen }: { label: string; icon: string; children: React.ReactNode; open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium ${open ? 'bg-navy text-white' : 'text-ink-soft hover:bg-paper-deep hover:text-ink'}`}>
        <Icon name={icon} size={14} /><span className="sr-only sm:not-sr-only">{label}</span>
      </button>
      {open ? <div className="absolute left-0 top-full z-30 mt-1.5 w-64 animate-fade-in rounded-xl border border-line bg-white p-3 shadow-pop">{children}</div> : null}
    </div>
  );
}

export function GeoMap({ height = 560, compact = false, selectedId: selectedProp = null, basePath = '/hotspots', onData, rounds = [], competencies = [], lang = 'en', basemap = 'plain', bare = false, reserve }: {
  height?: number | string; compact?: boolean; selectedId?: string | null; basePath?: string;
  onData?: (d: MapPayload | null) => void; rounds?: { id: string; label: string }[]; competencies?: { id: string; label: string }[];
  /** The map's own words (legend, tools, labels, loading, footnote) follow this. */
  lang?: 'en' | 'hi';
  /** 'auto' draws a compact map on Google Maps too, when a key is set (the home page does). */
  basemap?: 'auto' | 'plain';
  /** Leave out the legend row under a compact map; the page shows its own. */
  bare?: boolean;
  /** Room taken by cards floating over the map, so fitting the area keeps it in the clear part.
   *  `right` only applies when the map is wide (the cards move below it on small screens). */
  reserve?: { top?: number; right?: number };
}) {
  const L = (en: string, hi: string) => (lang === 'hi' ? hi : en);
  const fitPadding = () => {
    const base = compact ? 24 : 56;
    const wide = (box.current?.clientWidth ?? 0) >= 900;
    return { top: base + (reserve?.top ?? 0), bottom: base, left: base, right: base + (wide ? reserve?.right ?? 0 : 0) };
  };
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const libRef = useRef<typeof import('maplibre-gl') | null>(null);
  const [data, setData] = useState<MapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; p: Record<string, unknown> } | null>(null);
  const [pop, setPop] = useState<'layers' | 'filters' | null>(null);
  const [legend, setLegend] = useState(!compact);

  const workspace = !compact;
  // The hotspot workspace draws on Google Maps when a browser key is configured; otherwise on
  // MapLibre over the OpenStreetMap street layer. The small dashboard maps use MapLibre with no tiles.
  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  // If Google refuses the key, the page falls back to the plain map and says why.
  const [googleRefused, setGoogleRefused] = useState<Refusal | null>(null);
  const useGoogle = (workspace || basemap === 'auto') && googleKey.length > 0 && !googleRefused;
  // Whether the OpenStreetMap street layer is drawn under the MapLibre map.
  const [streetsOn, setStreetsOn] = useState(false);
  const gview = useRef<GoogleMapView | null>(null);
  const byParam = sp.get('by');
  const by: ColourBy = workspace && COLOUR_BY.some((c) => c.key === byParam) ? (byParam as ColourBy) : 'learning';
  const parent = sp.get('parent') ?? '';
  const hierarchy = sp.get('h') === 'urban' ? 'urban' : 'admin';
  const selectedId = workspace ? sp.get('sel') ?? selectedProp : selectedProp;
  const layers = new Set((sp.get('layers') ?? DEFAULT_LAYERS.join(',')).split(',').filter(Boolean));
  const layersKey = [...layers].sort().join(',');
  const filterKey = ['grade', 'comp', 'subject', 'round'].map((k) => `${k}=${sp.get(k) ?? ''}`).join('&');

  /** Workspace: update the URL in place (no server round-trip). Compact: navigate to the workspace. */
  const push = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(compact ? '' : sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') next.delete(k); else next.set(k, v); }
    const qs = next.toString();
    if (compact) router.push(`${basePath}${qs ? `?${qs}` : ''}`);
    else window.history.pushState(null, '', `${pathname}${qs ? `?${qs}` : ''}`);
  }, [sp, router, pathname, compact, basePath]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams();
      if (parent && workspace) qs.set('parent', parent);
      if (hierarchy === 'urban' && workspace) qs.set('h', 'urban');
      if (workspace) for (const k of ['grade', 'comp', 'subject', 'round']) { const v = sp.get(k); if (v) qs.set(k, v); }
      const r = await fetch(`/api/geo/map?${qs}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) { setError(lang === 'hi' ? 'नक्शा लोड नहीं हो सका।' : j.error ?? 'The map could not be loaded.'); setData(null); onData?.(null); return; }
      setData(j); onData?.(j);
    } catch {
      setError(L('Could not reach the server for map data.', 'नक्शे के डेटा के लिए सर्वर तक नहीं पहुँच सके।'));
    } finally { setLoading(false); }
  }, [parent, hierarchy, filterKey, workspace]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);

  // ---- map init (MapLibre)
  useEffect(() => {
    if (useGoogle) return undefined;
    // Coming back from a refused Google map: start from an empty container.
    if (box.current) box.current.innerHTML = '';
    setReady(false);
    let cancelled = false;
    (async () => {
      try {
        const [lib, street] = await Promise.all([import('maplibre-gl'), workspace || basemap === 'auto' ? loadStreetStyle() : Promise.resolve(null)]);
        if (cancelled || !box.current) return;
        libRef.current = lib;
        setStreetsOn(street !== null);
        // On the street map the areas are a little more see-through, so roads and towns show beneath.
        const op = street ? { fill: 0.62, hover: 0.8, outline: 0.2 } : { fill: 0.85, hover: 0.96, outline: 0.55 };
        const map = new lib.Map({
          container: box.current,
          style: street ?? PLAIN_STYLE,
          center: [0, 0], zoom: 6, attributionControl: false, doubleClickZoom: false, dragRotate: false, pitchWithRotate: false,
          // The map's own controls speak the page language.
          ...(lang === 'hi' ? { locale: {
            'Map.Title': 'नक्शा', 'Marker.Title': 'नक्शे पर निशान', 'NavigationControl.ZoomIn': 'पास से देखें', 'NavigationControl.ZoomOut': 'दूर से देखें',
            'AttributionControl.ToggleAttribution': 'श्रेय दिखाएँ/छिपाएँ', 'AttributionControl.MapFeedback': 'नक्शे पर प्रतिक्रिया', 'Popup.Close': 'बंद करें',
            'CooperativeGesturesHandler.MobileHelpText': 'नक्शा हिलाने के लिए दो उँगलियाँ लगाएँ',
          } } : {}),
        });
        map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
        map.addControl(new lib.AttributionControl({ compact: true, customAttribution: 'MapLibre' }), 'bottom-right');
        map.touchZoomRotate.disableRotation();
        map.on('error', (e) => { if (String(e?.error?.message ?? '').includes('WebGL')) setMapError(L('This browser cannot draw the interactive map (WebGL unavailable).', 'यह ब्राउज़र इंटरैक्टिव नक्शा नहीं बना सकता (WebGL उपलब्ध नहीं)।')); });
        map.on('load', () => {
          if (cancelled) return;
          map.addImage('hatch', hatchImage());
          map.addSource('outline', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addSource('units', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'id' });
          map.addLayer({ id: 'outline-fill', type: 'fill', source: 'outline', paint: { 'fill-color': PALETTE.paper.DEFAULT, 'fill-opacity': op.outline } });
          map.addLayer({ id: 'units-fill', type: 'fill', source: 'units', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': fillExpr(new Set(DEFAULT_LAYERS)), 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], op.hover, op.fill] } });
          map.addLayer({ id: 'units-hatch', type: 'fill', source: 'units', filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'insufficient'], 1]], paint: { 'fill-pattern': 'hatch' } });
          map.addLayer({ id: 'units-line', type: 'line', source: 'units', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': PALETTE.paper.DEFAULT, 'line-width': 1.5 } });
          map.addLayer({ id: 'units-sel', type: 'line', source: 'units', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': PALETTE.ink.DEFAULT, 'line-width': 3 } });
          map.addLayer({ id: 'outline-line', type: 'line', source: 'outline', paint: { 'line-color': PALETTE.ink.DEFAULT, 'line-width': 1.4, 'line-dasharray': [2, 1.5] } });
          map.addLayer({ id: 'schools', type: 'circle', source: 'units', filter: ['==', ['geometry-type'], 'Point'], paint: {
            'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 9, 7], 'circle-color': fillExpr(new Set(DEFAULT_LAYERS)),
            'circle-stroke-color': ['case', ['==', ['get', 'insufficient'], 1], PALETTE.ink.soft, PALETTE.paper.DEFAULT], 'circle-stroke-width': 2 } });
          let hovered: string | number | undefined;
          const onMove = (e: MapLayerMouseEvent) => {
            const f = e.features?.[0];
            if (!f) return;
            if (hovered !== undefined && hovered !== f.id) map.setFeatureState({ source: 'units', id: hovered }, { hover: false });
            hovered = f.id; map.setFeatureState({ source: 'units', id: hovered! }, { hover: true });
            map.getCanvas().style.cursor = 'pointer';
            setHover({ x: e.point.x, y: e.point.y, p: f.properties as Record<string, unknown> });
          };
          const onLeave = () => {
            if (hovered !== undefined) map.setFeatureState({ source: 'units', id: hovered }, { hover: false });
            hovered = undefined; map.getCanvas().style.cursor = ''; setHover(null);
          };
          for (const l of ['units-fill', 'schools']) { map.on('mousemove', l, onMove); map.on('mouseleave', l, onLeave); }
          setReady(true);
        });
        mapRef.current = map;
      } catch (e) {
        setMapError(`The interactive map could not start: ${(e as Error).message}`);
      }
    })();
    return () => { cancelled = true; markers.current.forEach((m) => m.remove()); mapRef.current?.remove(); mapRef.current = null; };
  }, [useGoogle]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- click: select; double-click: drill in (the same for both map engines)
  const pick = useCallback((p: Record<string, unknown>) => {
    if (compact && String(p.level) === 'school') { router.push(`/schools/${String(p.id)}`); return; }
    if (Number(p.noData)) return;
    push({ sel: String(p.id) });
  }, [compact, router, push]);
  const drill = useCallback((p: Record<string, unknown>) => {
    if (Number(p.canDrill) === 1) push({ parent: String(p.id), sel: null });
  }, [push]);
  const handlers = useRef({ pick, drill });
  handlers.current = { pick, drill };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const click = (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
      if (p) pick(p);
    };
    const dbl = (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
      if (p) drill(p);
    };
    for (const l of ['units-fill', 'schools']) { map.on('click', l, click); map.on('dblclick', l, dbl); }
    return () => { for (const l of ['units-fill', 'schools']) { map.off('click', l, click); map.off('dblclick', l, dbl); } };
  }, [ready, pick, drill]);

  // ---- data → sources + fit
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !data) return;
    (map.getSource('units') as import('maplibre-gl').GeoJSONSource).setData(data.features);
    (map.getSource('outline') as import('maplibre-gl').GeoJSONSource).setData({ type: 'FeatureCollection', features: data.outline ? [data.outline] : [] });
    if (data.parent.bbox) map.fitBounds(data.parent.bbox as [number, number, number, number], { padding: fitPadding(), duration: 600 });
  }, [data, ready, compact]);

  // ---- the container can be hidden (list view) and shown again: resize and refit when it reappears
  useEffect(() => {
    const map = mapRef.current;
    const el = box.current;
    if (!map || !ready || !el || typeof ResizeObserver === 'undefined') return;
    let wasHidden = el.clientWidth === 0;
    const ro = new ResizeObserver(() => {
      const hidden = el.clientWidth === 0 || el.clientHeight === 0;
      if (hidden) { wasHidden = true; return; }
      map.resize();
      if (wasHidden && data?.parent.bbox) map.fitBounds(data.parent.bbox as [number, number, number, number], { padding: compact ? 24 : 56, duration: 0 });
      wasHidden = false;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready, data, compact]);

  // ---- paint, selection, labels (MapLibre)
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !ready || !lib) return;
    map.setPaintProperty('units-fill', 'fill-color', fillExpr(layers, by));
    map.setPaintProperty('schools', 'circle-color', fillExpr(layers, by));
    // Radius in pixels, half of dotSize(): 5 for an empty school up to 10 for the largest.
    const radius = ['/', ['min', 20, ['+', 10, ['/', ['sqrt', ['to-number', ['get', 'enrolment'], 0]], 2]]], 2];
    map.setPaintProperty('schools', 'circle-radius', ['case', ['boolean', ['feature-state', 'hover'], false], ['+', 2, radius], radius] as unknown as ExpressionSpecification);
    map.setFilter('units-sel', ['==', ['get', 'id'], selectedId ?? '']);
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    if (!data) return;
    const many = data.features.features.filter((f) => !Number(f.properties?.noData)).length > 30;
    for (const f of data.features.features) {
      const p = f.properties as Record<string, unknown>;
      const isPoint = f.geometry.type === 'Point';
      const lon = isPoint ? (f.geometry as import('geojson').Point).coordinates[0] : Number(p.lon);
      const lat = isPoint ? (f.geometry as import('geojson').Point).coordinates[1] : Number(p.lat);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const el = labelEl(p, { isPoint, isSel: p.id === selectedId, many, by, layers, lang });
      if (!el) continue;
      // MapLibre positions a marker with its own transform, so a school's label is lifted above
      // its dot with the marker's offset rather than a transform of ours (which would be lost).
      markers.current.push(new lib.Marker({ element: el, anchor: isPoint ? 'bottom' : 'center', offset: isPoint ? [0, -8] : [0, 0] }).setLngLat([lon, lat]).addTo(map));
    }
  }, [layersKey, data, ready, selectedId, by]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Google Maps: start once, then redraw whenever the data, colouring or selection changes
  useEffect(() => {
    if (!useGoogle) return undefined;
    let cancelled = false;
    const stop = onKeyRefused((why) => { if (!cancelled) { gview.current?.destroy(); gview.current = null; setGoogleRefused(why); } });
    loadGoogleMaps(googleKey).then((maps) => {
      if (cancelled || !box.current) return;
      gview.current = new GoogleMapView(maps, box.current, {
        onHover: (p, x, y) => setHover(p ? { x, y, p } : null),
        onClick: (p) => handlers.current.pick(p),
        onDblClick: (p) => handlers.current.drill(p),
      }, { controlsAt: reserve?.right ? 'top-center' : 'top-right' });
      setReady(true);
    }).catch((e: Error) => { if (!cancelled && !e.message.includes('refused')) setMapError(e.message); });
    return () => { cancelled = true; stop(); gview.current?.destroy(); gview.current = null; };
  }, [useGoogle, googleKey]);

  useEffect(() => {
    const v = gview.current;
    if (!useGoogle || !v || !ready || !data) return;
    const many = data.features.features.filter((f) => !Number(f.properties?.noData)).length > 30;
    v.draw(data.features, data.outline, {
      colourOf: (p) => colourOf(p, layers, by),
      faint: (p) => Number(p.noData) === 1,
      labelOf: (p, isPoint) => labelEl(p, { isPoint, isSel: p.id === selectedId, many, by, layers, lang }),
      dotSize, selectedId: selectedId ?? null, ink: PALETTE.ink.DEFAULT,
    });
  }, [useGoogle, ready, data, layersKey, by, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (useGoogle && ready && data?.parent.bbox) gview.current?.fit(data.parent.bbox, fitPadding());
  }, [useGoogle, ready, data]);

  const toggleLayer = (k: string) => {
    const n = new Set(layers); if (n.has(k)) n.delete(k); else n.add(k);
    const v = [...n].sort().join(',');
    push({ layers: v === [...DEFAULT_LAYERS].sort().join(',') ? null : v || 'none' });
  };
  const setFilter = (k: string, v: string) => push({ [k]: v || null, sel: null });
  const sel = 'h-8 w-full rounded-md border border-line-strong bg-white px-2 text-sm text-ink';

  return (
    <div className={bare ? 'h-full' : compact ? 'space-y-2' : ''}>
      <div className={`relative overflow-hidden bg-map ${bare ? '' : 'rounded-xl border border-line'}`} style={{ height }}>
        {/* MapLibre forces position:relative on its container, so the sizing lives on a wrapper. */}
        <div className="absolute inset-0"><div ref={box} className="h-full w-full" role="application" aria-label={L(`Map of ${data?.parent.name ?? 'your area'}`, `${data?.parent.name ?? 'आपके क्षेत्र'} का नक्शा`)} /></div>

        {workspace ? (
          <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-0.5 rounded-lg border border-line bg-white/95 p-1 shadow-lift backdrop-blur" role="toolbar" aria-label={L('Map tools', 'नक्शा उपकरण')}>
            <Popover label={L('Layers', 'परतें')} icon="layers" open={pop === 'layers'} setOpen={(v) => setPop(v ? 'layers' : null)}>
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint">{L('Colour areas by', 'क्षेत्रों का रंग')}</p>
              {COLOUR_BY.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm text-ink hover:bg-paper-sunk">
                  <input type="radio" name="colour-by" checked={by === c.key} onChange={() => push({ by: c.key === 'learning' ? null : c.key })} className="mt-0.5 h-3.5 w-3.5 accent-brand" />
                  <span><span className="block">{L(c.label, c.hi)}</span><span className="block text-2xs leading-snug text-ink-faint">{L(c.hint, c.hintHi)}</span></span>
                </label>
              ))}
              <p className="mb-1.5 mt-3 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint">{L('Learning status', 'अधिगम स्थिति')}</p>
              {STATUS_LAYERS.map((l) => (
                <label key={l.key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-ink hover:bg-paper-sunk">
                  <input type="checkbox" checked={layers.has(l.key)} onChange={() => toggleLayer(l.key)} className="h-3.5 w-3.5 accent-brand" />
                  <span className="h-3 w-3 rounded-sm border border-line" style={{ background: l.color }} />{L(l.label, l.hi)}
                </label>
              ))}
              <p className="mb-1.5 mt-3 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint">{L('Overlays', 'ऊपर दिखाएँ')}</p>
              {OVERLAYS.map((o) => (
                <label key={o.key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-ink hover:bg-paper-sunk">
                  <input type="checkbox" checked={layers.has(o.key)} onChange={() => toggleLayer(o.key)} className="h-3.5 w-3.5 accent-brand" />
                  <span className={`rounded-full px-1.5 text-2xs font-semibold ${o.cls}`}>{badgeLetter(o.key, lang)}</span>{L(o.label, o.hi)}
                </label>
              ))}
              <p className="mt-2 text-2xs leading-snug text-ink-faint">{L('Areas with too few students are always hatched — unknown, not stable.', 'बहुत कम विद्यार्थियों वाले क्षेत्र हमेशा धारीदार दिखते हैं — स्थिति अज्ञात, स्थिर नहीं।')}</p>
            </Popover>
            <Popover label={L('Filters', 'छाँटें')} icon="filter" open={pop === 'filters'} setOpen={(v) => setPop(v ? 'filters' : null)}>
              <div className="space-y-2">
                <label className="block text-xs text-ink-soft">{L('Class', 'कक्षा')}<select className={sel} value={sp.get('grade') ?? ''} onChange={(e) => setFilter('grade', e.target.value)}><option value="">{L('All classes', 'सभी कक्षाएँ')}</option><option value="1">{L('Class 1', 'कक्षा 1')}</option><option value="2">{L('Class 2', 'कक्षा 2')}</option><option value="3">{L('Class 3', 'कक्षा 3')}</option></select></label>
                <label className="block text-xs text-ink-soft">{L('Subject', 'विषय')}<select className={sel} value={sp.get('subject') ?? ''} onChange={(e) => setFilter('subject', e.target.value)}><option value="">{L('Both', 'दोनों')}</option><option value="N">{L('Numeracy', 'गणित')}</option><option value="L">{L('Literacy', 'भाषा')}</option></select></label>
                <label className="block text-xs text-ink-soft">{L('Competency', 'दक्षता')}<select className={sel} value={sp.get('comp') ?? ''} onChange={(e) => setFilter('comp', e.target.value)}><option value="">{L('All', 'सभी')}</option>{competencies.filter((c) => !sp.get('subject') || c.id.startsWith(`CMP-${sp.get('subject')}`)).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
                <label className="block text-xs text-ink-soft">{L('Assessment period', 'आकलन अवधि')}<select className={sel} value={sp.get('round') ?? ''} onChange={(e) => setFilter('round', e.target.value)}><option value="">{L('Latest', 'नवीनतम')}</option>{rounds.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
                {filterKey !== 'grade=&comp=&subject=&round=' ? <button type="button" onClick={() => push({ grade: null, comp: null, subject: null, round: null })} className="text-xs font-medium text-brand hover:underline">{L('Clear filters', 'छँटाई हटाएँ')}</button> : null}
              </div>
            </Popover>
            <button type="button" onClick={() => setLegend((v) => !v)} aria-pressed={legend} className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium ${legend ? 'bg-paper-deep text-ink' : 'text-ink-soft hover:bg-paper-deep hover:text-ink'}`}><Icon name="info" size={14} /><span className="sr-only sm:not-sr-only">{L('Legend', 'संकेत')}</span></button>
            <button type="button" onClick={() => { if (!data?.parent.bbox) return; if (gview.current) gview.current.fit(data.parent.bbox, fitPadding()); else mapRef.current?.fitBounds(data.parent.bbox as [number, number, number, number], { padding: 56, duration: 500 }); }} className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-ink-soft hover:bg-paper-deep hover:text-ink"><Icon name="refresh" size={14} /><span className="sr-only sm:not-sr-only">{L('Reset', 'पूरा क्षेत्र')}</span></button>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            <button type="button" onClick={() => push({ view: 'list' })} className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-ink-soft hover:bg-paper-deep hover:text-ink"><Icon name="list" size={14} /><span className="sr-only sm:not-sr-only">{L('List', 'सूची')}</span></button>
          </div>
        ) : null}

        {loading ? <div className={`absolute z-10 flex items-center gap-2 rounded-md bg-white/95 px-2.5 py-1.5 text-xs text-ink-soft shadow ${workspace ? 'bottom-3 right-3' : bare ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2' : 'left-3 top-3'}`}><span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />{L('Loading map…', 'नक्शा लोड हो रहा है…')}</div> : null}
        {error || mapError ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-ivory/90 p-6 text-center">
            <div>
              <Icon name="alert" size={26} className="mx-auto text-warn" />
              <p className="mt-2 font-medium text-ink">{mapError ?? error}</p>
              <div className="mt-3 flex justify-center gap-2">
                {error ? <button type="button" onClick={() => void load()} className="btn-quiet btn-sm">{L('Retry', 'फिर कोशिश करें')}</button> : null}
                <Link href={`${basePath}?view=list`} className="btn-quiet btn-sm">{L('Use the list view', 'सूची देखें')}</Link>
              </div>
            </div>
          </div>
        ) : null}
        {!loading && !error && data && data.features.features.length === 0 ? (
          <div className="absolute inset-x-0 top-1/2 z-10 mx-auto w-fit -translate-y-1/2 rounded-lg bg-white/95 px-4 py-2 text-sm text-ink-soft shadow">{L('No mapped areas at this level.', 'इस स्तर पर कोई क्षेत्र नक्शे में नहीं।')}</div>
        ) : null}
        {hover ? (
          <div className="pointer-events-none absolute z-20 w-56 rounded-lg border border-line bg-white p-2.5 text-xs shadow-pop" style={{ left: Math.min(hover.x + 14, (box.current?.clientWidth ?? 600) - 236), top: Math.max(8, hover.y - 10) }}>
            <p className="text-sm font-semibold text-ink">{String(hover.p.name)}</p>
            <p className="text-2xs text-ink-faint">{levelName(String(hover.p.level), lang)}</p>
            {Number(hover.p.noData) ? <p className="mt-1 text-ink-soft">{L('No demo data in this district.', 'इस ज़िले में डेमो डेटा नहीं।')}</p> : <>
            <p className="mt-1 flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SEVERITY_COLORS[String(hover.p.severity)] }} />{severityLabel(String(hover.p.severity), lang)}{hover.p.severity !== 'insufficient' ? ` · ${pp(hover.p.relPp)}` : ''}</p>
            <p className="mt-1 text-ink-faint">{L(`${String(hover.p.openCases)} cases · ${String(hover.p.complaints)} complaints · ${String(hover.p.overdue)} overdue`, `${String(hover.p.openCases)} प्रकरण · ${String(hover.p.complaints)} शिकायतें · ${String(hover.p.overdue)} विलंबित`)}</p>
            {hover.p.teacherLevel !== undefined ? (
              <ul className="mt-1.5 space-y-0.5 border-t border-line pt-1.5 text-ink-soft">
                {hover.p.level === 'school' ? (
                  <>
                    <li>{L('Teachers', 'शिक्षक')}: {Number(hover.p.teachersSanctioned) - Number(hover.p.teachersShort)} / {String(hover.p.teachersSanctioned)}{Number(hover.p.netTransfersOut) > 0 ? L(` · ${String(hover.p.netTransfersOut)} left recently`, ` · हाल में ${String(hover.p.netTransfersOut)} गए`) : ''}</li>
                    <li>{L('Last visit', 'पिछला भ्रमण')}: {hover.p.daysSinceVisit === null ? L('never', 'कभी नहीं') : `${String(hover.p.daysSinceVisit)} ${L('days ago', 'दिन पहले')}`}</li>
                    <li>{L('Attendance', 'उपस्थिति')}: {hover.p.attChange === null ? '—' : `${Number(hover.p.attChange) > 0 ? '+' : ''}${Number(hover.p.attChange).toFixed(1)} ${L('pts, 3 months', 'अंक, 3 महीने')}`}</li>
                  </>
                ) : (
                  <>
                    <li>{String(hover.p.schoolsShort)} {L('of', 'में से')} {String(hover.p.schoolsCounted)} {L('schools short of teachers', 'विद्यालयों में शिक्षक कम')}</li>
                    <li>{String(hover.p.schoolsUnvisited)} {L('not visited for 60+ days', '60+ दिन से भ्रमण नहीं')}</li>
                    <li>{String(hover.p.schoolsAttendanceDown)} {L('with attendance falling', 'में उपस्थिति गिर रही')}</li>
                  </>
                )}
              </ul>
            ) : null}
            <p className="mt-1 text-2xs text-ink-faint">{compact ? L('Click to open', 'खोलने के लिए क्लिक करें') : L(`Click to select${Number(hover.p.canDrill) ? ' · double-click to zoom in' : ''}`, `चुनने के लिए क्लिक करें${Number(hover.p.canDrill) ? ' · अंदर देखने के लिए डबल-क्लिक' : ''}`)}</p>
            </>}
          </div>
        ) : null}
        {googleRefused ? (
          // A quiet line, not a warning: the map still works. Google's own console error says why it refused.
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-white/85 px-2.5 py-0.5 text-2xs text-ink-faint shadow-lift" data-testid="map-fallback-note">
            {streetsOn
              ? L('Showing the OpenStreetMap view', 'OpenStreetMap का नक्शा दिखाया जा रहा है')
              : L('Showing the plain map', 'सादा नक्शा दिखाया जा रहा है')}
          </div>
        ) : null}
        {/* With the street layer, MapLibre's own attribution already credits OpenStreetMap. */}
        {(workspace || bare) && data?.sources.geometry === 'osm' && !streetsOn ? (
          <div className="pointer-events-none absolute bottom-1 right-14 z-10 rounded bg-white/80 px-1.5 text-2xs text-ink-soft">{L('Boundaries © OpenStreetMap contributors', 'सीमाएँ © OpenStreetMap योगदानकर्ता')}</div>
        ) : null}
        {workspace && legend ? (
          <div className="absolute bottom-3 left-3 z-10 max-w-[260px] rounded-lg border border-line bg-white/95 p-2.5 text-xs shadow-lift">
            {by === 'learning' ? (
              <ul className="space-y-0.5">
                {STATUS_LAYERS.map((l) => <li key={l.key} className={`flex items-center gap-1.5 ${layers.has(l.key) ? 'text-ink-soft' : 'text-ink-faint line-through'}`}><span className="h-2.5 w-3.5 rounded-sm border border-line" style={{ background: l.color }} />{L(l.label, l.hi)}</li>)}
                <li className="flex items-center gap-1.5 text-ink-soft"><span className="h-2.5 w-3.5 rounded-sm border border-line bg-[repeating-linear-gradient(45deg,rgba(69,82,106,.6)_0_2px,theme(colors.sev.insufficient)_2px_6px)]" />{L('Insufficient data', 'अपर्याप्त डेटा')}</li>
              </ul>
            ) : (
              <>
                <p className="mb-1 font-semibold text-ink">{L(COLOUR_BY.find((c) => c.key === by)!.label, COLOUR_BY.find((c) => c.key === by)!.hi)}</p>
                <ul className="space-y-0.5">
                  {NOW_STEPS[by].map(([k, t, th]) => <li key={k} className="flex items-center gap-1.5 text-ink-soft"><span className="h-2.5 w-3.5 rounded-sm border border-line" style={{ background: NOW_COLOUR[k] }} />{L(t, th)}</li>)}
                </ul>
                <p className="mt-1.5 leading-snug text-ink-faint">{data?.childLevel === 'school' ? L('Each dot is one school.', 'हर बिंदु एक विद्यालय है।') : L('An area takes the worst colour that half (red), 30% (orange) or 15% (yellow) of its schools reach.', 'क्षेत्र को वह सबसे खराब रंग मिलता है जो उसके आधे (लाल), 30% (नारंगी) या 15% (पीले) विद्यालयों तक पहुँचे।')}</p>
              </>
            )}
            {data?.sources.geometry === 'osm' ? <p className="mt-1.5 border-t border-line pt-1.5 leading-snug text-ink-faint">{data.sources.attribution}</p> : null}
          </div>
        ) : null}
      </div>
      {compact && !bare ? (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft" aria-label={L('Legend', 'संकेत')}>
          {STATUS_LAYERS.map((l) => <li key={l.key} className="flex items-center gap-1.5"><span className="h-2.5 w-3.5 rounded-sm border border-line" style={{ background: l.color }} />{L(l.label, l.hi)}</li>)}
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-3.5 rounded-sm border border-line bg-[repeating-linear-gradient(45deg,rgba(69,82,106,.6)_0_2px,theme(colors.sev.insufficient)_2px_6px)]" />{L('Insufficient data', 'अपर्याप्त डेटा')}</li>
          <li className="ml-auto text-ink-faint">{data?.sources.geometry === 'osm'
            ? L('Real boundaries © OpenStreetMap · simulated data', 'वास्तविक सीमाएँ © OpenStreetMap · काल्पनिक डेटा')
            : L('Illustrative geography · fictional state', 'उदाहरण हेतु भूगोल · काल्पनिक राज्य')}</li>
        </ul>
      ) : null}
    </div>
  );
}
