/**
 * The real WhatsApp channel (Meta Cloud API test number), with Meta mocked: globalThis.fetch is
 * replaced, so no request leaves this machine. Covers the configuration, the Graph requests
 * (URL, headers, bodies for text, reply buttons and the hello_world template), the 24-hour
 * window, retries, the outbox status, the webhook handshake and signature, idempotency, status
 * callbacks, the "hi" menu, button taps and replies acting through the real write layer with its
 * authority checks, photos as proof (download, limits, duplicates), and that no phone number
 * reaches the database, the audit chain or the logs.
 *
 *   npx tsx --conditions=react-server scripts/whatsapp-test.mts                          (in-process, scratch DB)
 *   npx tsx --conditions=react-server scripts/whatsapp-test.mts http://localhost:3121    (HTTP checks only)
 *
 * The HTTP checks need a server started with the same test values this script uses:
 *   WHATSAPP_APP_SECRET=test-app-secret-not-real WHATSAPP_VERIFY_TOKEN=kv-verify-test-123 \
 *   WHATSAPP_TEST_RECIPIENTS=admin@demo.karyavahi.test=+15550003333 npx next start -p 3121
 * (no access token: that server never calls Meta).
 *
 * Without a server address it works on a scratch copy of the pristine seed and puts the live
 * file back afterwards.
 */
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';

