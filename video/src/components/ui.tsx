import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, EASE, F } from '../theme';

/** 0 → 1 from frame `at`, eased over `dur` frames (no overshoot). */
export function useIn(at: number, dur = 16) {
  const frame = useCurrentFrame();
  return interpolate(frame, [at, at + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
}

/** A soft spring that settles without bouncing. */
export function useSpring(at: number, durationInFrames = 20) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - at, fps, config: { damping: 200, mass: 0.8 }, durationInFrames });
}

/** Fades a whole scene in and out (calm cross-dissolve on the ivory ground). */
export const SceneFade: React.FC<{ dur: number; fadeIn?: number; fadeOut?: number; children: React.ReactNode }> = ({ dur, fadeIn = 14, fadeOut = 14, children }) => {
  const frame = useCurrentFrame();
  const o = Math.min(
    fadeIn ? interpolate(frame, [0, fadeIn], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE }) : 1,
    fadeOut ? interpolate(frame, [dur - fadeOut, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE }) : 1,
  );
  return <div style={{ position: 'absolute', inset: 0, opacity: o }}>{children}</div>;
};

/** The app's mark: a rising line that ends in a check. `draw` 0→1 animates the strokes. */
export const Logo: React.FC<{ size?: number; draw?: number }> = ({ size = 64, draw = 1 }) => {
  const a = Math.min(1, draw * 1.6);
  const b = Math.max(0, Math.min(1, (draw - 0.55) / 0.45));
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill={C.brand} />
      <path d="M7 20.5 12 15.5l4 3.5 4.5-6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        pathLength={1} strokeDasharray="1" strokeDashoffset={1 - a} />
      <path d="m19.5 21 2.5 2.5 4.5-5" fill="none" stroke={C.brandMint} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        pathLength={1} strokeDasharray="1" strokeDashoffset={1 - b} />
    </svg>
  );
};

export const CheckIcon: React.FC<{ size?: number; color?: string; progress?: number }> = ({ size = 28, color = '#fff', progress = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"
      pathLength={1} strokeDasharray="1" strokeDashoffset={1 - progress} />
  </svg>
);

/**
 * A soft label that points at something. `x, y` is the label's anchor on the canvas
 * (`align` says which side of the label the anchor is); `target` is the point it points to.
 */
export const Callout: React.FC<{
  at: number; until?: number; x: number; y: number; text: React.ReactNode; target?: { x: number; y: number };
  align?: 'left' | 'right' | 'center'; tone?: 'brand' | 'crit' | 'ink'; icon?: 'check' | 'dot' | 'spark';
}> = ({ at, until, x, y, text, target, align = 'left', tone = 'brand', icon = 'dot' }) => {
  const frame = useCurrentFrame();
  const inP = useSpring(at, 18);
  const out = until ? interpolate(frame, [until - 10, until], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  const o = inP * out;
  if (o <= 0.001) return null;
  const col = tone === 'crit' ? C.crit : tone === 'ink' ? C.ink : C.brand;
  const tx = align === 'left' ? '0%' : align === 'right' ? '-100%' : '-50%';
  const line = interpolate(frame, [at + 4, at + 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  // The connector leaves from the label's nearest edge (width estimated from the text).
  const estW = (typeof text === 'string' ? text.length * 15.5 : 360) + 90;
  const left = align === 'left' ? x : align === 'right' ? x - estW : x - estW / 2;
  const ox = target ? Math.min(Math.max(target.x, left + 40), left + estW - 40) : x;
  const oy = target ? (target.y < y ? y - 32 : y + 32) : y;
  return (
    <>
      {target ? (
        <svg style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, pointerEvents: 'none', opacity: o, overflow: 'visible' }}>
          <line x1={ox} y1={oy} x2={ox + (target.x - ox) * line} y2={oy + (target.y - oy) * line} stroke={col} strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={target.x} cy={target.y} r={15 * line} fill={`${col}14`} stroke={col} strokeWidth={2.5} />
        </svg>
      ) : null}
      <div style={{
        position: 'absolute', left: x, top: y, transform: `translate(${tx}, -50%) translateY(${(1 - inP) * 14}px)`, opacity: o,
        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 24px 14px 18px', borderRadius: 999,
        background: 'rgba(255,255,255,0.97)', border: `1.5px solid ${tone === 'crit' ? '#E9C3BD' : '#CFE3E1'}`,
        boxShadow: '0 18px 40px -14px rgba(16,30,56,0.35), 0 2px 6px -2px rgba(16,30,56,0.10)',
        fontFamily: F.sans, fontSize: 30, fontWeight: 500, color: C.ink, whiteSpace: 'nowrap', letterSpacing: -0.2,
      }}>
        {icon === 'check' ? (
          <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 99, background: col }}><CheckIcon size={22} /></span>
        ) : icon === 'spark' ? (
          <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 9, background: col }}>
            <svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" fill="#fff" /></svg>
          </span>
        ) : (
          <span style={{ width: 14, height: 14, borderRadius: 99, background: col, boxShadow: `0 0 0 6px ${col}22` }} />
        )}
        <span>{text}</span>
      </div>
    </>
  );
};

