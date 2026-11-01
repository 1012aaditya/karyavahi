import React from 'react';
import { Freeze, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import audio from '../generated/audio.json';
import { EASE, FPS } from '../theme';

/**
 * Screen recordings with a slow "camera": the clip is drawn at its own size (1920×1080 for the
 * desktop, 780×1688 for the phone) and scaled and moved so that the point being narrated sits in
 * the middle of the frame.
 */

export type Seg = {
  clip: string;      // public/footage/<clip>.mp4
  from: number;      // scene frame where this segment starts
  dur: number;       // frames on screen
  trim: number;      // seconds into the clip
  rate?: number;     // playback speed
  fade?: number;     // cross-fade in, frames (0 for the first segment)
  keys: Key[];       // camera keyframes, frames relative to the segment start
};
export type Key = { f: number; x: number; y: number; z: number };

const footageLen = (clip: string) => (audio.footage as Record<string, number>)[clip] ?? 0;

/** Camera state at a frame, eased between keyframes. */
export function camAt(keys: Key[], frame: number): Key {
  if (frame <= keys[0].f) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]; const b = keys[i + 1];
    if (frame <= b.f) {
      const t = interpolate(frame, [a.f, b.f], [0, 1], { easing: EASE });
      return { f: frame, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    }
  }
  return keys[keys.length - 1];
}

/** Turns a camera state into a transform for a viewport `vw × vh` showing a `sw × sh` source. */
export function camTransform(cam: Key, vw: number, vh: number, sw: number, sh: number) {
  const s = (vw / sw) * cam.z;
  const halfW = vw / (2 * s); const halfH = vh / (2 * s);
  const x = Math.min(Math.max(cam.x, halfW), sw - halfW);
  const y = Math.min(Math.max(cam.y, halfH), sh - halfH);
  const tx = vw / 2 - x * s; const ty = vh / 2 - y * s;
  return { s, tx, ty, map: (px: number, py: number) => ({ x: tx + px * s, y: ty + py * s }) };
}

const SegVideo: React.FC<{ seg: Seg; sw: number; sh: number; vw: number; vh: number }> = ({ seg, sw, sh, vw, vh }) => {
  const frame = useCurrentFrame();
  const cam = camTransform(camAt(seg.keys, frame), vw, vh, sw, sh);
  const rate = seg.rate ?? 1;
  const len = footageLen(seg.clip);
  // How many frames of the clip are left from `trim` at this speed; after that, hold the last frame.
  const playable = Math.max(1, Math.floor(((len - seg.trim) * FPS) / rate) - 2);
  const o = seg.fade ? interpolate(frame, [0, seg.fade], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE }) : 1;
  const video = (
    <OffthreadVideo src={staticFile(`footage/${seg.clip}.mp4`)} trimBefore={Math.round(seg.trim * FPS)} playbackRate={rate} muted
      style={{ width: sw, height: sh, display: 'block' }} />
  );
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: sw, height: sh, transformOrigin: '0 0', transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})` }}>
        {frame < playable ? video : <Freeze frame={playable - 1}>{video}</Freeze>}
      </div>
    </div>
  );
};

/** Builds back-to-back segments; each one cross-fades over the previous by `fade` frames. */
export function chain(start: number, specs: Omit<Seg, 'from' | 'fade'>[], fade = 9): Seg[] {
  let at = start;
  return specs.map((sp, i) => {
    const seg: Seg = { ...sp, from: at, fade: i === 0 ? 0 : fade, dur: sp.dur + (i < specs.length - 1 ? fade : 0) };
    at += sp.dur;
    return seg;
  });
}

/** Where a point of the source (clip pixels) is on screen at `frame`, inside a viewport at (ox, oy). */
export function pointAt(segs: Seg[], frame: number, vw: number, vh: number, ox: number, oy: number, px: number, py: number, sw = 1920, sh = 1080) {
  const seg = [...segs].reverse().find((g) => frame >= g.from) ?? segs[0];
  const cam = camTransform(camAt(seg.keys, frame - seg.from), vw, vh, sw, sh);
  const p = cam.map(px, py);
  return { x: ox + p.x, y: oy + p.y };
}

/** Plays `segs` inside a `vw × vh` viewport, each with its own camera. */
export const Footage: React.FC<{ segs: Seg[]; vw: number; vh: number; sw?: number; sh?: number }> = ({ segs, vw, vh, sw = 1920, sh = 1080 }) => (
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
    {segs.map((seg, i) => (
      <Sequence key={i} from={seg.from} durationInFrames={seg.dur} layout="none">
        <SegVideo seg={seg} sw={sw} sh={sh} vw={vw} vh={vh} />
      </Sequence>
    ))}
  </div>
);
