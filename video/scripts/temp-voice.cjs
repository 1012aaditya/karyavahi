/* Called by temp-voice.sh. Needs macOS `say` and ffmpeg. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public/audio/temp');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';
const VOICE = process.env.VOICE || 'Rishi';
const LEAD = 0.3; // the voice starts this long after the block starts
const blocks = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/generated/script.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-voice-'));
fs.mkdirSync(OUT, { recursive: true });
const dur = (f) => Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
// Words `say` reads better spelled out.
const speakable = (s) => s.replace(/UDISE\+/g, 'U-DISE plus').replace(/⌘K/g, 'command K').replace(/…/g, '...');

function synth(block, rate, gapScale = 1) {
  const parts = []; const timings = []; let t = 0;
  block.phrases.forEach((p, i) => {
    const f = path.join(tmp, `${block.id}-${i}.aiff`);
    execFileSync('say', ['-v', VOICE, '-r', String(rate), '-o', f, speakable(p)]);
    const d = dur(f);
    timings.push({ start: +t.toFixed(3), end: +(t + d).toFixed(3) });
    parts.push(f);
    const gap = (/[.?!…:]$/.test(p) ? 0.5 : 0.22) * gapScale;
    t += d + (i < block.phrases.length - 1 ? gap : 0);
    parts.push(gap);
  });
  parts.pop();
  return { parts, timings, total: t };
}

const all = {};
for (const b of blocks) {
  const room = b.end - b.start - LEAD - 0.6;
  let rate = 172; let g = 1; let r = synth(b, rate, g);
  if (r.total > room) { g = 0.45; r = synth(b, rate, g); }
  while (r.total > room && rate < 230) { rate += 6; r = synth(b, rate, g); }
  // Join phrases with silences into one block file.
  const inputs = []; const filters = []; let n = 0;
  for (const p of r.parts) {
    if (typeof p === 'number') { inputs.push('-f', 'lavfi', '-t', String(p), '-i', 'anullsrc=r=44100:cl=mono'); }
    else inputs.push('-i', p);
    filters.push(`[${n}:a]aresample=44100,aformat=channel_layouts=mono[a${n}]`); n++;
  }
  const concat = `${filters.join(';')};${Array.from({ length: n }, (_, i) => `[a${i}]`).join('')}concat=n=${n}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
  const wav = path.join(OUT, `${b.id}.wav`);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', concat, '-map', '[out]', '-ar', '44100', '-ac', '1', wav]);
  // Keep one .aiff of the whole block too (the raw form `say` produces).
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', wav, path.join(OUT, `${b.id}.aiff`)]);
  all[b.id] = { rate, duration: +dur(wav).toFixed(3), lead: LEAD, phrases: r.timings };
  console.log(`${b.id}: ${all[b.id].duration.toFixed(1)} s of ${b.end - b.start} s (rate ${rate})`);
}
fs.writeFileSync(path.join(OUT, 'timings.json'), JSON.stringify(all, null, 2));
fs.rmSync(tmp, { recursive: true, force: true });
