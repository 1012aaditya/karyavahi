/* eslint-disable */
/**
 * Records the product footage for the Karyavahi demo video from the LIVE site.
 *
 *   node scripts/record.cjs            # record every beat
 *   node scripts/record.cjs home case  # record only some beats (names below)
 *
 * How it works
 * - Drives Google Chrome (headless) with the playwright-core that the app already has installed.
 * - Instead of Playwright's built-in recordVideo (low-bitrate VP8, soft text), it captures the
 *   page with Chrome's own screencast (JPEG, quality 92) and turns the frames into a constant
 *   30 fps H.264 clip with ffmpeg, so small UI text stays sharp.
 * - A drawn cursor (desktop) or tap ring (phone) is injected into the page, so viewers can see
 *   where the "user" clicks. Mouse moves are eased and slow.
 * - Claude drafts: each draft was generated once (3 drafts in total) and the server caches it.
 *   During recording the page's "is there a cached draft?" GET is answered with "no draft" so the
 *   button shows, and the click's POST returns the server's cached draft after a short pause.
 *   No new model calls are made by re-recording.
 * - Field phone: Chrome headless has no microphone or speech voice, so the "Listen" engine and the
 *   dictation engine are replaced by small stand-ins (the app's own buttons and states are real;
 *   only the browser speech engine is scripted). The offline step uses Playwright's real offline
 *   mode; the GPS fix is set to the school's position.
 *
 * Output: public/footage/<beat>.mp4 (kept) and public/footage/raw/<beat>/ (frames, git-ignored).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require(require('path').join(__dirname, '../../app/node_modules/playwright-core'));

const BASE = 'https://karyavahi.onrender.com';
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public/footage');
const RAW = path.join(OUT, 'raw');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PERSONA = {
  beo: 'beo.blk-01@demo.karyavahi.test',
  beo17: 'beo.blk-17@demo.karyavahi.test',
  deo: 'deo.rmp@demo.karyavahi.test',
  hm: 'USR-00206', // Shalini Sonkar, headmaster, School 0002 (has an open task: TSK-00890)
};
// School 0002's position as the server knows it (from /api/geo/map); a fix ~15 m away.
const SCHOOL_0002 = { latitude: 28.82768, longitude: 79.03431, accuracy: 12 };

// ------------------------------------------------------------------ page helpers

/** Cursor / tap overlay. Runs in every page before the app's own scripts. */
const OVERLAY = (mode) => {
  const install = () => {
    if (document.getElementById('__kv_cursor')) return;
    const st = document.createElement('style');
    st.textContent = `
      #__kv_cursor{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:30px;height:30px;
        transform:translate(-200px,-200px);transition:none;filter:drop-shadow(0 2px 3px rgba(16,30,56,.35))}
      .__kv_ripple{position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;
        border:3px solid rgba(22,125,120,.85);background:rgba(22,125,120,.18);width:16px;height:16px;margin:-8px 0 0 -8px;
        animation:__kvr .55s ease-out forwards}
      .__kv_tap{position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;width:44px;height:44px;margin:-22px 0 0 -22px;
        background:rgba(16,30,56,.22);border:2px solid rgba(255,255,255,.9);animation:__kvt .6s ease-out forwards}
      @keyframes __kvr{to{width:56px;height:56px;margin:-28px 0 0 -28px;opacity:0}}
      @keyframes __kvt{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.3);opacity:0}}
      html{scrollbar-width:none} ::-webkit-scrollbar{display:none}`;
    document.documentElement.appendChild(st);
    if (mode === 'desktop') {
      const c = document.createElement('div');
      c.id = '__kv_cursor';
      c.innerHTML = '<svg width="30" height="30" viewBox="0 0 30 30"><path d="M5 3 L5 24 L10.5 18.8 L14.2 27 L17.6 25.5 L13.9 17.4 L21.5 17.4 Z" fill="#101E38" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>';
      document.documentElement.appendChild(c);
      let p = null;
      try { p = JSON.parse(sessionStorage.getItem('__kv_pos') || 'null'); } catch {}
      if (p) c.style.transform = `translate(${p.x - 5}px,${p.y - 3}px)`;
    } else {
      const c = document.createElement('div'); c.id = '__kv_cursor'; c.style.display = 'none';
      document.documentElement.appendChild(c);
    }
  };
  if (document.documentElement) install(); else document.addEventListener('DOMContentLoaded', install);
  document.addEventListener('DOMContentLoaded', install);
  addEventListener('mousemove', (e) => {
    const c = document.getElementById('__kv_cursor');
    if (c && mode === 'desktop') c.style.transform = `translate(${e.clientX - 5}px,${e.clientY - 3}px)`;
    try { sessionStorage.setItem('__kv_pos', JSON.stringify({ x: e.clientX, y: e.clientY })); } catch {}
  }, true);
  addEventListener('mousedown', (e) => {
    const r = document.createElement('div');
    r.className = mode === 'desktop' ? '__kv_ripple' : '__kv_tap';
    r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
    document.documentElement.appendChild(r);
    setTimeout(() => r.remove(), 700);
  }, true);
};

