#!/usr/bin/env node
/**
 * Loads the field workers' and officers' pages in Hindi and reports any English interface text.
 *
 * Data is allowed to be in English, because that is how it is stored: school and village names,
 * people's names, complaint titles, case titles, reasons officers typed. So each piece of text
 * on the page is checked against the database first; only text that is not data, and still
 * contains Latin letters once ids and accepted acronyms are removed, is reported.
 *
 *   node scripts/hindi-check.mjs [baseUrl]
 */
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const db = new DatabaseSync(join(process.cwd(), '.data', 'karyavahi.db'), { readOnly: true });
// Some tables are created by the app on first use, so a missing one is simply empty.
const q = (sql, ...p) => { try { return db.prepare(sql).all(...p); } catch { return []; } };

// Every string the field pages may show from the data, joined so a substring test is one search.
const DATA = [
  ...q('select name v from schools'), ...q('select village v from schools'), ...q('select full_name v from users'),
  ...q('select name v from clusters'), ...q('select name v from blocks'), ...q('select name v from districts'),
  ...q('select name v from interventions'), ...q('select title v from cases'),
  ...q(`select title v from complaints`), ...q(`select coalesce(rejection_reason, '') v from evidence`),
  ...q(`select coalesce(reassign_reason, '') v from tasks`), ...q(`select coalesce(deadline_change_reason, '') v from tasks`),
  ...q(`select coalesce(notes, '') v from visits`), ...q(`select coalesce(description, '') v from blockers`),
  ...q(`select steps v from interventions`), ...q(`select resources v from interventions`),
  ...q(`select coalesce(json_extract(summary, '$.note'), '') v from evidence`),
  // Officer pages also show what people typed and what the system stored about a record.
  ...q(`select title_en v from tasks`),
  ...q(`select title v from reports`), ...q(`select coalesce(reason, '') v from approvals`),
  ...q(`select name_en v from competencies`), ...q(`select coalesce(description, '') v from complaints`),
  ...q(`select name v from states`), ...q(`select file_name v from import_batches`),
  ...q(`select code v from assessment_rounds`), ...q(`select label v from assessment_rounds`),
  ...q(`select coalesce(note, '') v from complaint_events where actor_user_id is not null`), ...q(`select coalesce(resolution_summary, '') v from complaints`),
  ...q(`select coalesce(change_note, '') v from setting_versions`),
].map((r) => String(r.v)).join('\u0001');

/**
 * Longer stored text that officer pages quote: the intervention library (written in English),
 * stored diagnoses and plan drafts, proof file names. Matched whole, never as a substring, so a
 * short interface word cannot hide inside a long record.
 */
