import React from 'react';
import { Audio, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import audio from '../generated/audio.json';
import { BLOCKS, C, EASE, F, FPS, s } from '../theme';
import { CheckIcon } from './ui';

/**
 * Narration. Each block's clip starts at the block's time mark. src/generated/audio.json says
 * which file each block uses (your recording if it exists, else the temp voice); it is written by
 * scripts/prepare-audio.cjs.
 */
export const Narration: React.FC = () => {
  const full = audio.full as null | { src: string };
  if (full) return <Audio src={staticFile(full.src)} />;
  return (
    <>
      {BLOCKS.map((b) => {
        const a = (audio.blocks as Record<string, { src: string | null; lead: number }>)[b.id];
        if (!a?.src) return null;
        return (
          <Sequence key={b.id} from={s(b.start + a.lead)} durationInFrames={s(b.end - b.start - a.lead)} layout="none">
            <Audio src={staticFile(a.src)} />
          </Sequence>
        );
      })}
    </>
  );
};

/** Burned-in captions, bottom centre, from the script (split at "/"). Hidden where the close card shows the same words. */
export const Captions: React.FC<{ hideFrom?: number }> = ({ hideFrom = Infinity }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cap = audio.captions.find((c) => t >= c.start && t < c.end);
  if (!cap || frame >= hideFrom) return null;
  const o = Math.min(
    interpolate(t, [cap.start, cap.start + 0.18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    interpolate(t, [cap.end - 0.15, cap.end], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  );
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 34, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{
        maxWidth: 1500, padding: '12px 30px 14px', borderRadius: 18, background: 'rgba(11,21,41,0.82)', color: '#fff',
        fontFamily: F.sans, fontSize: 36, fontWeight: 500, lineHeight: 1.32, textAlign: 'center', opacity: o, letterSpacing: -0.1,
      }}>{cap.text}</div>
    </div>
  );
};

/** What every alert was missing (scene 01) — filled in as the product shows each one. */
export const HUD_ITEMS = ['Owner + deadline', 'Proof checked by someone else', 'Closes only on a measured gain', 'Reopens if no gain'];

export const Hud: React.FC<{ doneAt: number[]; showFrom: number; showUntil: number }> = ({ doneAt, showFrom, showUntil }) => {
  const frame = useCurrentFrame();
  const o = Math.min(
    interpolate(frame, [showFrom, showFrom + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE }),
    interpolate(frame, [showUntil - 14, showUntil], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE }),
  );
  if (o <= 0) return null;
  return (
    <div style={{ position: 'absolute', top: 24, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 34, opacity: o, fontFamily: F.sans }}>
      {HUD_ITEMS.map((label, i) => {
        const p = interpolate(frame, [doneAt[i], doneAt[i] + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 28, fontWeight: 500, color: p > 0.5 ? C.ink : C.inkFaint }}>
            <span style={{
              position: 'relative', width: 32, height: 32, borderRadius: 99, display: 'grid', placeItems: 'center',
              border: `2px dashed ${C.lineStrong}`, background: `rgba(22,125,120,${p})`, borderColor: p > 0.05 ? C.brand : C.lineStrong,
              borderStyle: p > 0.05 ? 'solid' : 'dashed', transform: `scale(${1 + Math.sin(p * Math.PI) * 0.18})`,
            }}><CheckIcon size={20} progress={p} /></span>
            {label}
          </div>
        );
      })}
    </div>
  );
};