/** Stand-ins for the browser speech engines (headless Chrome has neither a voice nor a mic). */
const SPEECH_STUBS = () => {
  // Reading aloud: accept the utterances, "speak" for a while, then finish.
  if (window.speechSynthesis) {
    const s = window.speechSynthesis;
    let timer = null; let last = null;
    s.getVoices = () => [];
    s.speak = (u) => { last = u; clearTimeout(timer); timer = setTimeout(() => { try { last && last.onend && last.onend(new Event('end')); } catch {} }, 9000); };
    s.cancel = () => { clearTimeout(timer); };
  }
  // Dictation: plays a scripted Hindi note back word by word, as Chrome's service would.
  const NOTE = 'आज कक्षा 3 में संरचित पाठ योजना से शब्द पठन कराया, 28 बच्चे उपस्थित थे।';
  class FakeRec {
    constructor() { this.onresult = null; this.onerror = null; this.onend = null; this._t = []; }
    start() {
      const words = NOTE.split(' ');
      words.forEach((_, i) => {
        this._t.push(setTimeout(() => {
          const t = words.slice(0, i + 1).join(' ');
          const r = [{ transcript: t }]; r.isFinal = false;
          this.onresult && this.onresult({ resultIndex: 0, results: [r] });
        }, 700 + i * 260));
      });
      this._t.push(setTimeout(() => {
        const r = [{ transcript: NOTE }]; r.isFinal = true;
        this.onresult && this.onresult({ resultIndex: 0, results: [r] });
        setTimeout(() => this.onend && this.onend(), 250);
      }, 700 + words.length * 260 + 400));
    }
    stop() { this._t.forEach(clearTimeout); this.onend && this.onend(); }
    abort() { this._t.forEach(clearTimeout); }
  }
  window.webkitSpeechRecognition = FakeRec;
  window.SpeechRecognition = FakeRec;
};

async function newContext(browser, { phone = false, lang = 'en', persona, geo = false }) {
  const ctx = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'hi-IN',
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
        ...(geo ? { geolocation: SCHOOL_0002, permissions: ['geolocation'] } : {}) }
    : { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'en-IN', serviceWorkers: 'block' });
  await ctx.addCookies([{ name: 'kv_lang', value: lang, url: BASE }]);
  await ctx.addInitScript(OVERLAY, phone ? 'phone' : 'desktop');
  if (phone) await ctx.addInitScript(SPEECH_STUBS);
  const form = persona.startsWith('USR-') ? { user_id: persona } : { email: persona };
  const r = await ctx.request.post(BASE + '/api/sign-in', { form, headers: { Origin: BASE }, maxRedirects: 0 });
  if (r.status() !== 303) throw new Error(`sign-in for ${persona} returned ${r.status()}`);
  return ctx;
}