const leaves = (v, out) => {
  if (typeof v === 'string') { out.add(v.trim()); try { const j = JSON.parse(v); if (j && typeof j === 'object') leaves(j, out); } catch { /* plain text */ } }
  else if (Array.isArray(v)) v.forEach((x) => leaves(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => leaves(x, out));
  return out;
};
const STORED = new Set();
for (const sql of ['select * from interventions', 'select observations, ranked_factors, ai_hypothesis, human_conclusion, method_note from diagnoses',
  'select rationale from case_plans', 'select file_name, channel from evidence', 'select summary from case_events', 'select label from assessment_rounds']) {
  for (const r of q(sql)) leaves(Object.values(r), STORED);
}

/** Words that are the same in Hindi interface text: role and scheme acronyms, units, the brand. */
const ACCEPTED = new Set(['CRC', 'BRC', 'BEO', 'DEO', 'HM', 'AI', 'PAB', 'GPS', 'KB', 'MB', 'pp', 'Karyavahi', 'Claude', 'ID', 'PTR',
  // Names of sources, schemes, file formats and channels, written the same way in Hindi.
  'ASER', 'NFHS', 'UDISE', 'PARAKH', 'PRS', 'NIPUN', 'FLN', 'TaRL', 'SMC', 'ATR', 'CSV', 'PDF', 'XLSX', 'API', 'SMS', 'IVR', 'WhatsApp',
  'NCERT', 'LGD', 'ODbL', 'ODC', 'BY', 'SD', 'PRABANDH', 'ShikshaLokam', 'ELEVATE', 'cQube', 'English', 'z', 'Opus',
  // Products, organisations and laws named inside Hindi sentences on the roadmap and sources pages.
  'MoU', 'Glific', 'Meta', 'Exotel', 'VSK', 'OpenAPI', 'TRAI', 'DLT', 'SQLite', 'Postgres', 'pgvector', 'Android', 'DPDP',
  'UP', 'ISB', 'IIPS', 'TLM', 'RTE', 'NAS', 'DiD',
  // Keyboard keys, and the model id shown beside "connected" when a Claude key is configured.
  'Enter', 'Shift', 'claude', 'opus']);
/** Names of more than one word, removed before the words are checked. */
const PHRASES = ['India Data Portal', 'Meta Cloud API', 'J-PAL', 'API v1', 'UDISE+', 'karyavahi-seed v1.0', 'seed 20261024'];
/** Record ids ("CASE-0184", "TSK-00412") and assessment round codes ("R4"). */
const ID = /\b[A-Z]{2,5}-\d{2,}(?:-\d+)?\b|\bR\d\b/g;

const pick = (sql, ...p) => db.prepare(sql).get(...p);
const hmTask = pick(`select t.owner_user_id u, t.id from tasks t where t.owner_role = 'headmaster' and t.status in ('in_progress','sent_back') order by t.id limit 1`);
const ACCOUNTS = [
  { email: 'crc.clu-001@demo.karyavahi.test', routes: ['/today', '/field', '/tasks'] },
  { email: 'brc1.blk-01@demo.karyavahi.test', routes: ['/today', '/tasks'] },
  { userId: hmTask.u, routes: ['/today', '/school', '/tasks', `/tasks/${hmTask.id}`] },
];
for (const a of ACCOUNTS.slice(0, 2)) {
  const t = pick(`select t.id from tasks t join users u on u.id = t.owner_user_id where u.email = ? order by t.status = 'verified', t.id limit 1`, a.email);
  if (t) a.routes.push(`/tasks/${t.id}`);
}

/** The officers' desks. A `*` route is filled in from the first matching link on the page before it. */
const OFFICER = ['/overview', '/today', '/cases', '/cases/*', '/execution', '/tasks/*', '/execution?tab=overdue&view=table', '/execution?tab=blockers', '/execution?tab=workload', '/hotspots', '/hotspots?view=list',
  '/reports', '/reports/*', '/interventions', '/evidence', '/notifications', '/assistant', '/complaints', '/changes', '/approvals', '/findings'];
ACCOUNTS.push(
  { email: 'beo.blk-01@demo.karyavahi.test', routes: [...OFFICER, '/schools/SCH-00412', '/roadmap', '/sources'] },
  { email: 'deo.rmp@demo.karyavahi.test', routes: [...OFFICER, '/findings/*', '/district', '/schools', '/impact', '/visits', '/reports/new', '/interventions/compare'] },
  { email: 'state.analyst@demo.karyavahi.test', routes: ['/overview', '/state', '/hotspots', '/reports', '/reports/*', '/notifications', '/assistant'] },
  { email: 'crc.clu-001@demo.karyavahi.test', routes: ['/notifications', '/assistant', '/complaints/new', '/complaints', '/complaints/*'] },
);
/** Where a `*` route finds its record: the first link of that shape on the previous page. */
const LINK = { '/cases/*': /href="\/cases\/(CASE-\d+)"/, '/tasks/*': /href="\/tasks\/(TSK-[\w-]+)"/, '/reports/*': /href="\/reports\/(RPT-[\w-]+)"/,
  '/findings/*': /href="\/findings\/(FND-\d+)"/, '/complaints/*': /href="\/complaints\?(?:[^"]*&amp;)?open=(CMP-\d+)/ };

async function signIn(a) {
  const body = new URLSearchParams(a.email ? { email: a.email } : { user_id: a.userId });
  const res = await fetch(`${BASE}/api/sign-in`, { method: 'POST', body, redirect: 'manual' });
  const token = /kv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
  if (!token) throw new Error(`could not sign in ${a.email ?? a.userId}`);
  return `kv_session=${token}; kv_lang=hi`;
}

/**
 * The text pieces a reader sees in the page body, split where markup splits them, and the words
 * a screen reader or a tooltip gives them (aria-label, title, placeholder).
 */
