#!/usr/bin/env node
/**
 * Downloads the public sources the demo's real-data layer is built from, into
 * app/.data/sources/<source>/ (git-ignored; raw downloads are never committed).
 *
 *   npm run data:fetch                 # everything that is not already downloaded
 *   npm run data:fetch -- --only udise # one source (udise, parakh, aser, nfhs, pab, lgd,
 *                                      #   aspirational, pgid, census, pmshri)
 *   npm run data:fetch -- --force      # download again even if a good copy exists
 *
 * Then `npm run data:build` turns the downloads into the small, anonymised files in data/real/
 * that the app reads (see scripts/build-real-data.mjs).
 *
 * Rules this script keeps:
 * - throttled: one request every 4 s to the India Data Portal and every 2 s to the other
 *   government sites, backing off on HTTP 429/5xx; PM SHRI is read by rendering its public page
 *   in headless Chrome (no export exists), one page at a time, and the step stops if the site
 *   shows a captcha, a login or a bot check;
 * - resumable: each UDISE+ page is saved on its own, so a rerun picks up where it stopped;
 * - checked: the content type and the first bytes must match what was asked for (a PDF starts
 *   with %PDF, a CSV has the expected header, a CKAN answer says success:true);
 * - safe: a download goes to a .part file and replaces the old copy only once it has passed
 *   the checks, so an error page never overwrites a good file.
 * Nothing about the app or its users is sent; only public files are requested.
 */
