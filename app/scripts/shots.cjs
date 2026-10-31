/**
 * Screenshots of key pages as a given demo account, using the system Chrome.
 *   node scripts/shots.cjs <email|-> <outDir> <path> [path...]   (prefix a path with m: for mobile)
 */
const { chromium } = require('playwright-core');
const BASE = process.env.KV_BASE ?? 'http://localhost:3000';
(async () => {
  const [email, out, ...paths] = process.argv.slice(2);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const mk = async (mobile) => {
    const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
    if (email && email !== '-') {
      const r = await ctx.request.post(`${BASE}/api/sign-in`, { form: { email }, maxRedirects: 0 });
      if (r.status() !== 303) throw new Error(`sign-in failed ${r.status()}`);
    }
    return ctx;
  };
  const desk = await mk(false); const mob = await mk(true);
  const errors = [];
  for (const raw of paths) {
    const mobile = raw.startsWith('m:'); const vp = raw.startsWith('v:');
    const p = mobile || vp ? raw.slice(2) : raw;
    const page = await (mobile ? mob : desk).newPage();
    page.on('pageerror', (e) => errors.push(`${p}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${p}: ${m.text()}`); });
    await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(Number(process.env.KV_WAIT ?? 600));
    const name = `${mobile ? 'm-' : vp ? 'v-' : ''}${p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'}.png`;
    await page.screenshot({ path: `${out}/${name}`, fullPage: !mobile && !vp });
    console.log('shot', name);
    await page.close();
  }
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