/** Make the "cached draft?" GET say "none", and give the click's POST a believable pause. */
async function stageClaude(page, pauseMs = 2200) {
  await page.route('**/api/ai/copilot?**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' });
    // The click: answer with the server's cached draft (a GET never calls the model), so a
    // re-take never costs a new draft even if the record changed since it was written.
    const url = req.url().replace(/&refresh=1/, '');
    const cached = await page.request.get(url);
    const body = await cached.text();
    await sleep(pauseMs);
    if (/"draft"/.test(body)) return route.fulfill({ status: 200, contentType: 'application/json', body });
    console.log('  ! no cached draft for', url, '- asking the server for one (one paid draft)');
    const fresh = await route.fetch();
    return route.fulfill({ response: fresh });
  });
}

async function go(page, p) {
  await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 120000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await sleep(800);
}

const pos = new WeakMap();
async function moveTo(page, x, y, ms = 700) {
  const from = pos.get(page) || { x: 960, y: 700 };
  const n = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) {
    const t = i / n; const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await sleep(ms / n);
  }
  pos.set(page, { x, y });
}
async function center(page, locator) {
  const el = locator.first();
  await el.waitFor({ state: 'visible', timeout: 60000 });
  const b = await el.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function clickOn(page, locator, ms = 800) {
  const c = await center(page, locator);
  await moveTo(page, c.x, c.y, ms);
  await sleep(250);
  await page.mouse.down(); await sleep(90); await page.mouse.up();
}
async function tapOn(page, locator) {
  const c = await center(page, locator);
  await page.mouse.move(c.x, c.y); await sleep(120);
  await page.mouse.down(); await sleep(90); await page.mouse.up();
}
/** Eased scroll of the window to a y position (or so that an element sits at `offset` from the top). */
async function scrollTo(page, target, ms = 1400, offset = 120) {
  let y = target;
  if (typeof target !== 'number') {
    const el = target.first();
    await el.waitFor({ state: 'attached', timeout: 60000 });
    y = await el.evaluate((n, off) => n.getBoundingClientRect().top + window.scrollY - off, offset);
  }
  await page.evaluate(([to, dur]) => new Promise((res) => {
    const from = window.scrollY; const t0 = performance.now();
    document.documentElement.style.scrollBehavior = 'auto';
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur); const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      window.scrollTo(0, from + (to - from) * e);
      if (t < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  }), [Math.max(0, y), ms]);
}

// ------------------------------------------------------------------ capture

class Capture {
  constructor(page, name, { phone = false } = {}) { this.page = page; this.name = name; this.phone = phone; this.frames = []; }
  async start() {
    this.dir = path.join(RAW, this.name);
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on('Page.screencastFrame', async (f) => {
      const file = path.join(this.dir, `f${String(this.frames.length).padStart(5, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
      this.frames.push({ file, t: f.metadata.timestamp });
      this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    const size = this.phone ? { maxWidth: 780, maxHeight: 1688 } : { maxWidth: 1920, maxHeight: 1080 };
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1, ...size });
    this.t0 = Date.now() / 1000;
    // A tiny repaint every 100 ms so a still page still yields frames (the screencast only
    // sends a frame when something changes).
    this.tick = setInterval(() => this.page.evaluate(() => {
      let d = document.getElementById('__kv_tick');
      if (!d) { d = document.createElement('div'); d.id = '__kv_tick'; d.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;z-index:2147483647;pointer-events:none'; document.documentElement.appendChild(d); }
      d.style.background = d.style.background === 'rgba(0, 0, 0, 0.01)' ? 'rgba(0, 0, 0, 0.02)' : 'rgba(0, 0, 0, 0.01)';
    }).catch(() => {}), 100);
    await sleep(300);
  }
  async stop() {
    clearInterval(this.tick);
    await sleep(300);
    await this.cdp.send('Page.stopScreencast').catch(() => {});
    this.t1 = Date.now() / 1000;
    await sleep(200);
    return this.encode();
  }
  encode() {
    if (this.frames.length < 2) throw new Error(`${this.name}: no frames captured`);
    const lines = [];
    for (let i = 0; i < this.frames.length; i++) {
      const cur = this.frames[i]; const next = this.frames[i + 1];
      const d = next ? Math.max(0.001, next.t - cur.t) : 0.5;
      lines.push(`file '${cur.file}'`, `duration ${d.toFixed(4)}`);
    }
    lines.push(`file '${this.frames[this.frames.length - 1].file}'`);
    const list = path.join(this.dir, 'list.txt');
    fs.writeFileSync(list, lines.join('\n'));
    const out = path.join(OUT, `${this.name}.mp4`);
    const scale = this.phone ? 'scale=780:1688:flags=lanczos' : 'scale=1920:1080:flags=lanczos';
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
      '-vf', `${scale},fps=30,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16',
      '-movflags', '+faststart', '-an', out]);
    const dur = Number(execFileSync('/opt/homebrew/bin/ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim());
    console.log(`  ✓ ${this.name}.mp4  ${dur.toFixed(2)} s  (${this.frames.length} frames)`);
    return dur;
  }
}

async function shoot(page, name, fn, opts) {
  const cap = new Capture(page, name, opts);
  await cap.start();
  try { await fn(); } finally { await cap.stop(); }
}

// ------------------------------------------------------------------ beats
// Each beat: sign in as its persona, load the page off-camera, then start capturing.

const BEATS = {
  // 03 · command centre: map + "Needs you now"
  async home(browser) {
    const ctx = await newContext(browser, { persona: PERSONA.beo });
    const page = await ctx.newPage();
    await go(page, '/overview');
    await sleep(3500); // map tiles
    await page.mouse.move(1500, 820); pos.set(page, { x: 1500, y: 820 });
    await shoot(page, 'home', async () => {
      await sleep(900);
      await moveTo(page, 1010, 640, 1600); // across the map, over Kusumgarh
      await sleep(900);
      await moveTo(page, 900, 470, 900);
      await sleep(700);
      await moveTo(page, 1470, 200, 1400); // "Needs you now"
      await sleep(1600);
      await moveTo(page, 1470, 420, 900);  // worst hotspots
      await sleep(1200);
    });
    await ctx.close();
  },

  // 03 · ⌘K palette: search a case, see "Ask Claude", jump to it
  async cmdk(browser) {
    const ctx = await newContext(browser, { persona: PERSONA.beo });
    const page = await ctx.newPage();
    await go(page, '/overview');
    await sleep(2500);
    await page.mouse.move(1300, 600); pos.set(page, { x: 1300, y: 600 });
    await shoot(page, 'cmdk', async () => {
      await sleep(600);
      await clickOn(page, page.getByRole('button', { name: /Search or jump to/ }), 900);
      await sleep(900);
      // A question first: the palette offers "Ask Claude" (not sent; that would be a paid answer).
      await page.keyboard.type('Which schools need a visit this week?', { delay: 55 });
      await sleep(2000);
      await page.keyboard.press('Meta+A');
      await page.keyboard.press('Backspace');
      await sleep(300);
      await page.keyboard.type('CASE-0184', { delay: 120 });
      await sleep(1800);
      await page.keyboard.press('Enter');
      await page.waitForURL(/CASE-0184/, { timeout: 60000 });
      await page.waitForLoadState('networkidle').catch(() => {});
      await sleep(1500);
    });
    await ctx.close();
  },

  // 03 · the case: the drop, the schools driving it, the conditions behind it
  async case(browser) {
    const ctx = await newContext(browser, { persona: PERSONA.beo });
    const page = await ctx.newPage();
    await stageClaude(page);
    await go(page, '/cases/CASE-0184');
    await page.mouse.move(1200, 500); pos.set(page, { x: 1200, y: 500 });
    await shoot(page, 'case', async () => {
      await sleep(1600);
      await scrollTo(page, page.getByText('1 · The finding').first(), 1600, 150);
      await sleep(900);
      await scrollTo(page, page.getByText('Which schools account for the drop', { exact: false }).first(), 1600, 160);
      await moveTo(page, 700, 330, 900);
      await sleep(1500);
      await scrollTo(page, page.getByText('2 · What the data shows').first(), 1700, 130);
      await sleep(1000);
      await scrollTo(page, page.getByText('The underlying observations', { exact: false }).first(), 1400, 420);
      await sleep(1600);
    });
    await ctx.close();
  },

  // 03 · Claude explains the finding; figures checked against the records
  async explain(browser) {
    const ctx = await newContext(browser, { persona: PERSONA.beo });
    const page = await ctx.newPage();
    await stageClaude(page, 2400);
    await go(page, '/cases/CASE-0184');
    const btn = page.getByRole('button', { name: 'Explain this finding' });
    await scrollTo(page, btn, 10, 640);
    await page.mouse.move(1300, 420); pos.set(page, { x: 1300, y: 420 });
    await shoot(page, 'explain', async () => {
      await sleep(900);
      await clickOn(page, btn, 1000);
      await page.getByText('figures checked against the records').first().waitFor({ timeout: 90000 });
      await sleep(1200);
      await moveTo(page, 1250, 700, 800);
      await sleep(1600);
      await scrollTo(page, page.getByText('figures checked against the records').first(), 2200, 760);
      await sleep(600);
      await moveTo(page, (await center(page, page.getByText('figures checked against the records'))).x - 40,
        (await center(page, page.getByText('figures checked against the records'))).y + 30, 900);
      await sleep(2200);
    });
    await ctx.close();
  },

  // 03 · Claude suggests a plan from the evidence library → the plan composer (costs)
  async plan(browser) {
    const ctx = await newContext(browser, { persona: PERSONA.beo17 });
    const page = await ctx.newPage();
    await stageClaude(page, 2400);
    await go(page, '/cases/CASE-0127');
    const btn = page.getByRole('button', { name: 'Suggest a plan' });
    await scrollTo(page, btn, 10, 520);
    await page.mouse.move(1300, 380); pos.set(page, { x: 1300, y: 380 });
    await shoot(page, 'plan', async () => {
      await sleep(800);
      await clickOn(page, btn, 1000);
      const link = page.getByRole('link', { name: /Open the plan composer with INT-/ });
      await link.waitFor({ timeout: 90000 });
      await sleep(1400);
      await scrollTo(page, link, 1800, 700);
      await sleep(700);
      await clickOn(page, link, 1100);
      await page.waitForURL(/\/plan/, { timeout: 60000 });
      await page.waitForLoadState('networkidle').catch(() => {});
      await sleep(1600);
      await scrollTo(page, 420, 2200);
      await sleep(1800);
    });
    await ctx.close();
  },

  // 03 · second officer approves in one tap (DEO, maker-checker)
  async approve(browser) {
    const ctx = await newContext(browser, { persona: PERSONA.deo });
    const page = await ctx.newPage();
    await go(page, '/approvals');
    // A plan that needs the DEO (district lever), so this is the DEO's own decision.
    const card = page.locator('article, li, section, div').filter({ hasText: /requires DEO/ }).filter({ has: page.getByRole('button', { name: 'Approve' }) }).last();
    const approveBtn = card.getByRole('button', { name: 'Approve' }).first();
    await scrollTo(page, approveBtn, 10, 640);
    await page.mouse.move(1200, 300); pos.set(page, { x: 1200, y: 300 });
    await shoot(page, 'approve', async () => {
      await sleep(1000);
      await clickOn(page, approveBtn, 1200);
      await sleep(3800);
    });
    await ctx.close();
  },

  // 03 · every task gets an owner and a deadline (the work section of a running case)
  async work(browser) {
    const ctx = await newContext(browser, { persona: PERSONA.beo });
    const page = await ctx.newPage();
    await stageClaude(page);
    await go(page, '/cases/CASE-0070');
    await scrollTo(page, page.getByText('4 · The work').first(), 10, 260);
    await page.mouse.move(1300, 500); pos.set(page, { x: 1300, y: 500 });
    await shoot(page, 'work', async () => {
      await sleep(700);
      await scrollTo(page, page.getByText('4 · The work').first(), 1600, 110);
      await moveTo(page, 900, 520, 1000);
      await sleep(2400);
    });
    await ctx.close();
  },

  // 04 · phone: My day in Hindi, Listen
  async myday(browser) {
    const ctx = await newContext(browser, { phone: true, lang: 'hi', persona: PERSONA.hm, geo: true });
    const page = await ctx.newPage();
    await go(page, '/today');
    await shoot(page, 'myday', async () => {
      await sleep(1500);
      await tapOn(page, page.getByRole('button', { name: /मेरा दिन सुनें/ }));
      await sleep(4500);
    }, { phone: true });
    await ctx.close();
  },

  // 04 · phone: speak a note, hand in proof with no signal, then it sends with GPS
  async proof(browser) {
    const ctx = await newContext(browser, { phone: true, lang: 'hi', persona: PERSONA.hm, geo: true });
    const page = await ctx.newPage();
    await go(page, '/today');
    // Open the proof form and attach the photo off-camera (the file picker is not filmable).
    await page.getByText('सबूत जमा करें').first().click();
    await sleep(600);
    await page.locator('input[type=file]').first().setInputFiles(path.join(ROOT, 'scripts/assets/lesson-plan.jpg'));
    await sleep(1500);
    const mic = page.getByRole('button', { name: /बोल/ }).first();
    await scrollTo(page, mic, 10, 360);
    await shoot(page, 'dictate', async () => {
      await sleep(900);
      await tapOn(page, mic);
      await sleep(5200);
      await sleep(1200);
    }, { phone: true });
    await ctx.setOffline(true);
    await sleep(500);
    const submit = page.getByRole('button', { name: 'जमा करें', exact: true });
    await scrollTo(page, submit, 10, 520);
    await shoot(page, 'offline', async () => {
      await sleep(900);
      await tapOn(page, submit);
      await page.getByText('सिग्नल नहीं है', { exact: false }).first().waitFor({ timeout: 30000 });
      await sleep(1500);
      await scrollTo(page, 0, 1400);
      await sleep(2200); // "भेजने की प्रतीक्षा में" at the top of My day
      await ctx.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await sleep(4500);
    }, { phone: true });
    // The task page: the proof that just arrived, with the server's GPS verdict.
    await go(page, '/tasks/TSK-00890');
    const badge = page.getByText('GPS: विद्यालय पर').first();
    await scrollTo(page, badge, 10, 420);
    await shoot(page, 'sent', async () => {
      await sleep(1200);
      await scrollTo(page, badge, 1200, 300);
      await sleep(2800);
    }, { phone: true });
    await ctx.close();
  },

  // 05 · proof checked by someone else: the evidence queue
  async evidence(browser) {
    const ctx = await newContext(browser, { persona: PERSONA.beo });
    const page = await ctx.newPage();
    await go(page, '/evidence');
    await page.mouse.move(1300, 400); pos.set(page, { x: 1300, y: 400 });
    await shoot(page, 'evidence', async () => {
      await sleep(900);
      await scrollTo(page, page.getByText('Waiting · ', { exact: false }).first(), 1600, 160);
      const accept = page.getByRole('button', { name: 'Accept' }).first();
      const c = await center(page, accept);
      await moveTo(page, c.x, c.y, 1200); // hover only: accepting would change the demo
      await sleep(2400);
    });
    await ctx.close();
  },

  // 05 · did it work? the DiD result on a closed case
  async outcome(browser) {
    const ctx = await newContext(browser, { persona: PERSONA.beo });
    const page = await ctx.newPage();
    await stageClaude(page);
    await go(page, '/cases/CASE-0074');
    await scrollTo(page, page.getByText('6 · Did it work?').first(), 10, 500);
    await page.mouse.move(1300, 500); pos.set(page, { x: 1300, y: 500 });
    await shoot(page, 'outcome', async () => {
      await sleep(700);
      await scrollTo(page, page.getByText('6 · Did it work?').first(), 1600, 110);
      await moveTo(page, 800, 560, 1000);
      await sleep(2600);
    });
    await ctx.close();
  },

  // 05 · if not, the case reopens
  async reopen(browser) {
    const ctx = await newContext(browser, { persona: PERSONA.beo });
    const page = await ctx.newPage();
    await go(page, '/cases?tab=reopened');
    await page.mouse.move(1300, 300); pos.set(page, { x: 1300, y: 300 });
    await shoot(page, 'reopen', async () => {
      await sleep(600);
      await scrollTo(page, page.getByText('Reopened · ', { exact: false }).first(), 1300, 140);
      const b = page.getByText(/reopened ×/).first();
      const c = await center(page, b);
      await moveTo(page, c.x + 20, c.y + 14, 1000);
      await sleep(2400);
    });
    await ctx.close();
  },

  // 05 · the Action Taken Report and its Claude narrative
  async report(browser) {
    const ctx = await newContext(browser, { persona: PERSONA.beo });
    const page = await ctx.newPage();
    await stageClaude(page, 2000);
    await go(page, '/reports/RPT-00014');
    const btn = page.getByRole('button', { name: 'Write the narrative' });
    await page.mouse.move(1300, 300); pos.set(page, { x: 1300, y: 300 });
    await shoot(page, 'report', async () => {
      await sleep(800);
      await clickOn(page, btn, 1000);
      await page.getByText('figures checked against the records').first().waitFor({ timeout: 90000 });
      await sleep(1000);
      await moveTo(page, 1100, 640, 900);
      await sleep(2600);
    });
    await ctx.close();
  },

  // 06 · real public data: the sources page
  async sources(browser) {
    const ctx = await newContext(browser, { persona: PERSONA.beo });
    const page = await ctx.newPage();
    await go(page, '/sources');
    await page.mouse.move(1500, 300); pos.set(page, { x: 1500, y: 300 });
    await shoot(page, 'sources', async () => {
      await sleep(900);
      const t = page.locator('table').first();
      if (await t.count()) await scrollTo(page, t, 2600, 200); else await scrollTo(page, 700, 2600);
      await sleep(1600);
    });
    await ctx.close();
  },

  // 07 · roadmap page
  async roadmap(browser) {
    const ctx = await newContext(browser, { persona: PERSONA.beo });
    const page = await ctx.newPage();
    await go(page, '/roadmap');
    await page.mouse.move(1500, 300); pos.set(page, { x: 1500, y: 300 });
    await shoot(page, 'roadmap', async () => {
      await sleep(800);
      await scrollTo(page, page.getByText('The path').first(), 2400, 140);
      await sleep(1600);
    });
    await ctx.close();
  },
};

(async () => {
  fs.mkdirSync(RAW, { recursive: true });
  const which = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BEATS);
  // Wake the free instance first (the first request after idle can take a minute).
  for (let i = 0; i < 20; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) break; } catch {}
    await sleep(5000);
  }
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
  for (const name of which) {
    if (!BEATS[name]) { console.log(`unknown beat ${name}`); continue; }
    console.log(`● ${name}`);
    try { await BEATS[name](browser); } catch (e) { console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`); }
  }
  await browser.close();
})();