import { mkdirSync, existsSync, writeFileSync, renameSync, readFileSync, statSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(APP, '.data', 'sources');
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const UA = 'Karyavahi-demo/1.0 (public-data fetch for an education demo)';

const CKAN = 'https://ckandev.indiadataportal.com/api/3/action';
const UDISE_RESOURCE = '457fddf1-982f-4c85-855d-5095578accc1';
const UDISE_DISTRICTS = ['Rampur', 'Lucknow', 'Varanasi'];
const PAGE = 1000;
const THROTTLE_MS = 4000;

const PARAKH = [
  ['Report_Rampur_IND09176.pdf', 'https://parakh.ncert.gov.in/media/public_files/2025-08/Report_Rampur_IND09176.pdf'],
  ['Report_Lucknow_IND09162.pdf', 'https://parakh.ncert.gov.in/media/public_files/2025-08/Report_Lucknow_IND09162.pdf'],
  ['Report_Varanasi_IND09187.pdf', 'https://parakh.ncert.gov.in/media/public_files/2025-08/Report_Varanasi_IND09187.pdf'],
];
const ASER = [['Uttar-Pradesh_District-Estimates.pdf', 'https://asercentre.org/wp-content/uploads/2022/12/Uttar-Pradesh_District-Estimates.pdf']];
const PAB = [
  ['UP_PAB_Minutes_2025_26.pdf', 'https://web.archive.org/web/20250712214637id_/https://dsel.education.gov.in/sites/default/files/pab/UP_PAB_Minutes_2025_26.pdf'],
  ['PAB_minutes_revision_UP.pdf', 'https://web.archive.org/web/20250712222733id_/https://dsel.education.gov.in/sites/default/files/pab/PAB_minutes_revision_UP.pdf'],
];
/** India Data Portal CKAN resources downloaded whole: [file, resource id, a column the header must have]. */
const NFHS = [['nfhs-district.csv', 'b8ac1c23-d13f-4a91-aa4c-a056605f9115', 'district']];
const LGD = [
  ['lgd-districts.csv', '19df978a-675e-4ff5-8015-d0e1de447319', 'district'],
  ['lgd-blocks.csv', 'bdf22015-a213-4e23-b693-ca40bec4346e', 'block'],
];

/** UP Planning Department, Aspirational Blocks Programme: the page listing the GOs and data files. */
const ABP_PAGE = 'https://epariyojana.up.gov.in/TABP/OrderGOs.aspx';
/** [saved as, file name on the page] — the latest NITI quarterly file, the state ABP+ list, NITI's indicator metadata. */
const ABP_FILES = [
  ['UP_68AB_NITI_Mar2026.xlsx', 'UP_68AB_NITI_Mar2026.xlsx'],
  ['UP_ABP_108_Blocks.xlsx', 'UP ABP 108 Blocks.xlsx'],
  ['NITI_ABP_40_indicators_metadata.xlsx', 'NITI ABP 40 indicators Meta data.xlsx'],
];
/** PGI-D (Ministry of Education): grade of every UP district, per year (8 = 2025-26 … 5 = 2022-23) and category (0 = overall, 1–6 = domains). */
const PGID = 'https://dpgi.udiseplus.gov.in/apis/backend/dgpidata/categorywise';
const PGID_YEARS = [5, 6, 7, 8];
const PGID_CATS = [0, 1, 2, 3, 4, 5, 6];
/** Census 2011 Primary Census Abstract on the India Data Portal (long format; district_code is the LGD code). */
const CENSUS_DISTRICTS = 'efefb405-bd30-4041-bd36-5e6b0d9432ff';
const CENSUS_STATES = 'ed2203bf-e493-4b6a-a0ab-d343d4369687';
const CENSUS_LGD = [176, 162, 187];
/** PM SHRI: the public school search; districts are chosen by LGD code. */
const PMSHRI_HOME = 'https://pmshri.education.gov.in/';
const PMSHRI_DISTRICTS = [[176, 'RAMPUR'], [162, 'LUCKNOW'], [187, 'VARANASI']];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastPortalCall = 0;
async function throttle() {
  const wait = lastPortalCall + THROTTLE_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastPortalCall = Date.now();
}
const lastHostCall = new Map();
/** One request every 2 s per government host other than the portal. */
async function hostThrottle(url) {
  const host = new URL(url).host;
  const wait = (lastHostCall.get(host) ?? 0) + 2000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastHostCall.set(host, Date.now());
}
const kb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${(n / 1e3).toFixed(1)} KB`);

/** GET with retries: 429 and 5xx back off (8 s, 16 s, 32 s, 64 s); anything else fails. */
async function get(url, { portal = false } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (portal) await throttle(); else await hostThrottle(url);
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(120_000) });
    } catch (e) {
      // epariyojana.up.gov.in sends a header with a space before its colon, which Node's HTTP
      // parser refuses outright; curl accepts it. Only the response is read; nothing is run.
      if (/HTTP\/1\.1 protocol|Invalid header/i.test(String(e.cause?.message ?? e.message))) return curlGet(url);
      console.log(`  network error (${e.message}); retrying`);
      await sleep(8000 * 2 ** attempt);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get('retry-after')) || 0;
      const wait = Math.max(ra * 1000, 8000 * 2 ** attempt);
      console.log(`  HTTP ${res.status}; waiting ${Math.round(wait / 1000)} s`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return { type: res.headers.get('content-type') ?? '', body: Buffer.from(await res.arrayBuffer()) };
  }
  throw new Error(`gave up after 5 attempts: ${url}`);
}

/** The same GET through curl, for a server whose headers Node will not parse. */
function curlGet(url) {
  const tmp = join(SRC, `.curl-${process.pid}.part`);
  mkdirSync(SRC, { recursive: true });
  try {
    const type = execFileSync('curl', ['-sS', '--fail', '-L', '--proto', '=https', '--max-time', '120', '-A', UA, '-o', tmp, '-w', '%{content_type}', url], { encoding: 'utf8' });
    return { type, body: readFileSync(tmp) };
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** Write to <file>.part, check it, and only then move it into place. */
function commit(file, body, check) {
  const problem = check(body);
  if (problem) throw new Error(`${file}: ${problem} — the existing copy (if any) was left alone`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.part`, body);
  renameSync(`${file}.part`, file);
}
const isPdf = (type) => (b) => (b.subarray(0, 5).toString('latin1') !== '%PDF-' ? `not a PDF (content-type ${type})` : b.length < 10_000 ? 'suspiciously small' : null);
const isCsv = (type, col) => (b) => {
  const head = b.subarray(0, 4000).toString('utf8').toLowerCase();
  if (/<html|<!doctype/.test(head)) return `an HTML page, not CSV (content-type ${type})`;
  if (!head.split('\n')[0].includes(col)) return `the header has no "${col}" column`;
  return null;
};
const isXlsx = (type) => (b) => (b.subarray(0, 4).toString('latin1') !== 'PK\x03\x04' ? `not an .xlsx (zip) file (content-type ${type})` : b.length < 5_000 ? 'suspiciously small' : null);
const isJson = (test) => (b) => {
  const head = b.subarray(0, 200).toString('utf8').trimStart();
  if (head.startsWith('<')) return 'an HTML page, not JSON';
  let j; try { j = JSON.parse(b.toString('utf8')); } catch { return 'not valid JSON'; }
  return test(j);
};
const good = (file, minBytes) => !FORCE && existsSync(file) && statSync(file).size >= minBytes;

