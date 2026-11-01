/* Renders review stills: node scripts/stills.cjs [seconds...]  → out/stills/*.png */
const path = require('path');
const fs = require('fs');
const { bundle } = require('@remotion/bundler');
const { renderStill, selectComposition } = require('@remotion/renderer');
const ROOT = path.resolve(__dirname, '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEFAULT = { '01-challenge': 4.8, '01-staircase': 17.0, '02-loop': 30.6, '03-claude-figures-checked': 56.4, '03-one-tap-approval': 66.8, '04-field-offline-sent': 93.0, '05-outcome': 121.6, '07-close': 176.0 };
(async () => {
  const args = process.argv.slice(2);
  const list = args.length ? Object.fromEntries(args.map((a) => [`t${a}`, Number(a)])) : DEFAULT;
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src/index.ts'), publicDir: path.join(ROOT, 'public') });
  const composition = await selectComposition({ serveUrl, id: 'Main', browserExecutable: CHROME });
  const dir = path.join(ROOT, 'out/stills');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, sec] of Object.entries(list)) {
    const output = path.join(dir, `${name}.png`);
    await renderStill({ composition, serveUrl, output, frame: Math.round(sec * 30), browserExecutable: CHROME, imageFormat: 'png' });
    console.log('✓', output);
  }
})().catch((e) => { console.error(e); process.exit(1); });