function textPieces(html) {
  const body = html.slice(html.indexOf('<body'))
    .replace(/<[^>]*?\s(?:placeholder|title|aria-label)="([^"]*)"[^>]*>/g, (tag, said) => `<i>${said}</i>${tag}`);
  return body
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, '\u0000')
    .replace(/<[^>]+>/g, '\u0000')
    .split('\u0000')
    .map((t) => t.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Avatar initials ("PG"), short hashes ("4e0dfa0e…3278") and the word "sha256" beside them, audit
 * action codes shown in monospace ("case.created"), settings versions ("SET-v2") and model ids
 * ("simulated-template-v1"), and file names ("assessment_R3_KSG_v2.csv").
 */
const CODE = /^[A-Z]{1,3}$|^[0-9a-f]{6,}…[0-9a-f]{3,}$|^·? ?sha256$|^[a-z_]+(\.[a-z_]+)+$|^SET-v\d+$|^[a-z0-9.]+(-[a-z0-9.]+)*-v?\d[\w.]*$|^[\w.-]+\.(csv|xlsx|pdf|jpe?g|png)$/;

/** Whether the text is two or more stored values written one after another. */
function storedRun(s, depth = 0) {
  if (depth > 0 && STORED.has(s)) return true;
  if (depth > 6) return false;
  for (let i = s.indexOf(' '); i > 0; i = s.indexOf(' ', i + 1)) {
    if (STORED.has(s.slice(0, i)) && storedRun(s.slice(i + 1), depth + 1)) return true;
  }
  return false;
}

/** One run of Latin text is fine when it is data, an id, or accepted words. */
function englishRun(s) {
  if (CODE.test(s) || DATA.includes(s) || STORED.has(s)) return false;
  // Data joined together: an intervention's resources (", "), or a case title and a task title (" — ").
  const parts = s.split(/, | — /);
  if (parts.length > 1 && parts.every((part) => DATA.includes(part) || STORED.has(part))) return false;
  // Several stored lines run together, such as an intervention's limitations.
  if (storedRun(s)) return false;
  const rest = PHRASES.reduce((t, ph) => t.split(ph).join(' '), s).replace(ID, ' ').split(/[^A-Za-z]+/).filter((w) => w && !ACCEPTED.has(w));
  return rest.length > 0 && !rest.every((w) => DATA.includes(w) && /^[A-Z]/.test(w));
}

/**
 * A piece leaks when the whole of it is English interface text, or when, in a Hindi sentence, a
 * run of Latin words between the Hindi is neither data nor an accepted word ("CASE-0184 पर Plan
 * approved"). Data quoted inside Hindi ("Rampur में 3 प्रकरण") is checked run by run.
 */
function leaks(pieces) {
  const out = [];
  for (const p of pieces) {
    if (!/[A-Za-z]/.test(p)) continue;
    if (!englishRun(p)) continue;
    if (/[\u0900-\u097F]/.test(p)) {
      // Ids split runs too, so "<reason typed by an officer> (TSK-00412 पर दर्ज…)" checks the reason alone.
      const runs = p.split(new RegExp(`[\\u0900-\\u097F][\\u0900-\\u097F\\s]*|${ID.source}`)).map((r) => r.replace(/^[\s\p{P}\p{S}\d]+|(?:[\s\p{P}\p{S}]+\d*)+$/gu, ''))
        .filter((r) => /[A-Za-z]/.test(r));
      if (runs.every((r) => !englishRun(r))) continue;
    }
    out.push(p);
  }
  return [...new Set(out)];
}

let problems = 0;
for (const a of ACCOUNTS) {
  const cookie = await signIn(a);
  let prev = '';
  for (let route of a.routes) {
    if (LINK[route]) {
      const m = LINK[route].exec(prev);
      if (!m) { problems++; console.log(`FAIL ${(a.email ?? a.userId).padEnd(34)} ${route}\n       no link to follow`); continue; }
      route = route.replace('*', m[1]);
    }
    const res = await fetch(`${BASE}${route}`, { headers: { cookie }, redirect: 'manual' });
    const html = res.status === 200 ? await res.text() : '';
    prev = html;
    const found = res.status === 200 ? leaks(textPieces(html)) : [`HTTP ${res.status}`];
    const who = (a.email ?? a.userId).padEnd(34);
    if (found.length === 0) console.log(`ok   ${who} ${route}`);
    else {
      problems += found.length;
      console.log(`FAIL ${who} ${route}`);
      for (const f of found.slice(0, 60)) console.log(`       "${f.slice(0, 110)}"`);
    }
  }
}
console.log(`\n${problems === 0 ? 'no English interface text on the field or officer pages' : `${problems} English piece(s) of interface text`}`);
process.exit(problems === 0 ? 0 : 1);