async function pdfs(dir, list) {
  for (const [name, url] of list) {
    const file = join(SRC, dir, name);
    if (good(file, 10_000)) { console.log(`  have ${dir}/${name} (${kb(statSync(file).size)})`); continue; }
    const { type, body } = await get(url);
    if (!/pdf|octet-stream/i.test(type)) throw new Error(`${name}: content-type ${type}, expected a PDF`);
    commit(file, body, isPdf(type));
    console.log(`  got ${dir}/${name} (${kb(body.length)})`);
  }
}

async function ckanFiles(dir, list) {
  for (const [name, id, col] of list) {
    const file = join(SRC, dir, name);
    if (good(file, 1000)) { console.log(`  have ${dir}/${name} (${kb(statSync(file).size)})`); continue; }
    const meta = JSON.parse((await get(`${CKAN}/resource_show?id=${id}`, { portal: true })).body.toString('utf8'));
    if (!meta.success || !meta.result?.url) throw new Error(`resource ${id}: no download address`);
    const url = meta.result.url;
    if (!url.startsWith('https://')) throw new Error(`resource ${id}: refusing a non-https address`);
    const { type, body } = await get(url, { portal: true });
    if (!/csv|text|octet-stream/i.test(type)) throw new Error(`${name}: content-type ${type}, expected CSV`);
    commit(file, body, isCsv(type, col));
    writeFileSync(join(SRC, dir, `${name}.source.json`), JSON.stringify({ resource_id: id, url, licence: meta.result.license_id ?? null, fetched: new Date().toISOString() }, null, 2));
    console.log(`  got ${dir}/${name} (${kb(body.length)})`);
  }
}

/** One CSV per district, built from 1,000-row pages of the datastore API saved one by one. */
async function udise() {
  for (const district of UDISE_DISTRICTS) {
    const out = join(SRC, 'udise', `udise-${district.toLowerCase()}.csv`);
    if (good(out, 10_000)) { console.log(`  have udise/${district} (${kb(statSync(out).size)})`); continue; }
    const pages = join(SRC, 'udise', `pages-${district.toLowerCase()}`);
    mkdirSync(pages, { recursive: true });
    const filters = encodeURIComponent(JSON.stringify({ state_name: 'Uttar Pradesh', district_name: district }));
    let total = Infinity, header = null;
    for (let offset = 0; offset < total; offset += PAGE) {
      const pf = join(pages, `${String(offset).padStart(6, '0')}.json`);
      let page;
      if (!FORCE && existsSync(pf)) page = JSON.parse(readFileSync(pf, 'utf8'));
      else {
        const url = `${CKAN}/datastore_search?resource_id=${UDISE_RESOURCE}&filters=${filters}&limit=${PAGE}&offset=${offset}&records_format=csv`;
        const { type, body } = await get(url, { portal: true });
        if (!/json/i.test(type)) throw new Error(`UDISE ${district} @${offset}: content-type ${type}`);
        const j = JSON.parse(body.toString('utf8'));
        if (!j.success || typeof j.result?.records !== 'string') throw new Error(`UDISE ${district} @${offset}: not a successful CSV page`);
        page = { total: j.result.total, fields: j.result.fields.map((f) => f.id), records: j.result.records };
        writeFileSync(`${pf}.part`, JSON.stringify(page));
        renameSync(`${pf}.part`, pf);
        console.log(`  udise ${district}: rows ${offset}–${Math.min(offset + PAGE, page.total)} of ${page.total}`);
      }
      total = page.total;
      header = page.fields;
    }
    const parts = readdirSync(pages).filter((f) => f.endsWith('.json')).sort();
    const body = [header.join(','), ...parts.map((f) => JSON.parse(readFileSync(join(pages, f), 'utf8')).records.replace(/\s+$/, ''))].join('\n') + '\n';
    const rows = body.split('\n').filter((l) => /^\d/.test(l)).length;
    commit(out, Buffer.from(body), isCsv('text/csv', 'udise_school_code'));
    console.log(`  built udise/${district} (${kb(body.length)}, about ${rows} rows; the API reported ${total})`);
    rmSync(pages, { recursive: true, force: true });
  }
}

