'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as MLMap, Marker, MapLayerMouseEvent, ExpressionSpecification } from 'maplibre-gl';
import { LAYERS, layerDef, labelValue, SEVERITY_COLORS, SEVERITY_LABEL, type LayerKey } from '@/lib/maplayers';
import { Icon } from './Icon';
import type { FeatureCollection, Feature } from 'geojson';

/**
 * The interactive geographic map (MapLibre GL JS).
 *
 * No third-party tiles are loaded: the background is plain, and every shape comes from
 * /api/geo/map, which returns only the user's permitted geography. Labels are HTML markers
 * (no glyph server needed). Selection and drill-down are written to the URL so the server can
 * render the detail panel and the browser's back button works.
 */

interface Payload {
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

const ramp = (prop: string, stops: [number, string][], zero = '#f4f1ea'): ExpressionSpecification =>
  ['step', ['coalesce', ['get', prop], 0], zero, ...stops.flat()] as unknown as ExpressionSpecification;

function fillFor(layer: LayerKey): ExpressionSpecification {
  switch (layer) {
    case 'learning': return ['match', ['get', 'severity'], ...Object.entries(SEVERITY_COLORS).flat(), '#f3efe6'] as unknown as ExpressionSpecification;
    case 'critical': return ramp('critical', [[1, '#f4b4ad'], [2, '#e2574c'], [4, '#9b1c13']]);
    case 'complaints': return ramp('complaints', [[1, '#d9cff2'], [2, '#9a85d6'], [4, '#5b4696']]);
    case 'overdue': return ramp('overdue', [[1, '#fbe3ac'], [3, '#f0a83a'], [6, '#9a5b07']]);
    case 'delivery': return ['case', ['==', ['get', 'delivery'], null], '#f3efe6', ['<', ['get', 'delivery'], 50], '#fde7c4', ['<', ['get', 'delivery'], 80], '#9fd8cc', '#0f766e'] as unknown as ExpressionSpecification;
    case 'improvement': return ramp('improved', [[1, '#bfe5cf'], [2, '#55b07f'], [4, '#18794e']]);
    case 'insufficient': return ['case', ['==', ['get', 'insufficient'], 1], '#77819a', '#f4f1ea'] as unknown as ExpressionSpecification;
  }
}

function hatchImage(): { width: number; height: number; data: Uint8Array } {
  const w = 12, h = 12, data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const on = (x + y) % 6 === 0 || (x + y) % 6 === 1;
    const i = (y * w + x) * 4;
    data[i] = 69; data[i + 1] = 82; data[i + 2] = 106; data[i + 3] = on ? 150 : 0;
  }
  return { width: w, height: h, data };
}

const LEVEL_NAME: Record<string, string> = { state: 'State', district: 'District', city: 'City', block: 'Block', cluster: 'Cluster', school: 'School' };

