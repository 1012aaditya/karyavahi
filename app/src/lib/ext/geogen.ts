/**
 * Illustrative geography generator.
 *
 * The demo state is fictional, so no real boundary or coordinate exists for any of its units.
 * Rather than draw fictional districts on top of real places, this builds a self-contained,
 * clearly illustrative geography: a hex grid shaped like a state, partitioned recursively into
 * districts → blocks → clusters by seeded nearest-centre assignment, so every child sits
 * exactly inside its parent and neighbours share edges. Boundaries are the union of a unit's
 * hexes. School points are placed inside their cluster's hexes.
 *
 * Coordinates sit around (0°, 0°) — open ocean — so the shapes cannot be mistaken for a real
 * place even if a basemap were ever added. Everything produced here is tagged
 * geometry_source = 'illustrative'. Pure and deterministic: same input, same shapes.
 */

export interface GenInput {
  districts: { id: string; schools: number }[];
  blocks: { id: string; district_id: string; schools: number }[];
  clusters: { id: string; block_id: string; schools: number }[];
  schools: { id: string; cluster_id: string }[];
}

export type Ring = [number, number][];
export interface GenUnit { id: string; rings: Ring[]; centroid: [number, number]; bbox: [number, number, number, number] }
export interface GenOutput { state: GenUnit; units: Map<string, GenUnit>; schoolPoints: Map<string, [number, number]>; hexOf: Map<string, string[]> }

// Small deterministic hash → [0,1)
function h(...xs: (string | number)[]): number {
  let a = 2166136261;
  for (const x of xs.join('|')) { a ^= x.charCodeAt(0); a = Math.imul(a, 16777619); }
  a ^= a >>> 13; a = Math.imul(a, 0x5bd1e995); a ^= a >>> 15;
  return (a >>> 0) / 4294967296;
}

const SIZE = 0.022; // hex radius in degrees
const SQ3 = Math.sqrt(3);
const key = (q: number, r: number) => `${q},${r}`;
const center = (q: number, r: number): [number, number] => [SIZE * SQ3 * (q + r / 2), -SIZE * 1.5 * r];
const corner = (c: [number, number], i: number): [number, number] => {
  const a = (Math.PI / 180) * (60 * i - 30);
  return [Math.round((c[0] + SIZE * Math.cos(a)) * 1e6) / 1e6, Math.round((c[1] + SIZE * Math.sin(a)) * 1e6) / 1e6];
};

function bboxOf(points: [number, number][]): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of points) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return [a, b, c, d];
}

/** Union boundary of a set of hexes: keep edges used once, then chain them into rings. */
function rings(hexes: string[]): Ring[] {
  const edgeCount = new Map<string, { a: string; b: string; n: number }>();
  const pt = new Map<string, [number, number]>();
  for (const hk of hexes) {
    const [q, r] = hk.split(',').map(Number);
    const c = center(q, r);
    const cs = [0, 1, 2, 3, 4, 5].map((i) => corner(c, i));
    for (let i = 0; i < 6; i++) {
      const p1 = cs[i], p2 = cs[(i + 1) % 6];
      const k1 = `${p1[0]},${p1[1]}`, k2 = `${p2[0]},${p2[1]}`;
      pt.set(k1, p1); pt.set(k2, p2);
      const ek = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
      const e = edgeCount.get(ek);
      if (e) e.n++; else edgeCount.set(ek, { a: k1, b: k2, n: 1 });
    }
  }
  const adj = new Map<string, string[]>();
  for (const e of edgeCount.values()) {
    if (e.n !== 1) continue;
    adj.set(e.a, [...(adj.get(e.a) ?? []), e.b]);
    adj.set(e.b, [...(adj.get(e.b) ?? []), e.a]);
  }
  const used = new Set<string>();
  const out: Ring[] = [];
  for (const start of adj.keys()) {
    for (const first of adj.get(start)!) {
      const ek0 = start < first ? `${start}|${first}` : `${first}|${start}`;
      if (used.has(ek0)) continue;
      const ring: string[] = [start];
      let prev = start, cur = first;
      used.add(ek0);
      while (cur !== start && ring.length < 100000) {
        ring.push(cur);
        const next = (adj.get(cur) ?? []).find((n) => {
          const ek = cur < n ? `${cur}|${n}` : `${n}|${cur}`;
          return n !== prev && !used.has(ek);
        }) ?? (adj.get(cur) ?? []).find((n) => {
          const ek = cur < n ? `${cur}|${n}` : `${n}|${cur}`;
          return !used.has(ek);
        });
        if (!next) break;
        used.add(cur < next ? `${cur}|${next}` : `${next}|${cur}`);
        prev = cur; cur = next;
      }
      if (ring.length >= 3) out.push([...ring.map((k) => pt.get(k)!), pt.get(start)!]);
    }
  }
  return out;
}