/** The Aspirational Blocks files: their addresses are read off the page that lists them, never guessed. */
async function aspirational() {
  const want = ABP_FILES.filter(([name]) => !good(join(SRC, 'aspirational', name), 5_000));
  for (const [name] of ABP_FILES.filter((f) => !want.includes(f))) console.log(`  have aspirational/${name} (${kb(statSync(join(SRC, 'aspirational', name)).size)})`);
  if (!want.length) return;
  const page = await get(ABP_PAGE);
  if (!/html/i.test(page.type)) throw new Error(`${ABP_PAGE}: content-type ${page.type}`);
  const hrefs = [...page.body.toString('utf8').matchAll(/href="([^"]+\.xlsx)"/gi)].map((m) => m[1]);
  for (const [name, onPage] of want) {
    const href = hrefs.find((h) => decodeURIComponent(h.split('/').pop()) === onPage);
    if (!href) throw new Error(`the page no longer lists "${onPage}"`);
    const url = new URL(href.replace(/ /g, '%20'), ABP_PAGE).href;
    if (!url.startsWith('https://epariyojana.up.gov.in/')) throw new Error(`refusing an address off the site: ${url}`);
    const { type, body } = await get(url);
    commit(join(SRC, 'aspirational', name), body, isXlsx(type));
    writeFileSync(join(SRC, 'aspirational', `${name}.source.json`), JSON.stringify({ url, page: ABP_PAGE, fetched: new Date().toISOString() }, null, 2));
    console.log(`  got aspirational/${name} (${kb(body.length)})`);
  }
}

/** PGI-D grades for every UP district, one small JSON per year and category, one request every 2 s. */
async function pgid() {
  let have = 0;
  for (const yr of PGID_YEARS) for (const cat of PGID_CATS) {
    const file = join(SRC, 'pgid', `up-${yr}-${cat}.json`);
    if (good(file, 1000)) { have++; continue; }
    const { type, body } = await get(`${PGID}/${yr}/uttar%20pradesh/${cat}`);
    if (!/json/i.test(type)) throw new Error(`PGI-D ${yr}/${cat}: content-type ${type}`);
    commit(file, body, isJson((j) => {
      const d = j?.categorywiseData;
      if (!d || typeof d !== 'object') return 'no categorywiseData';
      if (Object.keys(d).length < 70) return `only ${Object.keys(d).length} districts`;
      return ['RAMPUR', 'LUCKNOW', 'VARANASI'].every((k) => d[k]?.grades) ? null : 'a demo district is missing';
    }));
    console.log(`  got pgid/up-${yr}-${cat}.json (${kb(body.length)})`);
  }
  if (have) console.log(`  have ${have} PGI-D files`);
  writeFileSync(join(SRC, 'pgid', 'source.json'), JSON.stringify({
    api: `${PGID}/{year}/uttar%20pradesh/{category}`, years: { 5: '2022-23', 6: '2023-24', 7: '2024-25', 8: '2025-26' },
    categories: { 0: 'Overall', 1: 'Outcomes', 2: 'Effective Classroom Transaction', 3: 'Infrastructure, Facilities, Student Entitlements', 4: 'School Safety and Child Protection', 5: 'Digital Learning', 6: 'Governance Processes' },
    labels_from: 'the category drop-down and category cards of https://dpgi.udiseplus.gov.in/ (value 0 is "Overall")', fetched: new Date().toISOString(),
  }, null, 2));
}

