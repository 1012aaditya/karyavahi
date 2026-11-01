import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { CheckIcon, Kicker, SceneFade, useIn, useSpring } from '../components/ui';
import { C, EASE, F, s } from '../theme';

/**
 * 06 · Why you can trust it (2:10–2:35). The five layers from the deck build up; the LLM lives in
 * Layer 2 only; guardrail chips light as the narration names them; real public data feeds Layer 1;
 * then the test counters. Times are seconds from 2:10.
 */
type Chip = { t: string; at?: number };
const LAYERS: { id: string; name: string; chips: Chip[]; llm?: boolean }[] = [
  { id: 'L5', name: 'Output', chips: [{ t: 'Case page' }, { t: 'Map of schools' }, { t: 'WhatsApp tasks' }, { t: 'Reports' }] },
  { id: 'L4', name: 'Evaluation', chips: [{ t: 'Data-quality gates' }, { t: 'Pre-registered DiD' }, { t: 'Every draft logged', at: 5.6 }, { t: 'Tamper-evident audit', at: 9.3 }] },
  { id: 'L3', name: 'Guardrails', chips: [{ t: 'Scoped context only', at: 2.6 }, { t: 'Cite a row or refuse', at: 5.2 }, { t: 'AI-drafted labels', at: 5.7 }, { t: 'Human sign-off', at: 7.0 }] },
  { id: 'L2', name: 'Processing', llm: true, chips: [{ t: 'Drop detector · code' }, { t: 'Claude: diagnosis draft', at: 0.6 }, { t: 'Claude: cited answers', at: 0.9 }, { t: 'Claude: digests', at: 1.2 }] },
  { id: 'L1', name: 'Data input', chips: [{ t: 'Assessment rounds' }, { t: 'School context' }, { t: 'Field proof' }, { t: 'WhatsApp replies' }] },
];
const SOURCES = ['UDISE+', 'PRS 2024', 'ASER 2024', 'NFHS-5', 'UP PAB 2025-26', 'PGI-D', 'OpenStreetMap'];
const ROLES = ['Block officer', 'District officer', 'CRC', 'BRC', 'Headmaster', 'State team', 'Auditor'];

const X = 140; const W = 1640; const TOP = 262; const BH = 100; const BG = 14;

const ChipView: React.FC<{ c: Chip; llm?: boolean }> = ({ c, llm }) => {
  const frame = useCurrentFrame();
  const lit = c.at === undefined ? 0 : interpolate(frame, [s(c.at), s(c.at) + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const claude = llm && c.t.startsWith('Claude');
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 99, fontFamily: F.sans, fontSize: 28, fontWeight: 500,
      whiteSpace: 'nowrap', border: `1.5px solid ${lit > 0.5 ? C.brand : C.line}`,
      background: lit > 0.5 ? (claude ? C.brand : C.brandLight) : C.paper, color: lit > 0.5 ? (claude ? '#fff' : C.brandDark) : C.inkSoft,
      transform: `scale(${1 + Math.sin(lit * Math.PI) * 0.06})`,
    }}>
      {lit > 0.5 && !claude ? <span style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 99, background: C.brand }}><CheckIcon size={18} progress={lit} /></span> : null}
      {c.t}
    </span>
  );
};