/** Assign each hex in `pool` to one of `n` regions, sized roughly by `weights`. */
function partition(pool: string[], ids: string[], weights: number[], salt: string): Map<string, string[]> {
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  if (ids.length === 1) { out.set(ids[0], [...pool]); return out; }
  const pts = pool.map((k) => { const [q, r] = k.split(',').map(Number); return { k, c: center(q, r) }; });
  // Farthest-point seeds, starting from a deterministic hex.
  const seeds: [number, number][] = [pts[Math.floor(h(salt, 'start') * pts.length)].c];
  while (seeds.length < ids.length) {
    let best = pts[0], bestD = -1;
    for (const p of pts) {
      const d = Math.min(...seeds.map((s) => (s[0] - p.c[0]) ** 2 + (s[1] - p.c[1]) ** 2));
      if (d > bestD) { bestD = d; best = p; }
    }
    seeds.push(best.c);
  }
  // A few Lloyd iterations with weights, so region sizes follow school counts.
  const total = weights.reduce((a, b) => a + b, 0);
  let assign = new Map<string, number>();
  for (let it = 0; it < 6; it++) {
    assign = new Map();
    const scale = ids.map((_, i) => Math.sqrt(weights[i] / total));
    for (const p of pts) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < seeds.length; i++) {
        const d = Math.sqrt((seeds[i][0] - p.c[0]) ** 2 + (seeds[i][1] - p.c[1]) ** 2) / (0.6 + scale[i]) * (0.92 + 0.16 * h(salt, p.k, i));
        if (d < bd) { bd = d; bi = i; }
      }
      assign.set(p.k, bi);
    }
    const sums = seeds.map(() => [0, 0, 0]);
    for (const p of pts) { const s = sums[assign.get(p.k)!]; s[0] += p.c[0]; s[1] += p.c[1]; s[2]++; }
    for (let i = 0; i < seeds.length; i++) if (sums[i][2] > 0) seeds[i] = [sums[i][0] / sums[i][2], sums[i][1] / sums[i][2]];
  }
  // Contiguity: keep each region's largest connected piece; hand stray hexes to the
  // neighbouring region they touch most. Repeat until stable, so every unit is one shape.
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const inPool = new Set(pool);
  for (let pass = 0; pass < 8; pass++) {
    let moved = 0;
    for (let i = 0; i < ids.length; i++) {
      const mine = pts.filter((p) => assign.get(p.k) === i).map((p) => p.k);
      const set = new Set(mine);
      const seen = new Set<string>();
      const comps: string[][] = [];
      for (const s0 of mine) {
        if (seen.has(s0)) continue;
        const comp: string[] = []; const stack = [s0]; seen.add(s0);
        while (stack.length) {
          const k = stack.pop()!; comp.push(k);
          const [q, r] = k.split(',').map(Number);
          for (const [dq, dr] of NB) { const nk = key(q + dq, r + dr); if (set.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); } }
        }
        comps.push(comp);
      }
      comps.sort((a, b) => b.length - a.length);
      for (const comp of comps.slice(1)) {
        for (const k of comp) {
          const [q, r] = k.split(',').map(Number);
          const votes = new Map<number, number>();
          for (const [dq, dr] of NB) {
            const nk = key(q + dq, r + dr);
            if (!inPool.has(nk)) continue;
            const a = assign.get(nk)!;
            if (a !== i) votes.set(a, (votes.get(a) ?? 0) + 1);
          }
          const best = [...votes.entries()].sort((x, y) => y[1] - x[1])[0];
          if (best) { assign.set(k, best[0]); moved++; }
        }
      }
    }
    if (moved === 0) break;
  }
  for (const p of pts) out.get(ids[assign.get(p.k)!])!.push(p.k);
  // Never leave a region empty: give it the hex nearest its seed taken from the largest region.
  for (let i = 0; i < ids.length; i++) {
    if (out.get(ids[i])!.length > 0) continue;
    const big = [...out.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const take = big[1].pop()!;
    out.get(ids[i])!.push(take);
  }
  return out;
}