const BASE = process.argv[2]?.replace(/\/$/, '');
const SECRET = 'test-app-secret-not-real';
const VERIFY = 'kv-verify-test-123';
const TOKEN = `EAAFAKE${'t0k3n'.repeat(8)}`;
const PHONE_ID = '109876543210987';
const NUM_A = '+15550001111';
const NUM_B = '+15550002222';
const NUM_ADMIN = '+15550003333';
const NUM_STRANGER = '+15550009876';
const ALL_NUMBERS = [NUM_A, NUM_B, NUM_ADMIN, NUM_STRANGER];

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
};
const sign = (raw: Uint8Array | string, secret = SECRET) => `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
const digits = (p: string) => p.replace(/\D/g, '');
/** The forms a number could leak in: digits, E.164, and base64 as WhatsApp message ids carry it. */
const leakForms = (p: string) => [digits(p), p, Buffer.from(digits(p)).toString('base64').replace(/=+$/, '')];
const hookBody = (o: { messages?: unknown[]; statuses?: unknown[]; phoneId?: string }) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: '1234567890', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp', metadata: { display_phone_number: '15550000000', phone_number_id: o.phoneId ?? PHONE_ID },
    ...(o.messages ? { contacts: [{ profile: { name: 'Tester' }, wa_id: '0' }], messages: o.messages } : {}),
    ...(o.statuses ? { statuses: o.statuses } : {}),
  } }] }],
});

// =================================================================== part 2: over HTTP
if (BASE) {
  console.log(`\n— the webhook over HTTP (${BASE}) —`);
  const url = `${BASE}/api/whatsapp/webhook`;
  const hs = (q: Record<string, string>) => fetch(`${url}?${new URLSearchParams(q)}`);
  const good = await hs({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '1158201444' });
  ok('GET handshake with the right verify token echoes the challenge', good.status === 200 && (await good.text()) === '1158201444');
  const bad = await hs({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '1158201444' });
  ok('GET handshake with a wrong verify token is 403', bad.status === 403 && !(await bad.text()).includes('1158201444'));
  const noMode = await hs({ 'hub.verify_token': VERIFY, 'hub.challenge': '1' });
  ok('GET handshake without hub.mode=subscribe is 403', noMode.status === 403);

  const status = JSON.stringify(hookBody({ statuses: [{ id: 'wamid.unknown', status: 'delivered', timestamp: '1700000000', recipient_id: digits(NUM_ADMIN) }] }));
  const post = (body: string, sig?: string | null) => fetch(url, {
    method: 'POST', body, headers: { 'content-type': 'application/json', ...(sig === null ? {} : { 'x-hub-signature-256': sig ?? sign(body) }) },
  });
  ok('POST without a signature is 401', (await post(status, null)).status === 401);
  ok('POST with a wrong signature is 401', (await post(status, sign(status, 'another-secret'))).status === 401);
  ok('POST with a signature over a different body is 401', (await post(status, sign(`${status} `))).status === 401);
  const signed = await post(status);
  ok('POST with the right signature is 200', signed.status === 200);
  const stranger = JSON.stringify(hookBody({ messages: [{ from: digits(NUM_STRANGER), id: `wamid.http${randomBytes(6).toString('hex')}`, timestamp: '1700000000', type: 'text', text: { body: 'hi' } }] }));
  ok('a signed message from an unknown number is answered 200 (and ignored)', (await post(stranger)).status === 200);

  // The page that lists the test recipients shows the number masked, never whole.
  const res = await fetch(`${BASE}/api/sign-in`, { method: 'POST', body: new URLSearchParams({ email: 'admin@demo.karyavahi.test' }), redirect: 'manual' });
  const cookie = `kv_session=${/kv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? ''}`;
  const page = await fetch(`${BASE}/admin/outbox`, { headers: { cookie: `${cookie}; kv_lang=en` } });
  const html = await page.text();
  ok('/admin/outbox answers for the demo admin', page.status === 200);
  ok('it says WhatsApp is simulated (no token on this server)', html.includes('WhatsApp: simulated'));
  ok('it lists the mapped test recipient, masked', html.includes('+1 55•••••33'));
  ok('no phone number appears in the page HTML', ALL_NUMBERS.every((p) => !html.includes(digits(p)) && !html.includes(p)));
  const hi = await fetch(`${BASE}/admin/outbox`, { headers: { cookie: `${cookie}; kv_lang=hi` } });
  ok('in Hindi the header reads "WhatsApp: नकली"', (await hi.text()).includes('WhatsApp: नकली'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

// =================================================================== part 1: in process
const DATA = join(process.cwd(), '.data');
const LIVE = join(DATA, 'karyavahi.db');
const PRISTINE = join(DATA, 'karyavahi.pristine.db');
const BACKUP = join(DATA, 'karyavahi.whatsapptestbackup.db');
if (!existsSync(PRISTINE)) { console.error('No pristine database. Run: npm run db:init'); process.exit(1); }
const swap = (from: string, to: string) => { for (const s of ['-wal', '-shm']) { try { rmSync(`${to}${s}`); } catch {} } copyFileSync(from, to); };
try { rmSync(BACKUP); } catch { /* none */ }
swap(LIVE, BACKUP); swap(PRISTINE, LIVE);

// Everything printed is kept, to check that no token or number was ever logged.
const printed: string[] = [];
for (const m of ['log', 'warn', 'error', 'info'] as const) {
  const orig = console[m].bind(console);
  console[m] = (...a: unknown[]) => { printed.push(a.map(String).join(' ')); orig(...a); };
}

// ------------------------------------------------------------------ the fake Meta
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
const calls: Call[] = [];
const sendFailures: { status: number; code?: number; message?: string }[] = [];
const media = new Map<string, { mime: string; declared: number; bytes: Uint8Array; length?: number }>();
let seq = 0;
/** WhatsApp ids carry the recipient's number in base64, like the real ones. */
const wamid = (num = NUM_A) => `wamid.HBgL${Buffer.from(digits(num)).toString('base64')}FQIAERgS${(++seq).toString(16).toUpperCase().padStart(18, '0')}`;
const realFetch = globalThis.fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url;
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers = Object.fromEntries(new Headers(init?.headers).entries());
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
  calls.push({ url, method, headers, body });
  if (method === 'POST' && url.endsWith('/messages')) {
    const f = sendFailures.shift();
    if (f) return json({ error: { message: f.message ?? 'failure', type: 'OAuthException', code: f.code ?? 1, fbtrace_id: 'x' } }, f.status);
    const to = String((body as { to?: string })?.to ?? '');
    return json({ messaging_product: 'whatsapp', contacts: [{ input: to, wa_id: to }], messages: [{ id: wamid(`+${to}`) }] });
  }
  const m = /^https:\/\/graph\.facebook\.com\/v[\d.]+\/(MEDIA[A-Za-z0-9]+)$/.exec(url);
  if (m && media.has(m[1])) {
    const x = media.get(m[1])!;
    return json({ messaging_product: 'whatsapp', url: `https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=${m[1]}`, mime_type: x.mime, file_size: x.declared, sha256: 'abc', id: m[1] });
  }
  const d = /^https:\/\/lookaside\.fbsbx\.com\/whatsapp_business\/attachments\/\?mid=(MEDIA[A-Za-z0-9]+)$/.exec(url);
  if (d && media.has(d[1])) {
    const x = media.get(d[1])!;
    return new Response(x.bytes, { status: 200, headers: { 'content-type': x.mime, 'content-length': String(x.length ?? x.bytes.length) } });
  }
  throw new Error(`unexpected request in the test: ${method} ${url.slice(0, 80)}`);
}) as typeof fetch;
void realFetch;

const setEnv = (o: Record<string, string | undefined>) => { for (const [k, v] of Object.entries(o)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
for (const k of ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_GRAPH_VERSION', 'WHATSAPP_TEST_RECIPIENTS']) delete process.env[k];

const { loadSession } = await import('../src/lib/session');
const { one, all, run, db, restorePristine } = await import('../src/lib/db');
const { reminderSweep } = await import('../src/lib/write');
const { Refused } = await import('../src/lib/guard');
const feed = await import('../src/lib/feed');
const cfgMod = await import('../src/lib/whatsapp/config');
const sendMod = await import('../src/lib/whatsapp/send');
const out = await import('../src/lib/whatsapp/outbound');
const inb = await import('../src/lib/whatsapp/inbound');
const admin = await import('../src/lib/whatsapp/admin');
sendMod.sendTiming.retryDelayMs = 0;

const n = (sql: string, ...p: (string | number)[]) => Number(one<{ c: number }>(sql, ...p)?.c ?? 0);
const sessOf = (email: string) => {
  const id = one<{ id: string }>('select id from users where lower(email) = ?', email)?.id;
  if (!id) throw new Error(`no account ${email}`);
  return loadSession(id)!;
};
const refused = (label: string, fn: () => unknown, code?: string) => {
  try { fn(); ok(label, false, 'it was ALLOWED'); }
  catch (e) { ok(label, e instanceof Refused && (!code || e.code === code), (e as Error).message); }
};

// The personas: A owns an "assigned" task that gets its T−2 reminder on PERSONA_A_DAY; B owns
// an open task that is overdue by then. Both are WhatsApp users.
const A = one<{ task: string; due: string; user: string; email: string; lang: string; proof_count: number }>(
  `select t.id task, t.due_date due, u.id user, u.email, u.preferred_language lang, t.proof_count from tasks t join users u on u.id = t.owner_user_id
    where u.preferred_channel = 'whatsapp' and u.status = 'active' and u.preferred_language = 'hi' and t.status = 'assigned'
      and t.reminder_sent_at is null and t.submitted_at is null order by t.due_date desc, t.id limit 1`)!;
const DAY = new Date(Date.parse(A.due.slice(0, 10)) - 2 * 86_400_000).toISOString().slice(0, 10);
const B = one<{ task: string; user: string; email: string; lang: string }>(
  `select t.id task, u.id user, u.email, u.preferred_language lang from tasks t join users u on u.id = t.owner_user_id
    where u.preferred_channel = 'whatsapp' and u.status = 'active' and u.preferred_language = 'en' and t.owner_user_id <> ?
      and t.status = 'in_progress' and t.submitted_at is null and t.escalated_at is null and t.due_date < ? order by t.due_date desc, t.id limit 1`, A.user, DAY)!;
console.log(`personas: A ${A.user} (${A.task}, due ${A.due.slice(0, 10)}, hi), B ${B.user} (${B.task}, en); sweep day ${DAY}`);
const RECIPIENTS = `${A.email}=${NUM_A}, ${B.email}=${NUM_B},admin@demo.karyavahi.test=${NUM_ADMIN}, not-an-entry, x@y.z=12345`;
const ON = {
  WHATSAPP_ACCESS_TOKEN: TOKEN, WHATSAPP_PHONE_NUMBER_ID: PHONE_ID, WHATSAPP_APP_SECRET: SECRET,
  WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_TEST_RECIPIENTS: RECIPIENTS,
};

// ------------------------------------------------------------------ configuration
console.log('\n— configuration —');
{
  const { map, invalid } = cfgMod.parseRecipients(RECIPIENTS);
  ok('three valid "email=+number" entries are read', map.size === 3 && map.get(A.email) === NUM_A && map.get(B.email) === NUM_B);
  ok('entries that are not "email=+E.164" are skipped and counted', invalid === 2);
  ok('masking keeps the country code and two digits at each end', cfgMod.maskPhone('+919812345612') === '+91 98•••••12' && cfgMod.maskPhone(NUM_A) === '+1 55•••••11');
  setEnv(ON);
  const cfg = cfgMod.whatsappConfig();
  ok('a sender is matched to the persona by number (WhatsApp writes digits only)', cfgMod.emailForSender(cfg, digits(NUM_B)) === B.email && cfgMod.emailForSender(cfg, digits(NUM_STRANGER)) === null);
  ok('Graph version defaults to v23.0', cfg.version === 'v23.0');
  setEnv({ WHATSAPP_GRAPH_VERSION: 'not a version' });
  ok('a malformed Graph version falls back to the default', cfgMod.whatsappConfig().version === 'v23.0');
  setEnv({ WHATSAPP_GRAPH_VERSION: undefined });
  ok('no numbers in the scrubbed provider text', cfgMod.scrubNumbers(`Recipient ${NUM_A} not allowed (${digits(NUM_B)})`) === 'Recipient [number] not allowed ([number])');
}

// ------------------------------------------------------------------ config off: nothing is sent
console.log('\n— switched off: everything stays simulated —');
{
  setEnv({ ...ON, WHATSAPP_ACCESS_TOKEN: undefined });
  const before = calls.length;
  ok('without a token, a mapped persona\'s row starts as simulated', out.initialDeliveryStatus(A.user, 'whatsapp') === 'simulated_not_sent');
  reminderSweep(null, DAY);
  await out.whatsappIdle();
  ok('the sweep made a WhatsApp row for A', n(`select count(*) c from outbox_messages where user_id = ? and entity_id = ? and channel = 'whatsapp' and template = 'reminder_t_minus_2'`, A.user, A.task) === 1);
  ok('nothing was sent (no request at all)', calls.length === before);
  ok('every new row is simulated_not_sent', n(`select count(*) c from outbox_messages where delivery_status <> 'simulated_not_sent'`) === 0);
  refused('the admin test message is refused while WhatsApp is not configured', () => admin.queueTestMessage(sessOf('admin@demo.karyavahi.test'), A.user), 'not_configured');
  setEnv({ ...ON, WHATSAPP_PHONE_NUMBER_ID: undefined });
  ok('a token without a phone number id is still "not sending"', !cfgMod.whatsappConfig().sending);
}

// Back to the seed, now switched on.
restorePristine();
setEnv(ON);
const adminS = sessOf('admin@demo.karyavahi.test');
const auditor = sessOf('auditor.state@demo.karyavahi.test');
const seqBefore = n('select coalesce(max(seq), 0) c from audit_events');
const evBefore = n('select count(*) c from evidence');
const sends = () => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/messages'));
const lastSends = (k: number) => sends().slice(-k);
type Body = { to: string; type: string; text?: { body: string }; template?: { name: string; language: { code: string } }; interactive?: { body: { text: string }; action: { buttons: { reply: { id: string; title: string } }[] } } };
const bodyOf = (c: Call) => c.body as Body;
const statusOf = (id: string) => one<{ delivery_status: string; provider_message_id: string | null }>('select delivery_status, provider_message_id from outbox_messages where id = ?', id);
let lastPost: ReturnType<typeof inb.acceptWebhook> | null = null;
async function deliver(payload: unknown, sig?: string | null) {
  const raw = Buffer.from(JSON.stringify(payload));
  lastPost = inb.acceptWebhook(raw, sig === undefined ? sign(raw) : sig);
  if (lastPost.work) await lastPost.work();
  await out.whatsappIdle();
  return lastPost;
}
const msg = (from: string, extra: Record<string, unknown>, id = wamid(from)) => ({ from: digits(from), id, timestamp: String(Math.floor(Date.now() / 1000)), ...extra });
const text = (from: string, body: string, id?: string) => msg(from, { type: 'text', text: { body } }, id);
const tap = (from: string, buttonId: string) => msg(from, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: buttonId, title: 'x' } } });
const taskStatus = (id: string) => one<{ status: string }>('select status from tasks where id = ?', id)?.status;

// ------------------------------------------------------------------ sending, window closed
console.log('\n— sending: outside the 24-hour window —');
{
  ok('with token, phone id and a mapping, A\'s rows start as queued', out.initialDeliveryStatus(A.user, 'whatsapp') === 'queued');
  ok('an unmapped WhatsApp user stays simulated', out.initialDeliveryStatus(one<{ id: string }>(`select id from users where preferred_channel = 'whatsapp' and id not in (?, ?) limit 1`, A.user, B.user)!.id, 'whatsapp') === 'simulated_not_sent');
  ok('IVR and SMS are never sent', out.initialDeliveryStatus(A.user, 'sms') === 'simulated_not_sent');
  const before = sends().length;
  const r = reminderSweep(null, DAY);
  ok('the sweep itself returned without waiting for WhatsApp', r.remindersSent > 0);
  await out.whatsappIdle();
  // (The seed already has a simulated "task_assigned" row for some tasks; these are the sweep's.)
  const rowA = one<{ id: string }>(`select id from outbox_messages where user_id = ? and entity_id = ? and channel = 'whatsapp' and template = 'reminder_t_minus_2'`, A.user, A.task)!;
  const rowB = one<{ id: string }>(`select id from outbox_messages where user_id = ? and entity_id = ? and channel = 'whatsapp' and template = 'overdue_nudge'`, B.user, B.task)!;
  const made = sends().slice(before);
  ok('one request per mapped persona: hello_world, because neither has written yet', made.length === 2 && made.every((c) => bodyOf(c).type === 'template'), String(made.length));
  const c = made.find((x) => bodyOf(x).to === digits(NUM_A))!;
  ok('the request goes to graph.facebook.com/v23.0/{phone id}/messages', c?.url === `https://graph.facebook.com/v23.0/${PHONE_ID}/messages`);
  ok('with the token as a Bearer header and JSON content', c?.headers.authorization === `Bearer ${TOKEN}` && c.headers['content-type'] === 'application/json');
  ok('and nowhere else (not in the URL, not in the body)', !c.url.includes(TOKEN) && !JSON.stringify(c.body).includes(TOKEN));
  ok('the template body: hello_world, en_US, to the number in digits', JSON.stringify(c.body) === JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: digits(NUM_A), type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } }));
  ok('A\'s reminder waits for the window (awaiting_reply, no provider id yet)', statusOf(rowA.id)?.delivery_status === 'awaiting_reply' && statusOf(rowA.id)?.provider_message_id === null);
  ok('B\'s overdue nudge waits too', statusOf(rowB.id)?.delivery_status === 'awaiting_reply');
  ok('every other WhatsApp row of the sweep stayed simulated', n(`select count(*) c from outbox_messages where channel = 'whatsapp' and user_id not in (?, ?) and delivery_status <> 'simulated_not_sent'`, A.user, B.user) === 0
    && n(`select count(*) c from outbox_messages where channel = 'whatsapp' and delivery_status = 'simulated_not_sent'`) > 0);

  refused('a non-admin cannot send a test message', () => admin.queueTestMessage(sessOf(A.email), A.user), 'role');
  refused('a test message to an unmapped person is refused', () => admin.queueTestMessage(adminS, one<{ id: string }>(`select id from users where id not in (?, ?) and preferred_channel = 'whatsapp' limit 1`, A.user, B.user)!.id), 'not_mapped');
  const t1 = admin.queueTestMessage(adminS, A.user);
  await out.whatsappIdle();
  ok('a second message within the day sends no second hello_world: it just waits', sends().length === before + 2 && statusOf(t1)?.delivery_status === 'awaiting_reply');
}

