import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { Kicker, SceneFade, useIn, useSpring } from '../components/ui';
import { C, EASE, F, s } from '../theme';

/**
 * 01 · The challenge (0:00–0:20). A calm dashboard; one cell turns red and lifts out; "and then…
 * nothing happens". Then the staircase of systems that all stop at the alert, with the missing
 * steps (owner · deadline · proof · re-measurement) drawn in grey.
 */

const CLUSTERS = ['Amarghat', 'Amarpura', 'Chandghat', 'Devisar', 'Indrakhera', 'Kusumgarh', 'Mahuapatti', 'Rampur', 'Sonagaon', 'Bhitauli', 'Sadarpur', 'Gangapur', 'Nawabganj', 'Kakrala', 'Behta'];
const SKILLS = ['Class 1 · Addition', 'Class 2 · Word reading', 'Class 3 · Reading', 'Class 1 · Letters', 'Class 2 · Numbers', 'Class 3 · Subtraction'];
const VALS = ['+1.2', '−0.8', '+2.4', '−1.6', '+0.4', '−2.1', '+3.0', '−18', '+0.9', '−0.3', '+1.7', '−1.1', '+0.6', '+2.2', '−0.5'];
const HOT = 7; // "Rampur"
const COLS = 5; const TW = 304; const TH = 168; const GAP = 20;
const GX = (1920 - (COLS * TW + (COLS - 1) * GAP)) / 2; const GY = 250;