export function generateGeography(input: GenInput): GenOutput {
  const totalSchools = input.schools.length;
  // Roughly 1.6 hexes per school, in a lumpy state-shaped blob.
  const target = Math.max(200, Math.round(totalSchools * 1.6));
  const R = Math.ceil(Math.sqrt(target / 2.6));
  const pool: string[] = [];
  for (let q = -R * 2; q <= R * 2; q++) {
    for (let r = -R * 2; r <= R * 2; r++) {
      const [x, y] = center(q, r);
      const ang = Math.atan2(y, x);
      const radius = SIZE * 1.5 * R * (1 + 0.18 * Math.sin(3 * ang + 0.7) + 0.1 * Math.cos(5 * ang) + 0.06 * (h('edge', q, r) - 0.5));
      if (Math.hypot(x * 0.9, y * 1.15) <= radius) pool.push(key(q, r));
    }
  }

  const hexOf = new Map<string, string[]>();
  const dParts = partition(pool, input.districts.map((d) => d.id), input.districts.map((d) => Math.max(1, d.schools)), 'districts');
  for (const [did, dh] of dParts) {
    hexOf.set(did, dh);
    const bs = input.blocks.filter((b) => b.district_id === did);
    const bParts = partition(dh, bs.map((b) => b.id), bs.map((b) => Math.max(1, b.schools)), did);
    for (const [bid, bh] of bParts) {
      hexOf.set(bid, bh);
      const cs = input.clusters.filter((c) => c.block_id === bid);
      const cParts = partition(bh, cs.map((c) => c.id), cs.map((c) => Math.max(1, c.schools)), bid);
      for (const [cid, ch] of cParts) hexOf.set(cid, ch);
    }
  }

  const unit = (id: string, hexes: string[]): GenUnit => {
    const rs = rings(hexes);
    const cs = hexes.map((k) => { const [q, r] = k.split(',').map(Number); return center(q, r); });
    const cx = cs.reduce((a, c) => a + c[0], 0) / cs.length;
    const cy = cs.reduce((a, c) => a + c[1], 0) / cs.length;
    // Use the hex centre nearest the mean, so labels always land inside the shape.
    const near = cs.reduce((b, c) => ((c[0] - cx) ** 2 + (c[1] - cy) ** 2 < (b[0] - cx) ** 2 + (b[1] - cy) ** 2 ? c : b), cs[0]);
    return { id, rings: rs, centroid: [Math.round(near[0] * 1e6) / 1e6, Math.round(near[1] * 1e6) / 1e6], bbox: bboxOf(rs.flat()) };
  };

  const units = new Map<string, GenUnit>();
  for (const [id, hexes] of hexOf) units.set(id, unit(id, hexes));

  const schoolPoints = new Map<string, [number, number]>();
  const byCluster = new Map<string, string[]>();
  for (const s of input.schools) byCluster.set(s.cluster_id, [...(byCluster.get(s.cluster_id) ?? []), s.id]);
  for (const [cid, sids] of byCluster) {
    const hexes = hexOf.get(cid) ?? [];
    sids.forEach((sid, i) => {
      const hk = hexes[i % Math.max(1, hexes.length)];
      if (!hk) return;
      const [q, r] = hk.split(',').map(Number);
      const c = center(q, r);
      const a = h(sid, 'a') * Math.PI * 2, d = SIZE * 0.55 * Math.sqrt(h(sid, 'd'));
      schoolPoints.set(sid, [Math.round((c[0] + d * Math.cos(a)) * 1e6) / 1e6, Math.round((c[1] + d * Math.sin(a)) * 1e6) / 1e6]);
    });
  }

  return { state: unit('STATE', pool), units, schoolPoints, hexOf };
}

/** Union of several units' hexes (for city areas made of clusters). */
export function unionUnit(id: string, hexes: string[]): GenUnit {
  const rs = rings(hexes);
  const cs = hexes.map((k) => { const [q, r] = k.split(',').map(Number); return center(q, r); });
  const cx = cs.reduce((a, c) => a + c[0], 0) / cs.length;
  const cy = cs.reduce((a, c) => a + c[1], 0) / cs.length;
  return { id, rings: rs, centroid: [cx, cy], bbox: bboxOf(rs.flat()) };
}

/** GeoJSON MultiPolygon from rings: a ring inside another becomes that polygon's hole. */
export function toMultiPolygon(rs: Ring[]): { type: 'MultiPolygon'; coordinates: Ring[][] } {
  const area = (r: Ring) => Math.abs(r.reduce((a, p, i) => { const n = r[(i + 1) % r.length]; return a + p[0] * n[1] - n[0] * p[1]; }, 0) / 2);
  const inside = (pt: [number, number], r: Ring) => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const sorted = [...rs].sort((a, b) => area(b) - area(a));
  const polys: Ring[][] = [];
  for (const r of sorted) {
    // A ring's midpoint of its first edge, nudged, is a safe test point for containment.
    const probe: [number, number] = [(r[0][0] + r[1][0]) / 2, (r[0][1] + r[1][1]) / 2];
    const host = polys.find((p) => inside(probe, p[0]) && !p.slice(1).some((hole) => inside(probe, hole)));
    if (host && polys.length) host.push(r); else polys.push([r]);
  }
  return { type: 'MultiPolygon', coordinates: polys };
}
