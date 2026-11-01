import React from 'react';
import { useCurrentFrame } from 'remotion';
import { s } from '../theme';
import { Footage, pointAt, type Seg } from './Footage';
import { BrowserFrame, Callout } from './ui';

/** Where the browser window sits on the canvas (leaves room for the strip above and captions below). */
export const FRAME = { x: 258, y: 92, w: 1404, h: 790, bar: 58 };
const OX = FRAME.x; const OY = FRAME.y + FRAME.bar;

export type Note = {
  at: number; until?: number; text: React.ReactNode;
  x: number; y: number; align?: 'left' | 'right' | 'center';
  /** A point in the recording (clip pixels) the label points to; follows the camera. */
  target?: [number, number];
  icon?: 'check' | 'dot' | 'spark'; tone?: 'brand' | 'crit' | 'ink';
};

/** Desktop footage in a browser window, with labels that point into it. Times in seconds of the scene. */
export const ProductShot: React.FC<{ segs: Seg[]; notes: Note[]; urls: { at: number; url: string }[] }> = ({ segs, notes, urls }) => {
  const frame = useCurrentFrame();
  const url = [...urls].reverse().find((u) => frame >= s(u.at))?.url ?? urls[0].url;
  return (
    <>
      <BrowserFrame x={FRAME.x} y={FRAME.y} w={FRAME.w} h={FRAME.h} url={url}>
        <Footage segs={segs} vw={FRAME.w} vh={FRAME.h} />
      </BrowserFrame>
      {notes.map((n, i) => {
        if (frame < s(n.at) - 1) return null;
        if (n.until && frame > s(n.until)) return null;
        const t = n.target ? pointAt(segs, frame, FRAME.w, FRAME.h, OX, OY, n.target[0], n.target[1]) : undefined;
        return <Callout key={i} at={s(n.at)} until={n.until ? s(n.until) : undefined} x={n.x} y={n.y} text={n.text} target={t} align={n.align} icon={n.icon} tone={n.tone} />;
      })}
    </>
  );
};

/** Seconds-based segment spec → frames. */
export const sec = (o: { clip: string; dur: number; trim: number; rate?: number; keys: [number, number, number, number][] }) => ({
  clip: o.clip, dur: s(o.dur), trim: o.trim, rate: o.rate,
  keys: o.keys.map(([t, x, y, z]) => ({ f: s(t), x, y, z })),
});