/** Census 2011 PCA rows for the three districts and for Uttar Pradesh, through the datastore API (not the 18–216 MB files). */
async function census() {
  const jobs = [...CENSUS_LGD.map((lgd) => [`district-${lgd}.json`, CENSUS_DISTRICTS, { state_code: '09', district_code: String(lgd) }]),
    ['state-09.json', CENSUS_STATES, { state_code: '09' }]];
  for (const [name, rid, filters] of jobs) {
    const file = join(SRC, 'census', name);
    if (good(file, 1000)) { console.log(`  have census/${name} (${kb(statSync(file).size)})`); continue; }
    const url = `${CKAN}/datastore_search?resource_id=${rid}&limit=2000&filters=${encodeURIComponent(JSON.stringify(filters))}`;
    const { type, body } = await get(url, { portal: true });
    if (!/json/i.test(type)) throw new Error(`census ${name}: content-type ${type}`);
    commit(file, body, isJson((j) => {
      if (!j.success || !Array.isArray(j.result?.records)) return 'not a successful datastore answer';
      if (!j.result.records.length) return 'no rows';
      if (j.result.total > j.result.records.length) return `only ${j.result.records.length} of ${j.result.total} rows in one page`;
      return j.result.records.every((r) => r.state_code === '09' && (!filters.district_code || r.district_code === filters.district_code)) ? null : 'rows from another area';
    }));
    console.log(`  got census/${name} (${kb(body.length)})`);
  }
  if (!existsSync(join(SRC, 'census', 'source.json'))) {
    const meta = JSON.parse((await get(`${CKAN}/package_show?id=census-pca-demography`, { portal: true })).body.toString('utf8'));
    writeFileSync(join(SRC, 'census', 'source.json'), JSON.stringify({ dataset: 'census-pca-demography', licence: meta.result?.license_id || null,
      licence_title: meta.result?.license_title || null, resources: { districts: CENSUS_DISTRICTS, states: CENSUS_STATES }, fetched: new Date().toISOString() }, null, 2));
  }
}

/**
 * PM SHRI schools in the three districts. The portal has no export and its API answers are
 * encrypted for its own page, so the public search page is rendered in headless Chrome and the
 * school cards it shows are read: only the UDISE code, the school category and whether it is a
 * Kendriya or Navodaya Vidyalaya are kept (raw, never committed). A handful of page loads, one
 * at a time; if the site asks for a captcha or a login, the step stops rather than work around it.
 */