/** A browser window drawn in CSS around the footage. */
export const BrowserFrame: React.FC<{ x: number; y: number; w: number; h: number; url: string; children: React.ReactNode }> = ({ x, y, w, h, url, children }) => {
  const bar = 58;
  return (
    <div style={{
      position: 'absolute', left: x, top: y, width: w, height: h + bar, borderRadius: 16, overflow: 'hidden', background: C.paper,
      boxShadow: '0 40px 80px -30px rgba(16,30,56,0.45), 0 0 0 1px rgba(16,30,56,0.08)',
    }}>
      <div style={{ height: bar, background: C.paperDeep, display: 'flex', alignItems: 'center', padding: '0 22px', gap: 10, borderBottom: `1px solid ${C.line}` }}>
        {['#E2A39A', '#E7CB8F', '#A9CDA8'].map((c) => <span key={c} style={{ width: 15, height: 15, borderRadius: 99, background: c }} />)}
        <div style={{
          marginLeft: 26, flex: 1, maxWidth: 720, height: 40, borderRadius: 10, background: C.paper, display: 'flex', alignItems: 'center', gap: 10,
          padding: '0 16px', fontFamily: F.sans, fontSize: 28, color: C.inkSoft, border: `1px solid ${C.line}`,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke={C.inkFaint} strokeWidth="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke={C.inkFaint} strokeWidth="2" /></svg>
          <span style={{ color: C.ink }}>karyavahi.onrender.com</span><span>{url}</span>
        </div>
      </div>
      <div style={{ position: 'relative', width: w, height: h, overflow: 'hidden', background: C.ivory }}>{children}</div>
    </div>
  );
};

/** A phone drawn in CSS. The screen is `w × h` canvas pixels. */
export const PhoneFrame: React.FC<{ x: number; y: number; w: number; h: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ x, y, w, h, children, style }) => {
  const b = 14;
  return (
    <div style={{
      position: 'absolute', left: x - b, top: y - b, width: w + b * 2, height: h + b * 2, borderRadius: 58, background: '#0E1626',
      boxShadow: '0 50px 90px -30px rgba(16,30,56,0.55), inset 0 0 0 2px #2A3550', ...style,
    }}>
      <div style={{ position: 'absolute', left: b, top: b, width: w, height: h, borderRadius: 44, overflow: 'hidden', background: C.ivory }}>
        {children}
      </div>
      <div style={{ position: 'absolute', left: '50%', top: b + 10, width: 92, height: 26, transform: 'translateX(-50%)', borderRadius: 99, background: '#0E1626' }} />
    </div>
  );
};

/** Small uppercase kicker above a title. */
export const Kicker: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = C.brand, style }) => (
  <div style={{ fontFamily: F.sans, fontSize: 28, fontWeight: 600, letterSpacing: 2.4, textTransform: 'uppercase', color, ...style }}>{children}</div>
);
