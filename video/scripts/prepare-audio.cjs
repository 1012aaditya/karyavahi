/* Decides, for each block, which narration the video plays, and writes src/generated/audio.json.
 *
 *  - public/audio/user/01.m4a … 07.m4a (your own recordings; .m4a, .mp3 or .wav) win over
 *  - public/audio/temp/01.wav … 07.wav (the temporary `say` voice).
 *  - Or one whole take: public/audio/user/full.m4a, played from 0:00 (the block files are then ignored).
 *  - public/footage/whatsapp.mp4 (your phone recording) replaces the simulated WhatsApp chat.
 *
 * Captions follow the temp voice's exact phrase times; for your own recordings they are spread
 * over the length of your clip in proportion to the length of each phrase.
 * Run it after adding or changing any of those files (npm run build does it for you).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const FFPROBE = '/opt/homebrew/bin/ffprobe';
const blocks = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/generated/script.json'), 'utf8'));
const tempTimings = fs.existsSync(path.join(ROOT, 'public/audio/temp/timings.json'))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio/temp/timings.json'), 'utf8')) : {};
const dur = (f) => Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const find = (dir, id) => ['m4a', 'mp3', 'wav', 'aac', 'MP3', 'M4A', 'WAV'].map((e) => path.join(ROOT, dir, `${id}.${e}`)).find((f) => fs.existsSync(f));
const rel = (f) => path.relative(path.join(ROOT, 'public'), f).split(path.sep).join('/');

function spread(phrases, total, lead) {
  const w = phrases.map((p) => p.length + 6); const sum = w.reduce((a, b) => a + b, 0);
  let t = 0;
  return w.map((x) => { const d = (x / sum) * total; const r = { start: +(t).toFixed(3), end: +(t + d * 0.94).toFixed(3) }; t += d; return r; });
}

const full = find('public/audio/user', 'full');
const out = { full: full ? { src: rel(full), duration: dur(full) } : null, blocks: {}, whatsapp: null };
for (const b of blocks) {
  const user = find('public/audio/user', b.id);
  const temp = find('public/audio/temp', b.id);
  if (full) {
    // One take: captions spread across each block's window.
    out.blocks[b.id] = { src: null, kind: 'full', lead: 0.3, phrases: spread(b.phrases, b.end - b.start - 1.0, 0.3) };
  } else if (user) {
    const d = dur(user);
    out.blocks[b.id] = { src: rel(user), kind: 'user', lead: 0.3, duration: d, phrases: spread(b.phrases, Math.min(d, b.end - b.start - 0.4), 0) };
    if (d > b.end - b.start - 0.3) console.log(`! ${b.id}: your clip is ${d.toFixed(1)} s but the block is ${b.end - b.start} s; the end will be cut off.`);
  } else if (temp && tempTimings[b.id]) {
    out.blocks[b.id] = { src: rel(temp), kind: 'temp', lead: tempTimings[b.id].lead, duration: tempTimings[b.id].duration, phrases: tempTimings[b.id].phrases };
  } else {
    out.blocks[b.id] = { src: null, kind: 'none', lead: 0.3, phrases: spread(b.phrases, b.end - b.start - 1.0, 0.3) };
  }
  console.log(`${b.id}: ${out.blocks[b.id].kind}${out.blocks[b.id].src ? ' ← ' + out.blocks[b.id].src : ''}`);
}
const wa = path.join(ROOT, 'public/footage/whatsapp.mp4');
if (fs.existsSync(wa)) {
  const info = execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', wa]).toString().trim().split(',').map(Number);
  out.whatsapp = { src: 'footage/whatsapp.mp4', duration: dur(wa), width: info[0], height: info[1] };
  console.log('WhatsApp: your clip', out.whatsapp);
} else console.log('WhatsApp: simulated chat (add public/footage/whatsapp.mp4 to replace it)');

// Footage lengths, so the video can freeze a clip's last frame instead of running past its end.
out.footage = {};
for (const f of fs.readdirSync(path.join(ROOT, 'public/footage')).filter((x) => x.endsWith('.mp4'))) {
  out.footage[f.replace(/\.mp4$/, '')] = +dur(path.join(ROOT, 'public/footage', f)).toFixed(3);
}

// Captions: phrases grouped into readable lines (break after a sentence, or past ~62 characters).
const captions = [];
for (const b of blocks) {
  const a = out.blocks[b.id];
  const abs = (t) => b.start + (a.kind === 'full' ? 0 : a.lead) + t;
  let cur = null;
  b.phrases.forEach((p, i) => {
    const tm = a.phrases[i];
    if (cur && (cur.text.length + 1 + p.length > 62 || /[.?!:…]$/.test(cur.text))) { captions.push(cur); cur = null; }
    if (!cur) cur = { block: b.id, text: p, start: abs(tm.start), end: abs(tm.end) };
    else { cur.text += ' ' + p; cur.end = abs(tm.end); }
  });
  if (cur) captions.push(cur);
}
captions.forEach((c, i) => {
  const next = captions[i + 1];
  c.end = Math.min(c.end + 0.45, next ? next.start - 0.04 : c.end + 0.45);
  c.start = +c.start.toFixed(3); c.end = +c.end.toFixed(3);
});
out.captions = captions;
fs.writeFileSync(path.join(ROOT, 'src/generated/audio.json'), JSON.stringify(out, null, 2));

const srtTime = (t) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000); const m = Math.floor(ms / 60000) % 60; const s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'out/captions.srt'), captions.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n'));
console.log(`${captions.length} captions → out/captions.srt`);