export function GeoMap({ height = 560, compact = false, selectedId = null, basePath = '/hotspots' }: { height?: number; compact?: boolean; selectedId?: string | null; basePath?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const libRef = useRef<typeof import('maplibre-gl') | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; p: Record<string, unknown> } | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; level: string }[]>([]);

  const parent = sp.get('parent') ?? '';
  const hierarchy = sp.get('h') === 'urban' ? 'urban' : 'admin';
  const layer = (LAYERS.some((l) => l.key === sp.get('layer')) ? sp.get('layer') : 'learning') as LayerKey;
  const filterKey = ['grade', 'comp', 'subject', 'round'].map((k) => `${k}=${sp.get(k) ?? ''}`).join('&');

  const push = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') next.delete(k); else next.set(k, v); }
    const target = compact ? basePath : pathname;
    router.push(`${target}?${next.toString()}`, { scroll: false });
  }, [sp, router, pathname, compact, basePath]);

  // ---- data
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams();
      if (parent) qs.set('parent', parent);
      if (hierarchy === 'urban') qs.set('h', 'urban');
      for (const k of ['grade', 'comp', 'subject', 'round']) { const v = sp.get(k); if (v) qs.set(k, v); }
      const r = await fetch(`/api/geo/map?${qs}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? 'The map could not be loaded.'); setData(null); return; }
      setData(j);
    } catch {
      setError('Could not reach the server for map data.');
    } finally { setLoading(false); }
  }, [parent, hierarchy, filterKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);

  // ---- map init
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lib = await import('maplibre-gl');
        if (cancelled || !box.current) return;
        libRef.current = lib;
        const map = new lib.Map({
          container: box.current,
          style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef1ef' } }] },
          center: [0, 0], zoom: 6, attributionControl: false, doubleClickZoom: false, dragRotate: false, pitchWithRotate: false,
        });
        map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
        map.addControl(new lib.AttributionControl({ compact: true, customAttribution: 'Illustrative geography · fictional state · MapLibre' }), 'bottom-right');
        map.touchZoomRotate.disableRotation();
        map.on('error', (e) => { if (String(e?.error?.message ?? '').includes('WebGL')) setMapError('This browser cannot draw the interactive map (WebGL unavailable).'); });
        map.on('load', () => {
          if (cancelled) return;
          map.addImage('hatch', hatchImage());
          map.addSource('outline', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addSource('units', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'id' });
          map.addLayer({ id: 'outline-fill', type: 'fill', source: 'outline', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.6 } });
          map.addLayer({ id: 'units-fill', type: 'fill', source: 'units', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': fillFor('learning'), 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.95, 0.82] } });
          map.addLayer({ id: 'units-hatch', type: 'fill', source: 'units', filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'insufficient'], 1]], paint: { 'fill-pattern': 'hatch' } });
          map.addLayer({ id: 'units-line', type: 'line', source: 'units', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': '#ffffff', 'line-width': 1.4 } });
          map.addLayer({ id: 'units-sel', type: 'line', source: 'units', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#0f1f3d', 'line-width': 3 } });
          map.addLayer({ id: 'outline-line', type: 'line', source: 'outline', paint: { 'line-color': '#0f1f3d', 'line-width': 1.6, 'line-dasharray': [2, 1.5] } });
          map.addLayer({ id: 'schools', type: 'circle', source: 'units', filter: ['==', ['geometry-type'], 'Point'], paint: {
            'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 9, 7], 'circle-color': fillFor('learning'),
            'circle-stroke-color': ['case', ['==', ['get', 'insufficient'], 1], '#45526a', '#ffffff'], 'circle-stroke-width': 2 } });
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
          for (const l of ['units-fill', 'schools']) {
            map.on('mousemove', l, onMove);
            map.on('mouseleave', l, onLeave);
          }
          setReady(true);
        });
        mapRef.current = map;
      } catch (e) {
        setMapError(`The interactive map could not start: ${(e as Error).message}`);
      }
    })();
    return () => { cancelled = true; markers.current.forEach((m) => m.remove()); mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  // ---- click / double-click, rebound when URL state changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const click = (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
      if (p) push({ selected: String(p.id), level: String(p.level) });
    };
    const dbl = (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
      if (p && Number(p.canDrill) === 1) push({ parent: String(p.id), plevel: String(p.level), selected: null, level: null });
    };
    for (const l of ['units-fill', 'schools']) { map.on('click', l, click); map.on('dblclick', l, dbl); }
    return () => { for (const l of ['units-fill', 'schools']) { map.off('click', l, click); map.off('dblclick', l, dbl); } };
  }, [ready, push]);

  // ---- draw data
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !ready || !data || !lib) return;
    (map.getSource('units') as import('maplibre-gl').GeoJSONSource).setData(data.features);
    (map.getSource('outline') as import('maplibre-gl').GeoJSONSource).setData({ type: 'FeatureCollection', features: data.outline ? [data.outline] : [] });
    if (data.parent.bbox) map.fitBounds(data.parent.bbox as [number, number, number, number], { padding: compact ? 24 : 48, duration: 650 });
  }, [data, ready, compact]);

  // ---- layer paint + labels + selection
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !ready || !lib) return;
    map.setPaintProperty('units-fill', 'fill-color', fillFor(layer));
    map.setPaintProperty('schools', 'circle-color', fillFor(layer));
    map.setFilter('units-sel', ['==', ['get', 'id'], selectedId ?? '']);
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    if (!data) return;
    const many = data.features.features.length > 24;
    for (const f of data.features.features) {
      const p = f.properties as Record<string, unknown>;
      const lon = f.geometry.type === 'Point' ? (f.geometry as import('geojson').Point).coordinates[0] : Number(p.lon);
      const lat = f.geometry.type === 'Point' ? (f.geometry as import('geojson').Point).coordinates[1] : Number(p.lat);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const el = document.createElement('div');
      const isSel = p.id === selectedId;
      el.className = `pointer-events-none select-none rounded-md px-1.5 py-0.5 text-center leading-tight shadow-sm ${isSel ? 'bg-navy text-white' : 'bg-white/90 text-[#0f1f3d]'}`;
      el.style.fontSize = '11px';
      if (f.geometry.type === 'Point') el.style.transform = 'translateY(-16px)';
      const name = document.createElement('div');
      name.style.fontWeight = '600';
      name.textContent = many && !isSel ? '' : String(p.name);
      const val = document.createElement('div');
      val.style.fontVariantNumeric = 'tabular-nums';
      val.textContent = labelValue(layer, p);
      if (name.textContent) el.appendChild(name);
      el.appendChild(val);
      markers.current.push(new lib.Marker({ element: el, anchor: 'center' }).setLngLat([lon, lat]).addTo(map));
    }
  }, [layer, data, ready, selectedId]);

  // ---- search
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`); setResults((await r.json()).results ?? []); } catch { setResults([]); }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const goTo = (r: { id: string; level: string }) => {
    setQ(''); setResults([]);
    if (r.level === 'school') push({ selected: r.id, level: 'school', parent: null, plevel: null });
    else push({ parent: r.id, plevel: r.level, selected: null, level: null });
  };
  const up = data && data.crumbs.length > 1 ? data.crumbs[data.crumbs.length - 2] : null;
  const def = layerDef(layer);

  return (
    <div className="space-y-3">
      {!compact ? (
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Map location" className="flex min-w-0 flex-wrap items-center gap-1 text-[13px]">
            {up ? <button type="button" onClick={() => push({ parent: up.id, plevel: up.level, selected: null, level: null })} className="btn-ghost btn-sm" aria-label="Back to previous level"><Icon name="chevron-left" size={15} />Back</button> : null}
            {(data?.crumbs ?? []).map((c, i, arr) => (
              <span key={c.id} className="flex items-center gap-1">
                {i > 0 ? <Icon name="chevron-right" size={13} className="text-ink-faint" /> : null}
                <button type="button" disabled={i === arr.length - 1} onClick={() => push({ parent: c.id, plevel: c.level, selected: null, level: null })}
                  className={`rounded-md px-2 py-1 ${i === arr.length - 1 ? 'bg-navy text-white' : 'text-ink-soft hover:bg-paper-deep hover:text-ink'}`}>
                  <span className="text-[11px] opacity-70">{LEVEL_NAME[c.level] ?? c.level} · </span>{c.name}
                </button>
              </span>
            ))}
          </nav>
          <div className="relative ml-auto">
            <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a place in your area…" aria-label="Find a place" className="input h-9 w-56 pl-8 text-[13px]" />
            {results.length ? (
              <ul className="absolute right-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-lg border border-line bg-white shadow-pop" role="listbox">
                {results.map((r) => (
                  <li key={r.id}><button type="button" onClick={() => goTo(r)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-paper-sunk"><span className="truncate text-ink">{r.name}</span><span className="text-[11px] text-ink-faint">{LEVEL_NAME[r.level] ?? r.level}</span></button></li>
                ))}
              </ul>
            ) : null}
          </div>
          {data?.hasUrban ? (
            <div className="inline-flex rounded-lg border border-line-strong bg-white p-0.5" role="group" aria-label="Hierarchy">
              {(['admin', 'urban'] as const).map((h) => (
                <button key={h} type="button" aria-pressed={hierarchy === h} onClick={() => push({ h: h === 'admin' ? null : 'urban', parent: null, plevel: null, selected: null, level: null })}
                  className={`rounded-md px-2.5 py-1 text-[12.5px] ${hierarchy === h ? 'bg-navy text-white' : 'text-ink-soft hover:text-ink'}`}>{h === 'admin' ? 'Blocks' : 'Cities'}</button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!compact ? (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Map layer">
          {LAYERS.map((l) => (
            <button key={l.key} type="button" role="radio" aria-checked={layer === l.key} onClick={() => push({ layer: l.key === 'learning' ? null : l.key })} title={l.description}
              className={`rounded-full border px-3 py-1 text-[12.5px] transition-colors ${layer === l.key ? 'border-navy bg-navy text-white' : 'border-line-strong bg-white text-ink-soft hover:border-ink-faint hover:text-ink'}`}>
              {l.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-xl border border-line bg-[#eef1ef]" style={{ height }}>
        <div ref={box} className="absolute inset-0" role="application" aria-label={`Map of ${data?.parent.name ?? 'your area'}. ${def.label} layer.`} />
        {loading ? <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-md bg-white/95 px-2.5 py-1.5 text-[12px] text-ink-soft shadow"><span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />Loading map…</div> : null}
        {error || mapError ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-ivory/90 p-6 text-center">
            <div>
              <Icon name="alert" size={26} className="mx-auto text-warn" />
              <p className="mt-2 font-medium text-ink">{mapError ?? error}</p>
              <div className="mt-3 flex justify-center gap-2">
                {error ? <button type="button" onClick={() => void load()} className="btn-quiet btn-sm">Retry</button> : null}
                <Link href={`${basePath}?view=list`} className="btn-quiet btn-sm">Use the list view</Link>
              </div>
            </div>
          </div>
        ) : null}
        {!loading && !error && data && data.features.features.length === 0 ? (
          <div className="absolute inset-x-0 top-1/2 z-10 mx-auto w-fit -translate-y-1/2 rounded-lg bg-white/95 px-4 py-2 text-[13px] text-ink-soft shadow">No mapped areas below this level.</div>
        ) : null}
        {hover ? (
          <div className="pointer-events-none absolute z-20 w-60 rounded-lg border border-line bg-white p-2.5 text-[12px] shadow-pop" style={{ left: Math.min(hover.x + 14, (box.current?.clientWidth ?? 600) - 250), top: Math.max(8, hover.y - 10) }}>
            <p className="text-[13px] font-semibold text-ink">{String(hover.p.name)}</p>
            <p className="text-[11px] uppercase tracking-wide text-ink-faint">{LEVEL_NAME[String(hover.p.level)] ?? String(hover.p.level)} · {String(hover.p.geometry_source)}</p>
            <p className="mt-1.5 flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SEVERITY_COLORS[String(hover.p.severity)] }} />{SEVERITY_LABEL[String(hover.p.severity)]}{hover.p.relPp !== null && hover.p.severity !== 'insufficient' ? ` · ${labelValue('learning', hover.p)}` : ''}</p>
            {hover.p.focus ? <p className="text-ink-faint">{String(hover.p.focus)}</p> : null}
            <dl className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-ink-soft">
              <dt>Critical cases</dt><dd className="text-right tnum text-ink">{String(hover.p.critical)}</dd>
              <dt>Open complaints</dt><dd className="text-right tnum text-ink">{String(hover.p.complaints)}</dd>
              <dt>Overdue actions</dt><dd className="text-right tnum text-ink">{String(hover.p.overdue)}</dd>
              <dt>Delivery verified</dt><dd className="text-right tnum text-ink">{hover.p.delivery === null ? '—' : `${String(hover.p.delivery)}%`}</dd>
            </dl>
            <p className="mt-1.5 text-[11px] text-ink-faint">Click to select{Number(hover.p.canDrill) ? ' · double-click to drill in' : ''}</p>
          </div>
        ) : null}
        <div className="absolute bottom-3 left-3 z-10 max-w-[260px] rounded-lg border border-line bg-white/95 p-2.5 shadow">
          <p className="text-[11.5px] font-semibold text-ink">{def.label}</p>
          <ul className="mt-1 space-y-0.5">
            {def.legend.map((g) => (
              <li key={g.label} className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                <span className="relative h-3 w-4 overflow-hidden rounded-sm border border-line" style={{ background: g.color }}>
                  {g.hatch ? <span className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(69,82,106,.6)_0_2px,transparent_2px_6px)]" /> : null}
                </span>{g.label}
              </li>
            ))}
          </ul>
          {!compact ? <p className="mt-1.5 text-[10.5px] leading-snug text-ink-faint">{def.description}</p> : null}
        </div>
        {!compact ? (
          <button type="button" onClick={() => data?.parent.bbox && mapRef.current?.fitBounds(data.parent.bbox as [number, number, number, number], { padding: 48, duration: 500 })}
            className="absolute right-3 top-[86px] z-10 rounded-md border border-line bg-white px-2 py-1 text-[11.5px] text-ink-soft shadow hover:text-ink">Reset view</button>
        ) : null}
      </div>
      <p className="flex items-start gap-1.5 text-[11.5px] text-ink-faint">
        <Icon name="info" size={13} className="mt-px" />
        <span>Illustrative geography for a fictional state — shapes and school positions are generated, not real boundaries or locations. India’s outline is intentionally not drawn. {data?.compared ? `Learning compares ${data.compared}.` : ''}</span>
      </p>
    </div>
  );
}
