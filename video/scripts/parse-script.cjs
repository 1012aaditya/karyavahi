/* Reads script.md and writes src/generated/script.json: the 7 blocks with their time marks and
   their phrases (split at "/"). The captions and the temp voice both come from this. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const md = fs.readFileSync(path.join(ROOT, 'script.md'), 'utf8');
const toSec = (s) => { const [m, x] = s.split(':').map(Number); return m * 60 + x; };
const blocks = [];
const re = /^### (\d\d) · (.+?) \((\d+:\d\d) – (\d+:\d\d)\)\n([\s\S]*?)(?=\n### |\n---)/gm;
let m;
while ((m = re.exec(md))) {
  const text = m[5].replace(/\s+/g, ' ').trim();
  const phrases = text.split('/').map((p) => p.trim()).filter(Boolean);
  blocks.push({ id: m[1], title: m[2].trim(), start: toSec(m[3]), end: toSec(m[4]), text: text.replace(/\s*\/\s*/g, ' '), phrases });
}
if (!blocks.length) throw new Error('No blocks found in script.md');
fs.mkdirSync(path.join(ROOT, 'src/generated'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src/generated/script.json'), JSON.stringify(blocks, null, 2));
console.log(blocks.map((b) => `${b.id} ${b.title} ${b.start}-${b.end}s, ${b.phrases.length} phrases`).join('\n'));
