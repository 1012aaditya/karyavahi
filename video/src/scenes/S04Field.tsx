import React from 'react';
import { Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import audio from '../generated/audio.json';
import { Footage, type Seg } from '../components/Footage';
import { CheckIcon, Kicker, PhoneFrame, SceneFade, useIn, useSpring } from '../components/ui';
import { C, EASE, F, s } from '../theme';

/**
 * 04 · Easy for people in the field (1:15–1:50). The headmaster's phone, in Hindi: My day,
 * Listen, speak a note, proof with no signal → sent with GPS, then WhatsApp.
 * Times are seconds from the start of this block (1:15).
 *
 * WHATSAPP SLOT: put the real phone screen recording at public/footage/whatsapp.mp4 and run
 * `npm run prepare-audio` (or `npm run build`). Until then <SimulatedChat/> below stands in, with an
 * on-screen note that it is re-created.
 */

const PH = { x: 425, y: 118, w: 370, h: 801 }; // phone screen on the canvas
const SW = 780; const SH = 1688;               // phone recordings are 780×1688
const k = (t: number, x: number, y: number, z: number) => ({ f: s(t), x, y, z });

const WA_FROM = 21.8; const WA_TO = 35;

const phoneSegs: Seg[] = [
  { clip: 'myday', from: 0, dur: s(5.3), trim: 0, rate: 0.1, keys: [k(0, 390, 844, 1)] },
  { clip: 'myday', from: s(5.3), dur: s(4.9) + 9, trim: 0.53, keys: [k(0, 390, 844, 1), k(1.4, 300, 660, 1.25), k(4.9, 300, 660, 1.27)] },
  { clip: 'dictate', from: s(10.2), dur: s(3.4) + 9, trim: 0.7, rate: 1.6, fade: 9, keys: [k(0, 325, 780, 1.2), k(3.4, 325, 770, 1.23)] },
  { clip: 'offline', from: s(13.6), dur: s(5.6) + 9, trim: 0.6, rate: 1.7, fade: 9, keys: [k(0, 390, 844, 1), k(5.6, 390, 844, 1)] },
  { clip: 'sent', from: s(19.2), dur: s(WA_FROM - 19.2) + 9, trim: 1.4, fade: 9, keys: [k(0, 300, 660, 1.45), k(2.6, 290, 650, 1.6)] },
];

const ROWS = [
  { at: 5.1, en: 'Opens in Hindi', hi: 'हर खाता अपनी भाषा में खुलता है' },
  { at: 6.9, en: 'Listen to the day', hi: 'मेरा दिन सुनें — पढ़ने के बजाय सुनें' },
  { at: 10.2, en: 'Speak a note', hi: 'बोलकर लिखें — टाइप करने के बजाय' },
  { at: 13.2, en: 'No signal? Saved on the phone', hi: 'नेटवर्क लौटते ही भेजा, GPS से जाँचा' },
  { at: 20.6, en: 'WhatsApp — no app needed', hi: 'काम आते हैं, जवाब से पूरा, फ़ोटो से सबूत' },
];

const Rows: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: 900, top: 326, width: 900 }}>
      {ROWS.map((r, i) => {
        const vis = interpolate(frame, [s(1.2 + i * 0.12), s(1.2 + i * 0.12) + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const on = interpolate(frame, [s(r.at), s(r.at) + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
        const next = ROWS[i + 1] ? s(ROWS[i + 1].at) : s(WA_TO - 2.5);
        const done = interpolate(frame, [next, next + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const active = on * (1 - done);
        return (
          <div key={r.en} style={{
            display: 'flex', gap: 26, alignItems: 'flex-start', padding: '12px 24px', borderRadius: 18, marginBottom: 8, opacity: vis * (0.38 + 0.62 * on),
            background: `rgba(255,255,255,${active * 0.95})`, boxShadow: active > 0.1 ? `0 18px 40px -24px rgba(16,30,56,${0.4 * active})` : 'none',
            transform: `translateX(${active * 10}px)`,
          }}>
            <span style={{
              flex: '0 0 auto', width: 44, height: 44, borderRadius: 99, marginTop: 4, display: 'grid', placeItems: 'center',
              border: `2.5px solid ${on > 0.5 ? C.brand : C.lineStrong}`, background: done > 0.5 ? C.brand : 'transparent', boxSizing: 'border-box',
              fontFamily: F.sans, fontSize: 28, fontWeight: 600, color: on > 0.5 ? C.brand : C.inkFaint,
            }}>{done > 0.5 ? <CheckIcon size={26} progress={done} /> : i + 1}</span>
            <div>
              <div style={{ fontFamily: F.sans, fontSize: 36, fontWeight: 600, color: C.ink, letterSpacing: -0.3 }}>{r.en}</div>
              <div style={{ fontFamily: F.sans, fontSize: 28, color: C.inkSoft, marginTop: 0, lineHeight: 1.45 }}>{r.hi}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** The signal state above the phone during the offline step. */
const Signal: React.FC = () => {
  const frame = useCurrentFrame();
  const o = Math.min(
    interpolate(frame, [s(13.3), s(13.6)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    interpolate(frame, [s(19.6), s(20.0)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  );
  if (o <= 0) return null;
  const back = frame >= s(17.3);
  return (
    <div style={{
      position: 'absolute', left: PH.x + PH.w / 2, top: 58, transform: 'translate(-50%, -50%)', opacity: o,
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 22px', borderRadius: 99, fontFamily: F.sans, fontSize: 30, fontWeight: 600,
      background: back ? C.brand : C.crit, color: '#fff', boxShadow: '0 14px 30px -14px rgba(16,30,56,0.5)', whiteSpace: 'nowrap',
    }}>
      {back ? <CheckIcon size={26} /> : (
        <svg width="28" height="28" viewBox="0 0 24 24"><path d="M3 20h2M8 20v-4M13 20v-8M18 20V7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /><path d="M3 4l18 17" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /></svg>
      )}
      {back ? 'Signal back — sent' : 'No signal'}
    </div>
  );
};

// ------------------------------------------------------------------ WhatsApp slot

const Bubble: React.FC<{ at: number; out?: boolean; children: React.ReactNode }> = ({ at, out, children }) => {
  const p = useSpring(s(at), 16);
  if (p <= 0.001) return null;
  return (
    <div style={{ display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start', marginTop: 12, opacity: p, transform: `translateY(${(1 - p) * 14}px)` }}>
      <div style={{
        maxWidth: 292, padding: '10px 14px', borderRadius: out ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: out ? '#D8F0E6' : '#fff',
        fontFamily: F.sans, fontSize: 24, lineHeight: 1.45, color: C.ink, boxShadow: '0 1px 1px rgba(0,0,0,0.08)',
      }}>{children}</div>
    </div>
  );
};

/** SIMULATED CHAT — stands in until public/footage/whatsapp.mp4 exists. Times: block seconds. */
const SimulatedChat: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: '#EFE9E1', display: 'flex', flexDirection: 'column' }}>
    <div style={{ height: 104, background: C.navy950, color: '#fff', display: 'flex', alignItems: 'flex-end', gap: 12, padding: '0 18px 14px', fontFamily: F.sans }}>
      <svg width="40" height="40" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill={C.brand} /><path d="M7 20.5 12 15.5l4 3.5 4.5-6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /><path d="m19.5 21 2.5 2.5 4.5-5" fill="none" stroke={C.brandMint} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <div><div style={{ fontSize: 24, fontWeight: 600 }}>Karyavahi</div><div style={{ fontSize: 18, opacity: 0.7 }}>WhatsApp · test number</div></div>
    </div>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 14px 18px', overflow: 'hidden' }}>
      <Bubble at={22.3} out>hi</Bubble>
      <Bubble at={24.1}>
        <b>आज का काम (1)</b><br />कक्षा 3 शब्द पठन — रोज़ पाठ योजना से पढ़ाएँ · 10 अक्टू॰ तक<br /><span style={{ color: C.inkSoft }}>देख लिया? <b>1</b> भेजें · सबूत के लिए फ़ोटो भेजें</span>
      </Bubble>
      <Bubble at={25.3} out>1</Bubble>
      <Bubble at={25.9}>दर्ज: काम देख लिया</Bubble>
      <Bubble at={27.0} out>
        <Img src={staticFile('lesson-plan.jpg')} style={{ width: 232, height: 174, objectFit: 'cover', borderRadius: 10, display: 'block' }} />
      </Bubble>
      <Bubble at={28.4}><b style={{ color: C.brand }}>सबूत मिला</b> · TSK-00890<br />जाँच के लिए भेजा गया</Bubble>
    </div>
  </div>
);

const WhatsApp: React.FC = () => {
  const frame = useCurrentFrame();
  const wa = audio.whatsapp as null | { src: string; duration: number; width: number; height: number };
  const o = interpolate(frame, [s(WA_FROM), s(WA_FROM) + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  if (frame < s(WA_FROM)) return null;
  if (wa) {
    // The user's own recording: fitted to the screen, sped up if it is longer than the slot.
    const slot = WA_TO - WA_FROM - 0.5;
    const rate = Math.min(3, Math.max(1, wa.duration / slot));
    const seg: Seg = { clip: 'whatsapp', from: s(WA_FROM), dur: s(WA_TO - WA_FROM), trim: 0, rate, keys: [k(0, wa.width / 2, wa.height / 2, 1)] };
    return <div style={{ position: 'absolute', inset: 0, opacity: o }}><Footage segs={[seg]} vw={PH.w} vh={PH.h} sw={wa.width} sh={wa.height} /></div>;
  }
  return <div style={{ position: 'absolute', inset: 0, opacity: o }}><SimulatedChat /></div>;
};

export const S04Field: React.FC = () => {
  const frame = useCurrentFrame();
  const head = useSpring(s(0.2), 22);
  const phoneIn = useSpring(s(0.1), 26);
  const simulated = !audio.whatsapp;
  const note = useIn(s(WA_FROM + 0.6), 14);
  return (
    <SceneFade dur={s(35)}>
      <div style={{ position: 'absolute', left: 900, top: 120, width: 900, opacity: head, transform: `translateY(${(1 - head) * 12}px)` }}>
        <Kicker>Easy for people in the field</Kicker>
        <div style={{ fontFamily: F.serif, fontSize: 56, lineHeight: 1.12, color: C.ink, marginTop: 16, letterSpacing: -1.2 }}>
          It works the way headmasters already work.
        </div>
      </div>
      <Rows />
      <PhoneFrame x={PH.x} y={PH.y} w={PH.w} h={PH.h} style={{ opacity: phoneIn, transform: `translateY(${(1 - phoneIn) * 40}px)` }}>
        <Footage segs={phoneSegs} vw={PH.w} vh={PH.h} sw={SW} sh={SH} />
        <WhatsApp />
      </PhoneFrame>
      <Signal />
      {simulated && frame >= s(WA_FROM) ? (
        <div style={{
          position: 'absolute', left: PH.x + PH.w / 2, top: 40, transform: 'translate(-50%, 0)', opacity: note,
          fontFamily: F.sans, fontSize: 28, color: C.inkSoft, whiteSpace: 'nowrap',
        }}>Chat re-created for the video</div>
      ) : null}
    </SceneFade>
  );
};
