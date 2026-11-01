import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { Kicker, Logo, SceneFade, useIn, useSpring } from '../components/ui';
import { C, EASE, F, s } from '../theme';

/** 07 · Next, and close (2:35–3:00). One roadmap line, then the end card. Times: seconds from 2:35. */
const NODES = [
  { at: 0.3, when: 'Now · Nov 2026', t: 'Live on real UDISE+ schools', sub: 'English + हिन्दी · WhatsApp · voice' },
  { at: 1.3, when: 'Next · Q1 2027', t: 'Pilot in one district', sub: "with the state's own data" },
  { at: 4.9, when: 'Then · H2 2027', t: 'State-wide', sub: 'multi-district, state dashboards' },
];
const PLUGS = ['UDISE+', 'State VSK', 'NAS · PRS', 'PAB', 'WhatsApp', 'IVR'];

const Roadmap: React.FC = () => {
  const frame = useCurrentFrame();
  const head = useSpring(s(0.1), 20);
  const X0 = 200; const X1 = 1720; const Y = 470;
  const line = interpolate(frame, [s(0.3), s(5.2)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const plugs = useIn(s(3.2), 14);
  return (
    <>
      <div style={{ position: 'absolute', left: X0, top: 150, opacity: head }}>
        <Kicker>What comes next</Kicker>
        <div style={{ fontFamily: F.serif, fontSize: 60, color: C.ink, marginTop: 12, letterSpacing: -1.2 }}>From one district to the state.</div>
      </div>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <line x1={X0} y1={Y} x2={X1} y2={Y} stroke={C.line} strokeWidth={4} strokeLinecap="round" />
        <line x1={X0} y1={Y} x2={X0 + (X1 - X0) * line} y2={Y} stroke={C.brand} strokeWidth={5} strokeLinecap="round" />
      </svg>
      {NODES.map((n, i) => {
        const x = X0 + ((X1 - X0) * i) / (NODES.length - 1);
        const p = useSpring(s(n.at), 20);
        const align = i === 0 ? 'left' : i === NODES.length - 1 ? 'right' : 'center';
        const tx = align === 'left' ? '-22px' : align === 'right' ? 'calc(-100% + 22px)' : '-50%';
        return (
          <React.Fragment key={n.when}>
            <div style={{ position: 'absolute', left: x - 18, top: Y - 18, width: 36, height: 36, borderRadius: 99, background: p > 0.5 ? C.brand : C.paper, border: `4px solid ${p > 0.5 ? C.brand : C.lineStrong}`, boxSizing: 'border-box', boxShadow: `0 0 0 ${8 * p}px ${C.brandLight}` }} />
            <div style={{ position: 'absolute', left: x, top: Y + 44, transform: `translateX(${tx}) translateY(${(1 - p) * 14}px)`, opacity: p, textAlign: align, fontFamily: F.sans, width: 520 }}>
              <div style={{ fontSize: 28, fontWeight: 600, color: C.brand, letterSpacing: 1.6, textTransform: 'uppercase' }}>{n.when}</div>
              <div style={{ fontFamily: F.serif, fontSize: 46, color: C.ink, marginTop: 6 }}>{n.t}</div>
              <div style={{ fontSize: 30, color: C.inkSoft, marginTop: 4 }}>{n.sub}</div>
            </div>
          </React.Fragment>
        );
      })}
      <div style={{ position: 'absolute', left: X0, top: 800, display: 'flex', alignItems: 'center', gap: 12, opacity: plugs, fontFamily: F.sans }}>
        <span style={{ fontSize: 28, fontWeight: 600, color: C.ink, marginRight: 6 }}>Plugs into</span>
        {PLUGS.map((p) => <span key={p} style={{ padding: '6px 16px', borderRadius: 99, border: `1.5px solid ${C.line}`, background: C.paper, fontSize: 28, color: C.inkSoft }}>{p}</span>)}
      </div>
    </>
  );
};

const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const at = s(6.4);
  const logo = interpolate(frame, [at, at + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const name = useSpring(at + 8, 24);
  const beats = [7.8, 9.3, 10.9].map((t) => useSpring(s(t), 18));
  const close = useSpring(s(12.4), 24);
  const url = useSpring(s(15.0), 22);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: F.sans, paddingBottom: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 30, opacity: Math.min(1, logo * 2) }}>
        <Logo size={120} draw={logo} />
        <div style={{ opacity: name, transform: `translateX(${(1 - name) * -14}px)` }}>
          <div style={{ fontFamily: F.serif, fontSize: 120, color: C.ink, letterSpacing: -3, lineHeight: 1 }}>Karyavahi</div>
          <div style={{ fontSize: 50, color: C.inkSoft, marginTop: 6, fontWeight: 500 }}>कार्यवाही</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 34, marginTop: 70, fontFamily: F.serif, fontSize: 58, letterSpacing: -1 }}>
        {['AI drafts.', 'Officers decide.', 'The ledger proves.'].map((t, i) => (
          <span key={t} style={{ opacity: beats[i], transform: `translateY(${(1 - beats[i]) * 16}px)`, color: i === 2 ? C.brand : C.ink }}>{t}</span>
        ))}
      </div>
      <div style={{ marginTop: 34, fontSize: 40, color: C.inkSoft, opacity: close, transform: `translateY(${(1 - close) * 10}px)` }}>
        Close a case only when <span style={{ color: C.ink, fontWeight: 600, boxShadow: `inset 0 -12px 0 ${C.brandLight}` }}>children learn more</span>.
      </div>
      <div style={{ marginTop: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, opacity: url }}>
        <div style={{ padding: '14px 34px', borderRadius: 99, background: C.navy950, color: '#fff', fontSize: 38, fontWeight: 500, letterSpacing: 0.3 }}>karyavahi.onrender.com</div>
        <div style={{ fontSize: 28, color: C.inkFaint }}>Fictional demo data · not government statistics</div>
      </div>
    </div>
  );
};

export const S07Close: React.FC = () => {
  const frame = useCurrentFrame();
  const a = interpolate(frame, [s(6.0), s(6.4)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  return (
    <SceneFade dur={s(25)} fadeOut={0}>
      {frame < s(6.5) ? <div style={{ position: 'absolute', inset: 0, opacity: a }}><Roadmap /></div> : null}
      {frame >= s(6.2) ? <EndCard /> : null}
    </SceneFade>
  );
};
