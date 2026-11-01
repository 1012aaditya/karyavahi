import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { CheckIcon, Logo, SceneFade, useIn, useSpring } from '../components/ui';
import { C, EASE, F, s } from '../theme';

/**
 * 02 · Our answer (0:20–0:32). The red cell becomes a case at the centre of a loop:
 * flag → diagnose → plan → approve → act → verify, with a marker travelling the ring in time
 * with the words. The loop only closes on a measured gain.
 * Times are seconds from the start of this block.
 */
const STEPS = ['Flag', 'Diagnose', 'Plan', 'Approve', 'Act', 'Verify'];
const CX = 1250; const CY = 530; const R = 290;
const STEP_AT = [3.2, 3.85, 4.5, 5.15, 5.8, 6.45];

export const S02Answer: React.FC = () => {
  const frame = useCurrentFrame();
  const title = useSpring(s(0.3), 22);
  const ring = interpolate(frame, [s(2.6), s(3.4)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  // The marker: around the ring with the words, then the last stretch back to the top as the case closes.
  const markerT = interpolate(frame, [s(3.2), s(6.45), s(7.4), s(10.2)], [0, 5 / 6, 5 / 6, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const ang = -Math.PI / 2 + markerT * Math.PI * 2;
  const closed = useIn(s(10.0), 16);
  const closesText = useSpring(s(7.4), 22);
  const caseIn = useSpring(s(0.4), 24);

  return (
    <SceneFade dur={s(12)}>
      {/* Left column: the sentence. */}
      <div style={{ position: 'absolute', left: 140, top: 250, width: 620, opacity: title, transform: `translateY(${(1 - title) * 14}px)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Logo size={64} draw={useIn(s(0.2), 30)} />
          <span style={{ fontFamily: F.serif, fontSize: 52, color: C.ink }}>Karyavahi</span>
        </div>
        <div style={{ fontFamily: F.serif, fontSize: 66, lineHeight: 1.12, color: C.ink, marginTop: 40, letterSpacing: -1.4 }}>
          turns every learning drop into a <span style={{ color: C.brand }}>case</span>.
        </div>
        <div style={{ fontFamily: F.sans, fontSize: 36, lineHeight: 1.4, color: C.inkSoft, marginTop: 42, opacity: closesText, transform: `translateY(${(1 - closesText) * 10}px)` }}>
          It closes only when the next assessment shows <span style={{ color: C.ink, fontWeight: 600, boxShadow: `inset 0 -10px 0 ${C.brandLight}` }}>children learned more</span>.
        </div>
      </div>

      {/* The loop. */}
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0 }}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke={C.line} strokeWidth={3} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - ring} transform={`rotate(-90 ${CX} ${CY})`} />
        <circle cx={CX} cy={CY} r={R} fill="none" stroke={C.brand} strokeWidth={5} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - markerT} transform={`rotate(-90 ${CX} ${CY})`} strokeLinecap="round" />
        {markerT > 0 ? <circle cx={CX + R * Math.cos(ang)} cy={CY + R * Math.sin(ang)} r={13} fill={C.brand} stroke="#fff" strokeWidth={4} /> : null}
      </svg>
      {STEPS.map((st, i) => {
        const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
        const x = CX + R * Math.cos(a); const y = CY + R * Math.sin(a);
        const on = interpolate(frame, [s(STEP_AT[i]), s(STEP_AT[i]) + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const vis = interpolate(frame, [s(2.6 + i * 0.08), s(2.6 + i * 0.08) + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const lx = x + Math.cos(a) * 70; const ly = y + Math.sin(a) * 58;
        const align = Math.cos(a) > 0.3 ? 'left' : Math.cos(a) < -0.3 ? 'right' : 'center';
        return (
          <React.Fragment key={st}>
            <div style={{
              position: 'absolute', left: x - 22, top: y - 22, width: 44, height: 44, borderRadius: 99, opacity: vis,
              background: on > 0.5 ? C.brand : C.paper, border: `3px solid ${on > 0.5 ? C.brand : C.lineStrong}`, boxSizing: 'border-box',
              display: 'grid', placeItems: 'center', fontFamily: F.sans, fontSize: 28, fontWeight: 600, color: on > 0.5 ? '#fff' : C.inkFaint,
            }}>{i + 1}</div>
            <div style={{
              position: 'absolute', left: lx, top: ly, transform: `translate(${align === 'left' ? '0' : align === 'right' ? '-100%' : '-50%'}, -50%)`,
              fontFamily: F.sans, fontSize: 36, fontWeight: 600, opacity: vis, color: interpolate(on, [0, 1], [0, 1]) > 0.5 ? C.ink : C.inkFaint,
            }}>{st}</div>
          </React.Fragment>
        );
      })}

      {/* The case at the centre. */}
      <div style={{
        position: 'absolute', left: CX - 220, top: CY - 112, width: 440, height: 224, borderRadius: 22, boxSizing: 'border-box', padding: '26px 30px',
        background: closed > 0.5 ? C.brand : C.paper, border: `1.5px solid ${closed > 0.5 ? C.brand : C.line}`, fontFamily: F.sans,
        boxShadow: '0 30px 60px -28px rgba(16,30,56,0.35)', opacity: caseIn, transform: `scale(${0.9 + caseIn * 0.1})`,
        color: closed > 0.5 ? '#fff' : C.ink,
      }}>
        <div style={{ fontSize: 28, fontWeight: 600, color: closed > 0.5 ? C.brandMint : C.inkFaint, letterSpacing: 0.5 }}>CASE-0184</div>
        <div style={{ fontSize: 32, fontWeight: 600, marginTop: 8, lineHeight: 1.2 }}>Class 3 subtraction · Rampur</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, fontSize: 30, fontWeight: 600 }}>
          {closed > 0.5 ? (<><CheckIcon size={30} progress={closed} /> Closed · learning up</>) : (<span style={{ color: C.crit }}>−18 pts · open</span>)}
        </div>
      </div>
    </SceneFade>
  );
};