// ------------------------------------------------------------------ webhook: signature and handshake
console.log('\n— webhook: handshake and signature —');
{
  const hs = (q: Record<string, string>) => inb.verifyHandshake(new URLSearchParams(q));
  ok('handshake with the right token echoes hub.challenge', JSON.stringify(hs({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '987654' })) === JSON.stringify({ status: 200, body: '987654' }));
  ok('a wrong token is 403', hs({ 'hub.mode': 'subscribe', 'hub.verify_token': `${VERIFY}x`, 'hub.challenge': '1' }).status === 403);
  ok('a token of a different length is 403', hs({ 'hub.mode': 'subscribe', 'hub.verify_token': 'k', 'hub.challenge': '1' }).status === 403);
  ok('the wrong mode is 403', hs({ 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '1' }).status === 403);
  setEnv({ WHATSAPP_VERIFY_TOKEN: undefined });
  ok('with no verify token configured, every handshake is 403', hs({ 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': '1' }).status === 403);
  setEnv(ON);

  const raw = Buffer.from(JSON.stringify(hookBody({ statuses: [] })));
  ok('a missing signature is 401', inb.acceptWebhook(raw, null).status === 401);
  ok('a wrong signature is 401', inb.acceptWebhook(raw, sign(raw, 'not-the-secret')).status === 401);
  ok('a malformed signature header is 401', inb.acceptWebhook(raw, 'sha1=abc').status === 401);
  ok('a signature over another body is 401', inb.acceptWebhook(raw, sign(Buffer.concat([raw, Buffer.from(' ')]))).status === 401);
  ok('the right signature is 200', inb.acceptWebhook(raw, sign(raw)).status === 200);
  const garbage = Buffer.from('{not json');
  ok('a signed body that is not JSON is 400', inb.acceptWebhook(garbage, sign(garbage)).status === 400);
  setEnv({ WHATSAPP_APP_SECRET: undefined });
  ok('without an app secret the webhook refuses (503), whatever the signature', inb.acceptWebhook(raw, sign(raw)).status === 503);
  setEnv(ON);
}

// ------------------------------------------------------------------ "hi": the window opens
console.log('\n— "hi" opens the window: waiting messages, then the menu —');
const hiId = wamid(NUM_A);
{
  const before = sends().length;
  const r = await deliver(hookBody({ messages: [text(NUM_A, 'hi', hiId)] }));
  ok('answered 200 with one message claimed', r.status === 200 && r.counts?.messages === 1);
  const made = sends().slice(before);
  ok('three messages went out: the two that waited, then the menu', made.length === 3, made.map((c) => bodyOf(c).type).join(','));
  const reminder = made.find((c) => bodyOf(c).type === 'interactive');
  const btns = bodyOf(reminder!)?.interactive?.action.buttons.map((b) => b.reply) ?? [];
  ok('the task reminder goes with three reply buttons carrying the task id', btns.length === 3 && btns.map((b) => b.id).join() === `ack:${A.task},start:${A.task},proof:${A.task}`);
  ok('button titles are Hindi for a Hindi persona, at most 20 characters', btns[0]?.title === 'देख लिया ✅' && btns[1]?.title === 'शुरू किया' && btns[2]?.title === 'सबूत भेजें' && btns.every((b) => b.title.length <= 20));
  ok('the body is the Hindi reminder with the 1/2/3 hint', /कार्यवाही अनुस्मारक/.test(bodyOf(reminder!).interactive!.body.text) && bodyOf(reminder!).interactive!.body.text.includes('1 = देख लिया'));
  const test = made.find((c) => bodyOf(c).type === 'text' && bodyOf(c).text!.body.includes('परीक्षण संदेश'));
  ok('the admin\'s test message goes as Hindi text', !!test && JSON.stringify(Object.keys(bodyOf(test))) === JSON.stringify(['messaging_product', 'recipient_type', 'to', 'type', 'text']));
  const menu = made[2] ? bodyOf(made[2]).text?.body ?? '' : '';
  ok('the menu is Hindi and numbers A\'s open tasks', menu.startsWith('नमस्ते') && menu.includes(`1. `) && menu.includes(A.task) && menu.includes('नंबर लिखकर भेजें'));
  const rows = all<{ delivery_status: string; provider_message_id: string | null }>(`select delivery_status, provider_message_id from outbox_messages where user_id = ? and channel = 'whatsapp' and delivery_status <> 'simulated_not_sent'`, A.user);
  ok('both outbox rows are now "sent" with a provider message id', rows.length === 2 && rows.every((x) => x.delivery_status === 'sent' && /^wa_[0-9a-f]{40}$/.test(x.provider_message_id ?? '')));
  ok('the window is open for 24 hours', out.windowOpen(A.user) && !out.windowOpen(A.user, Date.now() + 24 * 3600_000 + 1000));
  ok('the inbound message is audited as A, source whatsapp', n(`select count(*) c from audit_events where seq > ? and action = 'whatsapp.message_received' and actor_user_id = ? and source = 'whatsapp'`, seqBefore, A.user) === 1);

  const dup = await deliver(hookBody({ messages: [text(NUM_A, 'hi', hiId)] }));
  ok('the same message id again (a Meta retry) is a duplicate: nothing is sent', dup.counts?.duplicates === 1 && dup.counts?.messages === 0 && sends().length === before + 3);
}

// ------------------------------------------------------------------ inside the window
console.log('\n— inside the window: sent at once, statuses, retries —');
{
  const before = sends().length;
  const t2 = admin.queueTestMessage(adminS, A.user);
  await out.whatsappIdle();
  ok('a new message for A goes straight out as text (no template)', sends().length === before + 1 && bodyOf(sends().at(-1)!).type === 'text' && statusOf(t2)?.delivery_status === 'sent');

  // Status callbacks, using WhatsApp's own id for the reminder (from the mock's answer order).
  const reminderRow = one<{ id: string; provider_message_id: string }>(`select id, provider_message_id from outbox_messages where user_id = ? and entity_id = ? and channel = 'whatsapp' and template = 'reminder_t_minus_2'`, A.user, A.task)!;
  // Find the wamid the mock returned for that send: re-derive by hashing every id the mock made.
  const ids: string[] = [];
  for (let i = 1; i <= seq; i++) ids.push(`wamid.HBgL${Buffer.from(digits(NUM_A)).toString('base64')}FQIAERgS${i.toString(16).toUpperCase().padStart(18, '0')}`);
  const reminderWamid = ids.find((w) => out.providerKey(w) === reminderRow.provider_message_id)!;
  const testWamid = ids.find((w) => out.providerKey(w) === statusOf(t2)?.provider_message_id)!;
  const st = (id: string, status: string, errors?: unknown[]) => ({ id, status, timestamp: '1700000000', recipient_id: digits(NUM_A), ...(errors ? { errors } : {}) });
  await deliver(hookBody({ statuses: [st(reminderWamid, 'delivered')] }));
  ok('a "delivered" callback marks the outbox row delivered', statusOf(reminderRow.id)?.delivery_status === 'delivered');
  await deliver(hookBody({ statuses: [st(reminderWamid, 'read')] }));
  ok('"read" moves it to read', statusOf(reminderRow.id)?.delivery_status === 'read');
  await deliver(hookBody({ statuses: [st(reminderWamid, 'delivered')] }));
  ok('a late "delivered" does not move it back', statusOf(reminderRow.id)?.delivery_status === 'read');
  await deliver(hookBody({ statuses: [st(testWamid, 'failed', [{ code: 131026, title: `Message undeliverable to ${NUM_A}` }])] }));
  ok('a "failed" callback marks the row failed', statusOf(t2)?.delivery_status === 'failed');
  const note = out.deliveryNotes([t2]).get(t2);
  ok('with a short reason, numbers removed', !!note?.error && note.error.includes('131026') && !note.error.includes(digits(NUM_A)), note?.error ?? '');
  await deliver(hookBody({ statuses: [st(reminderWamid, 'delivered')], phoneId: '999' }));
  ok('events for another phone number id are ignored', statusOf(reminderRow.id)?.delivery_status === 'read');

  // 429 then success: one retry.
  let k = sends().length;
  sendFailures.push({ status: 429, code: 130429, message: 'rate limit' });
  const t3 = admin.queueTestMessage(adminS, A.user);
  await out.whatsappIdle();
  ok('a 429 is tried once more, and the retry\'s success counts', sends().length === k + 2 && statusOf(t3)?.delivery_status === 'sent');
  k = sends().length;
  sendFailures.push({ status: 500 }, { status: 503 });
  const t4 = admin.queueTestMessage(adminS, A.user);
  await out.whatsappIdle();
  ok('two 5xx answers: exactly one retry, then failed', sends().length === k + 2 && statusOf(t4)?.delivery_status === 'failed');
  k = sends().length;
  sendFailures.push({ status: 400, code: 131030, message: `Recipient phone number ${digits(NUM_A)} not in allowed list` });
  const t5 = admin.queueTestMessage(adminS, A.user);
  await out.whatsappIdle();
  const r5 = out.deliveryNotes([t5]).get(t5)?.error ?? '';
  ok('a 400 is not retried; failed with Meta\'s reason, number removed', sends().length === k + 1 && statusOf(t5)?.delivery_status === 'failed' && r5.includes('131030') && !r5.includes(digits(NUM_A)), r5);
  k = sends().length;
  sendFailures.push({ status: 400, code: 131047, message: 'Re-engagement message' });
  const t6 = admin.queueTestMessage(adminS, A.user);
  await out.whatsappIdle();
  ok('WhatsApp saying "outside the window" falls back to hello_world and waits', sends().length === k + 2 && bodyOf(sends().at(-1)!).type === 'template' && statusOf(t6)?.delivery_status === 'awaiting_reply');
}

// ------------------------------------------------------------------ acting on tasks
console.log('\n— replies act through the write layer, as the persona —');
{
  const auditCount = (action: string, actor: string, result = 'success') =>
    n(`select count(*) c from audit_events where seq > ? and action = ? and actor_user_id = ? and source = 'whatsapp' and result = ?`, seqBefore, action, actor, result);
  ok(`A's task starts "assigned"`, taskStatus(A.task) === 'assigned');
  // Wrong persona first: B taps A's button (a forwarded message, or a crafted payload).
  const bBefore = taskStatus(B.task);
  await deliver(hookBody({ messages: [tap(NUM_B, `ack:${A.task}`)] }));
  ok('B tapping "Seen" on A\'s task is refused: A\'s task is unchanged', taskStatus(A.task) === 'assigned');
  ok('the refusal is audited as B, source whatsapp, result failure', auditCount('whatsapp.acknowledge_refused', B.user, 'failure') === 1);
  ok('B is told, in English (B\'s language)', bodyOf(sends().at(-1)!).text?.body === 'This task is not assigned to you.' && bodyOf(sends().at(-1)!).to === digits(NUM_B));
  await deliver(hookBody({ messages: [tap(NUM_B, `start:${A.task}`)] }));
  ok('nor can B start it', taskStatus(A.task) === 'assigned' && auditCount('whatsapp.start_refused', B.user, 'failure') === 1);
  ok('B\'s own task was not touched either', taskStatus(B.task) === bBefore);

  // A unknown number cannot do anything at all.
  const c0 = calls.length;
  const u = await deliver(hookBody({ messages: [tap(NUM_STRANGER, `ack:${A.task}`), text(NUM_STRANGER, '1')] }));
  ok('an unknown sender is ignored: no action, no reply', u.counts?.unknown === 2 && calls.length === c0 && taskStatus(A.task) === 'assigned');
  const unk = one<{ after: string; actor_user_id: string | null }>(`select after, actor_user_id from audit_events where seq > ? and action = 'whatsapp.unknown_sender_ignored' order by seq desc limit 1`, seqBefore);
  ok('it is counted in the audit chain, without the number', !!unk && JSON.parse(unk.after).messages === 2 && unk.actor_user_id === null && leakForms(NUM_STRANGER).every((f) => !unk.after.includes(f)));

  // A taps "Seen" on the reminder.
  await deliver(hookBody({ messages: [tap(NUM_A, `ack:${A.task}`)] }));
  ok('A tapping "Seen" acknowledges the task', taskStatus(A.task) === 'acknowledged');
  ok('through acknowledgeTask: task.acknowledged audited as A with source whatsapp', auditCount('task.acknowledged', A.user) === 1);
  ok('A gets the confirmation in Hindi', (bodyOf(sends().at(-1)!).text?.body ?? '').startsWith('दर्ज हुआ: आपने'));
  await deliver(hookBody({ messages: [tap(NUM_A, `ack:${A.task}`)] }));
  ok('tapping "Seen" again is refused politely (already acknowledged)', (bodyOf(sends().at(-1)!).text?.body ?? '').includes('पहले ही हो चुका') && auditCount('whatsapp.acknowledge_refused', A.user, 'failure') === 1);
  await deliver(hookBody({ messages: [text(NUM_A, '2')] }));
  ok('replying "2" about the task in context starts it', taskStatus(A.task) === 'in_progress' && auditCount('task.started', A.user) === 1);
  await deliver(hookBody({ messages: [text(NUM_A, '3')] }));
  ok('replying "3" asks for the photo', (bodyOf(sends().at(-1)!).text?.body ?? '').includes('सबूत की फ़ोटो यहीं भेजें'));

  // The menu: "hi", then a number chooses a task.
  await deliver(hookBody({ messages: [text(NUM_B, 'hello')] }));
  const menuB = bodyOf(sends().at(-1)!).text?.body ?? '';
  ok('B\'s "hello" gets B\'s menu in English', menuB.startsWith('Namaste') && menuB.includes(B.task) && !menuB.includes(A.task));
  await deliver(hookBody({ messages: [text(NUM_B, '1')] }));
  const card = bodyOf(sends().at(-1)!);
  ok('"1" after the menu shows the first task with its buttons', card.type === 'interactive' && card.interactive!.action.buttons[0].reply.id.startsWith('ack:TSK-') && card.interactive!.action.buttons[0].reply.title === 'Seen ✅');
  await deliver(hookBody({ messages: [text(NUM_B, A.task)] }));
  ok('B writing A\'s task id gets "not assigned to you", not the task', bodyOf(sends().at(-1)!).text?.body === 'This task is not assigned to you.');
}

// ------------------------------------------------------------------ photos as proof
console.log('\n— a photo is proof —');
{
  const jpeg = (size = 2048) => { const b = randomBytes(size); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0; return new Uint8Array(b); };
  const img = (from: string, mediaId: string, caption?: string, id?: string) => msg(from, { type: 'image', image: { id: mediaId, mime_type: 'image/jpeg', sha256: 'x', ...(caption ? { caption } : {}) } }, id);
  const evidenceFor = (task: string) => all<{ id: string; channel: string; gps_status: string; client_id: string; summary: string; status: string }>(
    'select id, channel, gps_status, client_id, summary, status from evidence where task_id = ? and submitted_at >= ? order by id', task, '2026-10-24');
  const before = evidenceFor(A.task).length;

  media.set('MEDIAbig', { mime: 'image/jpeg', declared: 6 * 1024 * 1024, bytes: jpeg() });
  await deliver(hookBody({ messages: [img(NUM_A, 'MEDIAbig')] }));
  ok('a photo declared over 5 MB is refused before downloading', evidenceFor(A.task).length === before && !calls.some((c) => c.url.includes('mid=MEDIAbig')));
  ok('A is told the limit, in Hindi', (bodyOf(sends().at(-1)!).text?.body ?? '').includes('5 MB तक'));
  media.set('MEDIAliar', { mime: 'image/jpeg', declared: 1000, bytes: jpeg(5 * 1024 * 1024 + 10) });
  await deliver(hookBody({ messages: [img(NUM_A, 'MEDIAliar')] }));
  ok('a photo whose bytes are over 5 MB is refused after all', evidenceFor(A.task).length === before);
  media.set('MEDIAvideo', { mime: 'video/mp4', declared: 1000, bytes: jpeg() });
  await deliver(hookBody({ messages: [msg(NUM_A, { type: 'document', document: { id: 'MEDIAvideo', mime_type: 'image/jpeg', filename: 'x.jpg' } })] }));
  ok('media that is not an image (by Meta\'s own type) is refused', evidenceFor(A.task).length === before && n(`select count(*) c from audit_events where seq > ? and action = 'whatsapp.proof_refused' and reason = 'not_image'`, seqBefore) === 1);
  media.set('MEDIAtext', { mime: 'image/jpeg', declared: 20, bytes: new Uint8Array(Buffer.from('this is not a photo')) });
  await deliver(hookBody({ messages: [img(NUM_A, 'MEDIAtext')] }));
  ok('bytes that are not a JPEG/PNG/WebP are refused by the proof check', evidenceFor(A.task).length === before && n(`select count(*) c from audit_events where seq > ? and action = 'whatsapp.proof_refused' and reason = 'bad_photo'`, seqBefore) === 1);

  media.set('MEDIAgood', { mime: 'image/jpeg', declared: 2048, bytes: jpeg() });
  const photoId = wamid(NUM_A);
  await deliver(hookBody({ messages: [img(NUM_A, 'MEDIAgood', 'रजिस्टर की फ़ोटो', photoId)] }));
  const ev = evidenceFor(A.task);
  ok('a good photo becomes one evidence row on the task in context', ev.length === before + 1);
  const e = ev.at(-1)!;
  ok('channel whatsapp, GPS unavailable, status pending', e?.channel === 'whatsapp' && e.gps_status === 'unavailable' && e.status === 'pending');
  ok('the caption is the note; the client id is derived from WhatsApp\'s message id', JSON.parse(e.summary).note === 'रजिस्टर की फ़ोटो' && /^wa-[0-9a-f]{40}$/.test(e.client_id));
  ok('the photo itself is stored with the evidence', n('select count(*) c from evidence_files where evidence_id = ?', e.id) === 1);
  const dl = calls.filter((c) => c.url.includes('MEDIAgood'));
  ok('the media was fetched in two steps, both with the Bearer token', dl.length === 2 && dl.every((c) => c.method === 'GET' && c.headers.authorization === `Bearer ${TOKEN}`) && dl[1].url.startsWith('https://lookaside.fbsbx.com/'));
  ok('evidence.submitted audited as A with source whatsapp', n(`select count(*) c from audit_events where seq > ? and action = 'evidence.submitted' and actor_user_id = ? and source = 'whatsapp'`, seqBefore, A.user) === 1);
  ok('A gets the receipt in Hindi with the evidence id', (bodyOf(sends().at(-1)!).text?.body ?? '').includes(`(${e.id})`) && (bodyOf(sends().at(-1)!).text?.body ?? '').includes('सबूत मिल गया'));

  await deliver(hookBody({ messages: [img(NUM_A, 'MEDIAgood', 'रजिस्टर की फ़ोटो', photoId)] }));
  ok('the same image message again (a retry) adds no second row', evidenceFor(A.task).length === before + 1 && lastPost?.counts?.duplicates === 1);
  run('delete from whatsapp_inbound where id = ?', out.providerKey(photoId));
  await deliver(hookBody({ messages: [img(NUM_A, 'MEDIAgood', 'रजिस्टर की फ़ोटो', photoId)] }));
  ok('even past the inbound log, submitEvidence\'s client id keeps it to one row', evidenceFor(A.task).length === before + 1 && (bodyOf(sends().at(-1)!).text?.body ?? '').includes('पहले ही मिल चुकी'));
  await deliver(hookBody({ messages: [img(NUM_A, 'MEDIAgood')] }));
  ok('the same picture in a new message is refused as a duplicate photo', evidenceFor(A.task).length === before + 1 && (bodyOf(sends().at(-1)!).text?.body ?? '').includes('यही फ़ोटो'));

  media.set('MEDIAb', { mime: 'image/jpeg', declared: 2048, bytes: jpeg() });
  const bEv = evidenceFor(A.task).length;
  await deliver(hookBody({ messages: [img(NUM_B, 'MEDIAb', `proof for ${A.task}`)] }));
  ok('B cannot hand in proof for A\'s task by naming it in the caption', evidenceFor(A.task).length === bEv && bodyOf(sends().at(-1)!).text?.body === 'This task is not assigned to you.');
  ok('that refusal is audited as B', n(`select count(*) c from audit_events where seq > ? and action = 'whatsapp.proof_refused' and actor_user_id = ? and reason = 'not_owner'`, seqBefore, B.user) === 1);
  media.set('MEDIAb2', { mime: 'image/jpeg', declared: 2048, bytes: jpeg() });
  const bOwn = evidenceFor(B.task).length;
  await deliver(hookBody({ messages: [img(NUM_B, 'MEDIAb2', B.task)] }));
  ok('B\'s photo with B\'s own task id in the caption is saved on B\'s task', evidenceFor(B.task).length === bOwn + 1 && evidenceFor(B.task).at(-1)!.channel === 'whatsapp');
  await deliver(hookBody({ messages: [msg(NUM_B, { type: 'audio', audio: { id: 'MEDIAaudio' } })] }));
  ok('a voice note gets "I can read text, buttons and photos"', (bodyOf(sends().at(-1)!).text?.body ?? '').startsWith('I can read text'));
}

// ------------------------------------------------------------------ privacy
console.log('\n— no phone number anywhere —');
{
  const textCols = (table: string) => all<{ name: string; type: string }>(`select name, type from pragma_table_info('${table}')`).map((c) => c.name);
  const dump = (table: string, where = '1=1', ...p: (string | number)[]) => {
    const cols = textCols(table);
    return all<Record<string, unknown>>(`select ${cols.map((c) => `"${c}"`).join(', ')} from ${table} where ${where}`, ...p).map((r) => JSON.stringify(r)).join('\n');
  };
  const haystacks: [string, string][] = [
    ['whatsapp_contacts', dump('whatsapp_contacts')],
    ['whatsapp_sends', dump('whatsapp_sends')],
    ['whatsapp_inbound', dump('whatsapp_inbound')],
    ['outbox_messages', dump('outbox_messages', `channel = 'whatsapp' and delivery_status <> 'simulated_not_sent'`)],
    ['audit_events', dump('audit_events', 'seq > ?', seqBefore)],
    ['evidence', dump('evidence', `channel = 'whatsapp' and submitted_at >= '2026-10-24'`)],
    ['evidence_files', dump('evidence_files')],
  ];
  ok('the WhatsApp tables have rows to check', n('select count(*) c from whatsapp_sends') > 10 && n('select count(*) c from whatsapp_inbound') > 10);
  for (const [name, h] of haystacks) {
    const leaks = ALL_NUMBERS.flatMap((p) => leakForms(p).filter((f) => h.includes(f)));
    ok(`no number (digits, E.164 or base64) in ${name}`, leaks.length === 0, leaks.join(','));
  }
  const logs = printed.join('\n');
  ok('the token was never printed', !logs.includes(TOKEN) && !logs.includes('t0k3n'));
  ok('no number was ever printed', ALL_NUMBERS.every((p) => leakForms(p).every((f) => !logs.includes(f))));
  ok('no WhatsApp message id (which embeds the number) is stored raw', !haystacks.some(([, h]) => h.includes('wamid.')));
  const chain = feed.verifyAuditChain(auditor);
  ok('the audit chain verifies with the WhatsApp rows in it', chain.linked && chain.contentOk, JSON.stringify(chain).slice(0, 160));
  ok(`evidence rows added: ${n('select count(*) c from evidence') - evBefore}`, n('select count(*) c from evidence') - evBefore === 2);
}

// ------------------------------------------------------------------ restore
try { db().close(); } catch { /* already closed */ }
swap(BACKUP, LIVE);
try { rmSync(BACKUP); } catch { /* fine */ }
try { rmSync(join(DATA, 'karyavahi.db-wal')); rmSync(join(DATA, 'karyavahi.db-shm')); } catch { /* fine */ }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