async function pmshri() {
  const todo = PMSHRI_DISTRICTS.filter(([lgd]) => !good(join(SRC, 'pmshri', `district-${lgd}.json`), 100));
  for (const [lgd] of PMSHRI_DISTRICTS.filter((d) => !todo.includes(d))) console.log(`  have pmshri/district-${lgd}.json`);
  if (!todo.length) return;
  let chromium;
  try { ({ chromium } = await import('playwright-core')); } catch { throw new Error('playwright-core is not installed (npm install), so the PM SHRI page cannot be rendered'); }
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const blocked = async () => /captcha|are you a robot|access denied|verify you are human/i.test(await page.evaluate(() => document.body.innerText))
      || (await page.locator('input[type=password], iframe[src*="captcha"]').count()) > 0;
    await page.goto(PMSHRI_HOME, { waitUntil: 'networkidle', timeout: 90_000 });
    if (await blocked()) throw new Error('the site shows a captcha or login; stopped');
    await page.locator('a[href="/state"]').first().click();
    await page.waitForLoadState('networkidle');
    await sleep(2000);
    const selects = page.locator('select');
    const stateVal = await selects.nth(0).evaluate((s) => [...s.options].find((o) => o.text.trim().toLowerCase() === 'uttar pradesh')?.value);
    if (!stateVal) throw new Error('Uttar Pradesh is not in the state list');
    await selects.nth(0).selectOption(stateVal);
    await page.waitForLoadState('networkidle');
    await sleep(2000);
    for (const [lgd, name] of todo) {
      const val = await selects.nth(1).evaluate((s, want) => [...s.options].find((o) => o.value.split(',')[0] === want)?.value, String(lgd));
      if (!val || !val.toUpperCase().includes(name)) throw new Error(`district ${lgd} (${name}) is not in the list (${val})`);
      await selects.nth(1).selectOption(val);
      await page.waitForLoadState('networkidle');
      await sleep(1500);
      const search = page.getByText('Search', { exact: true });
      if (await search.count()) { await search.first().click(); await page.waitForLoadState('networkidle'); }
      await sleep(2500);
      const n = await selects.count();
      for (let i = 0; i < n; i++) {
        if (await selects.nth(i).evaluate((s) => [...s.options].some((o) => o.value === '50' || o.text.trim() === '50'))) {
          await selects.nth(i).selectOption({ label: '50' });
          await page.waitForLoadState('networkidle');
          await sleep(2500);
          break;
        }
      }
      if (await blocked()) throw new Error('the site shows a captcha or login; stopped');
      const text = await page.evaluate(() => document.body.innerText);
      const shown = /Showing (\d+) Results for Search:([^\n]*)/.exec(text);
      if (!shown || !shown[2].toUpperCase().includes(name)) throw new Error(`${name}: the results header was not found (${shown?.[0] ?? 'none'})`);
      const total = Number(shown[1]);
      const cards = text.split(/UDISE Code:\s*/).slice(1).map((chunk) => {
        const field = (k) => new RegExp(`${k}\\s*:\\s*([^\\n]*)`).exec(chunk)?.[1].trim() ?? '';
        const mgmt = field('School Management');
        return { udise: chunk.slice(0, 11), district: field('Districts').toUpperCase(), category: field('School Category'), kvs: /kendriya/i.test(mgmt), nvs: /navodaya/i.test(mgmt) };
      });
      if (cards.length !== total) throw new Error(`${name}: ${cards.length} cards on the page but ${total} results (more than one page?)`);
      // A Kendriya Vidyalaya card names its KVS region (e.g. Agra) and a Navodaya card its NVS
      // regional office where the others name the district; the search itself is by district.
      const off = cards.find((c) => !/^\d{11}$/.test(c.udise) || (!c.kvs && !c.nvs && !c.district.includes(name)));
      if (off) throw new Error(`${name}: a card without an 11-digit code or from another district (district "${off.district}", code ${/^\d{11}$/.test(off.udise) ? 'ok' : 'malformed'})`);
      const out = { lgd, district: name, total, fetched: new Date().toISOString(), page: `${PMSHRI_HOME}state`,
        schools: cards.map(({ udise, category, kvs, nvs }) => ({ udise, category, kvs, nvs })) };
      commit(join(SRC, 'pmshri', `district-${lgd}.json`), Buffer.from(JSON.stringify(out, null, 1)), () => null);
      console.log(`  got pmshri/district-${lgd}.json (${name}: ${total} PM SHRI schools)`);
      await sleep(3000);
    }
  } finally {
    await browser.close();
  }
}

const steps = {
  udise: () => udise(),
  parakh: () => pdfs('parakh', PARAKH),
  aser: () => pdfs('aser', ASER),
  nfhs: () => ckanFiles('nfhs', NFHS),
  pab: () => pdfs('pab', PAB),
  lgd: () => ckanFiles('lgd', LGD),
  aspirational: () => aspirational(),
  pgid: () => pgid(),
  census: () => census(),
  pmshri: () => pmshri(),
};
const failed = [];
for (const [name, run] of Object.entries(steps)) {
  if (only && only !== name) continue;
  console.log(`${name}:`);
  try { await run(); } catch (e) { failed.push(name); console.error(`  FAILED: ${e.message}`); }
}
let total = 0;
const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p); else total += statSync(p).size; } };
if (existsSync(SRC)) walk(SRC);
console.log(`\n${SRC}: ${kb(total)} in all.`);
if (failed.length) { console.error(`Failed: ${failed.join(', ')}. Run again to resume.`); process.exit(1); }
console.log('Next: npm run data:build');