const Stack: React.FC = () => {
  const frame = useCurrentFrame();
  const l1Glow = useIn(s(13.4), 14);
  return (
    <>
      {LAYERS.map((L, i) => {
        const order = LAYERS.length - 1 - i; // build bottom-up
        const p = interpolate(frame, [s(0.2 + order * 0.16), s(0.2 + order * 0.16) + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
        const glow = L.id === 'L1' ? l1Glow : 0;
        return (
          <div key={L.id} style={{
            position: 'absolute', left: X, top: TOP + i * (BH + BG), width: W, height: BH, borderRadius: 18, boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', gap: 26, padding: '0 26px', opacity: p, transform: `translateY(${(1 - p) * 26}px)`,
            background: L.llm ? '#F1F8F7' : C.paper, border: `${L.llm ? 2.5 : 1.5}px solid ${L.llm || glow > 0.5 ? C.brand : C.line}`,
            boxShadow: L.llm ? '0 20px 40px -26px rgba(22,125,120,0.6)' : 'none',
          }}>
            <div style={{ width: 300, flex: '0 0 auto', fontFamily: F.sans }}>
              <div style={{ fontSize: 28, fontWeight: 600, color: L.llm ? C.brand : C.inkFaint, letterSpacing: 1 }}>
                {L.id}{L.llm ? ' · LLM only here' : ''}
              </div>
              <div style={{ fontSize: 34, fontWeight: 600, color: C.ink, marginTop: -2 }}>{L.name}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'nowrap' }}>{L.chips.map((c) => <ChipView key={c.t} c={c} llm={L.llm} />)}</div>
          </div>
        );
      })}
      {/* Real public data feeding Layer 1. */}
      <div style={{ position: 'absolute', left: X, top: TOP + 5 * (BH + BG) + 6, display: 'flex', alignItems: 'center', gap: 12, fontFamily: F.sans }}>
        <span style={{ fontSize: 28, fontWeight: 600, color: C.ink, opacity: useIn(s(13.2), 12), marginRight: 6 }}>Real public data →</span>
        {SOURCES.map((t, i) => {
          const p = interpolate(frame, [s(13.4 + i * 0.22), s(13.4 + i * 0.22) + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
          return (
            <span key={t} style={{
              padding: '6px 16px', borderRadius: 10, fontSize: 28, fontWeight: 600, background: C.navy800, color: '#fff', opacity: p,
              transform: `translateY(${(1 - p) * 12}px)`, whiteSpace: 'nowrap',
            }}>{t}</span>
          );
        })}
      </div>
    </>
  );
};

const Counter: React.FC<{ at: number; to: number; label: string; good?: boolean }> = ({ at, to, label, good }) => {
  const frame = useCurrentFrame();
  const p = useSpring(s(at), 22);
  const n = Math.round(interpolate(frame, [s(at), s(at + 1.1)], [0, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE }));
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 18}px)`, width: 470 }}>
      <div style={{ fontFamily: F.serif, fontSize: 150, lineHeight: 1, color: good ? C.brand : C.ink, letterSpacing: -4 }}>{n.toLocaleString('en-IN')}</div>
      <div style={{ fontFamily: F.sans, fontSize: 36, color: C.inkSoft, marginTop: 14 }}>{label}</div>
    </div>
  );
};

export const S06Trust: React.FC = () => {
  const frame = useCurrentFrame();
  const head = useSpring(s(0.1), 22);
  const toB = interpolate(frame, [s(17.3), s(17.9)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const roles = useIn(s(20.0), 14);
  return (
    <SceneFade dur={s(25)}>
      <div style={{ position: 'absolute', inset: 0, opacity: 1 - toB, transform: `translateY(${-toB * 30}px)` }}>
        <div style={{ position: 'absolute', left: X, top: 92, opacity: head, transform: `translateY(${(1 - head) * 12}px)` }}>
          <Kicker>Why you can trust it</Kicker>
          <div style={{ fontFamily: F.serif, fontSize: 60, color: C.ink, marginTop: 12, letterSpacing: -1.2 }}>
            Claude drafts in one layer. Code and people decide.
          </div>
        </div>
        <Stack />
      </div>
      {frame >= s(17.3) ? (
        <div style={{ position: 'absolute', inset: 0, opacity: toB }}>
          <div style={{ position: 'absolute', left: X, top: 150 }}>
            <Kicker>Tested end to end</Kicker>
            <div style={{ fontFamily: F.serif, fontSize: 60, color: C.ink, marginTop: 12, letterSpacing: -1.2 }}>Every claim is checked by a script.</div>
          </div>
          <div style={{ position: 'absolute', left: X, top: 360, display: 'flex', gap: 80 }}>
            <Counter at={17.9} to={20} label="test suites" />
            <Counter at={18.3} to={1752} label="pages crawled" />
            <Counter at={18.7} to={0} label="failures" good />
          </div>
          <div style={{ position: 'absolute', left: X, top: 760, display: 'flex', alignItems: 'center', gap: 12, opacity: roles, fontFamily: F.sans }}>
            <span style={{ fontSize: 30, fontWeight: 600, color: C.ink, marginRight: 8 }}>Every page, every role:</span>
            {ROLES.map((r, i) => {
              const p = interpolate(frame, [s(20.2 + i * 0.12), s(20.2 + i * 0.12) + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
              return <span key={r} style={{ padding: '6px 16px', borderRadius: 99, border: `1.5px solid ${C.line}`, background: C.paper, fontSize: 28, color: C.inkSoft, opacity: p, whiteSpace: 'nowrap' }}>{r}</span>;
            })}
          </div>
        </div>
      ) : null}
    </SceneFade>
  );
};