const Grid: React.FC = () => {
  const frame = useCurrentFrame();
  const red = useIn(s(2.1), 12);
  const lift = interpolate(frame, [s(3.8), s(5.6)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const gridIn = useIn(0, 22);
  const drift = interpolate(frame, [0, s(9)], [0, -18]);
  const still = interpolate(frame, [s(7.2), s(9)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const days = Math.round(interpolate(frame, [s(7.2), s(9.0)], [1, 63], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE }));

  const hotCol = HOT % COLS; const hotRow = Math.floor(HOT / COLS);
  const hx = GX + hotCol * (TW + GAP); const hy = GY + hotRow * (TH + GAP);
  // Where the lifted card ends up.
  const cw = 720; const ch = 360; const cx = 200; const cy = 330;
  const L = (a: number, b: number) => a + (b - a) * lift;

  return (
    <div style={{ position: 'absolute', inset: 0, transform: `translateY(${drift}px)` }}>
      <div style={{ position: 'absolute', left: GX, top: GY - 96, opacity: gridIn * (1 - lift * 0.85), fontFamily: F.sans, fontSize: 30, color: C.inkFaint, display: 'flex', gap: 18, alignItems: 'baseline' }}>
        <span style={{ color: C.ink, fontWeight: 600 }}>Learning dashboard</span><span>Rampur Sadar · Round R3</span>
      </div>
      {VALS.map((v, i) => {
        if (i === HOT) return null;
        const col = i % COLS; const row = Math.floor(i / COLS);
        const o = gridIn * interpolate(frame, [i * 1.2, i * 1.2 + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div key={i} style={{
            position: 'absolute', left: GX + col * (TW + GAP), top: GY + row * (TH + GAP), width: TW, height: TH, borderRadius: 16,
            background: C.paper, border: `1px solid ${C.line}`, padding: '20px 24px', boxSizing: 'border-box', opacity: o * (1 - lift * 0.8),
            fontFamily: F.sans,
          }}>
            <div style={{ fontSize: 28, color: C.inkSoft, fontWeight: 500 }}>{CLUSTERS[i]}</div>
            <div style={{ fontSize: 44, fontWeight: 600, color: v.startsWith('+') ? C.brand : C.ink, marginTop: 10, letterSpacing: -1 }}>{v} <span style={{ fontSize: 28, fontWeight: 500, color: C.inkFaint }}>pts</span></div>
          </div>
        );
      })}
      {/* The cell that turns red, lifts out and becomes the case. */}
      <div style={{
        position: 'absolute', left: L(hx, cx), top: L(hy, cy), width: L(TW, cw), height: L(TH, ch), borderRadius: L(16, 26),
        background: interpolate(red, [0, 1], [0, 1]) > 0.5 ? C.crit : C.paper, border: `1px solid ${red > 0.5 ? C.crit : C.line}`,
        boxShadow: `0 ${40 * lift}px ${80 * lift}px -${30 * lift}px rgba(120,30,20,${0.45 * lift})`, padding: `${L(20, 40)}px ${L(24, 46)}px`,
        boxSizing: 'border-box', fontFamily: F.sans, color: red > 0.5 ? '#fff' : C.ink, opacity: gridIn, overflow: 'hidden',
        filter: `saturate(${1 - still * 0.55})`,
      }}>
        <div style={{ position: 'absolute', inset: 0, background: C.paper, opacity: 1 - red }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: L(28, 34), fontWeight: 500, opacity: 0.92 }}>Rampur{lift > 0.5 ? ' cluster' : ''}</div>
          <div style={{ fontSize: L(44, 120), fontWeight: 600, letterSpacing: L(-1, -4), lineHeight: 1.05, marginTop: L(10, 14) }}>
            −18 <span style={{ fontSize: L(28, 52), fontWeight: 500 }}>pts</span>
          </div>
          <div style={{ fontSize: L(22, 36), opacity: lift, marginTop: 8, fontWeight: 500 }}>Class 3 subtraction · 65.7% → 47.7%</div>
        </div>
        <div style={{ position: 'absolute', right: 34, top: 34, fontSize: 30, fontWeight: 600, opacity: still, padding: '6px 16px', borderRadius: 99, background: 'rgba(255,255,255,0.18)' }}>Day {days}</div>
      </div>
    </div>
  );
};

const NothingHappens: React.FC = () => {
  const a = useSpring(s(7.2), 22);
  const b = useSpring(s(8.0), 22);
  return (
    <div style={{ position: 'absolute', left: 1010, top: 380, fontFamily: F.serif, color: C.ink }}>
      <div style={{ fontSize: 76, opacity: a, transform: `translateY(${(1 - a) * 16}px)`, color: C.inkSoft }}>And then…</div>
      <div style={{ fontSize: 108, opacity: b, transform: `translateY(${(1 - b) * 16}px)`, letterSpacing: -2, marginTop: 6 }}>nothing happens.</div>
    </div>
  );
};

const STEPS = [
  { t: 'UDISE+', sub: 'schools' },
  { t: 'NAS · PRS', sub: 'tests' },
  { t: 'VSK', sub: 'dashboards' },
  { t: 'NIPUN apps', sub: 'tracking' },
  { t: 'Alert', sub: 'a red cell', alert: true },
];
const MISSING = [
  { t: 'Owner', at: 13.2 },
  { t: 'Deadline', at: 14.1 },
  { t: 'Proof', at: 15.1 },
  { t: 'Re-tested', at: 16.0 },
];

const Staircase: React.FC = () => {
  const frame = useCurrentFrame();
  const head = useSpring(s(9.2), 20);
  const SW = 182; const SG = 10; const X0 = 140; const BASE = 860; const RISE = 48;
  const alertPulse = interpolate(frame, [s(10.6), s(11.2), s(12.0)], [0, 1, 0.35], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const stop = useIn(s(10.6), 16);
  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: F.sans }}>
      <div style={{ position: 'absolute', left: X0, top: 110, opacity: head, transform: `translateY(${(1 - head) * 12}px)` }}>
        <Kicker>~6,800 block education officers</Kicker>
        <div style={{ fontFamily: F.serif, fontSize: 64, color: C.ink, marginTop: 14, letterSpacing: -1.2 }}>
          Officers have data. <span style={{ color: C.crit, opacity: stop }}>Every system stops at the alert.</span>
        </div>
      </div>
      {[...STEPS, ...MISSING.map((m) => ({ t: m.t, sub: '', missing: true, at: m.at }))].map((st, i) => {
        const missing = 'missing' in st;
        const at = missing ? s((st as { at: number }).at) : s(9.5 + i * 0.28);
        const p = interpolate(frame, [at, at + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
        const h = 150 + i * RISE;
        const x = X0 + i * (SW + SG);
        const alert = 'alert' in st;
        return (
          <div key={st.t} style={{
            position: 'absolute', left: x, top: BASE - h, width: SW, height: h * p, overflow: 'hidden', borderRadius: '14px 14px 4px 4px',
            background: missing ? 'transparent' : alert ? C.crit : i % 2 ? C.navy800 : '#22365C',
            border: missing ? `2.5px dashed ${C.lineStrong}` : 'none', boxSizing: 'border-box', opacity: missing ? p : 1,
            boxShadow: alert ? `0 0 0 ${10 * alertPulse}px rgba(185,75,62,0.18)` : 'none',
          }}>
            <div style={{ padding: '18px 18px', color: missing ? C.inkFaint : '#fff' }}>
              <div style={{ fontSize: 30, fontWeight: 600 }}>{st.t}</div>
              {st.sub ? <div style={{ fontSize: 28, opacity: 0.75, marginTop: 4 }}>{st.sub}</div> : <div style={{ fontSize: 28, marginTop: 4 }}>—</div>}
            </div>
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: X0, top: BASE + 8, width: 9 * (SW + SG) - SG, height: 3, background: C.lineStrong }} />
      <div style={{
        position: 'absolute', left: X0 + 5 * (SW + SG), top: BASE + 26, fontSize: 30, color: C.inkFaint, opacity: useIn(s(13.2), 14),
      }}>Nobody records these.</div>
    </div>
  );
};

export const S01Challenge: React.FC = () => {
  const frame = useCurrentFrame();
  const partA = interpolate(frame, [s(9.0), s(9.5)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  return (
    <SceneFade dur={s(20)} fadeIn={10}>
      <div style={{ position: 'absolute', inset: 0, opacity: partA }}>
        <Grid />
        <NothingHappens />
      </div>
      {frame > s(8.9) ? <Staircase /> : null}
    </SceneFade>
  );
};
