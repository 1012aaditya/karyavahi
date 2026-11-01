import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { all, one, run } from '../db';
import { loadSession, type Session } from '../session';
import { Refused, actingRole } from '../guard';
import { acknowledgeTask, startTask, submitEvidence, appendAudit, withAuditSource } from '../write';
import { PHOTO_MAX_BYTES } from '../evidence-files';
import { whatsappConfig, emailForSender, type WhatsAppConfig } from './config';
import { fetchMedia } from './send';
import {
  applyStatus, contactOf, enqueue, flushWaiting, personaByEmail, personaById, providerKey, sendReply, updateContact, type Persona,
} from './outbound';
import { ACTIONS, W, menuText, taskButtons, taskCard, type ButtonAction, type Lang, type MenuTask } from './texts';

/**
 * The webhook Meta calls: https://<host>/api/whatsapp/webhook (route.ts is a thin wrapper).
 *
 * GET  the one-time verification handshake: hub.mode=subscribe and hub.verify_token equal to
 *      WHATSAPP_VERIFY_TOKEN (compared in constant time) → echo hub.challenge; anything else 403.
 *
 * POST every event. The X-Hub-Signature-256 header (HMAC-SHA256 of the raw body with
 *      WHATSAPP_APP_SECRET) is checked, in constant time, before the body is even parsed; a
 *      missing or wrong signature gets 401. Then, quickly, before answering 200:
 *        - status updates (sent / delivered / read / failed) are applied to the outbox row
 *        - each inbound message id is claimed in whatsapp_inbound, so a retried webhook (Meta
 *          retries until it gets a 200) is never acted on twice
 *        - a sender whose number is not in WHATSAPP_TEST_RECIPIENTS is ignored; only a count
 *          goes in the audit chain, never the number
 *      What the messages ask for (acknowledge, start, a photo as proof) runs after the 200,
 *      through the same queue as sending.
 *
 * Every action runs as the persona, with the session the app's own loader builds for them
 * (loadSession), through the ordinary write functions — so the same authority checks apply as
 * in the app: someone can only acknowledge, start or hand in proof for their own task. Their
 * audit rows carry source 'whatsapp'.
 */

export const MAX_WEBHOOK_BYTES = 1024 * 1024;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function safeEqual(a: string, b: string): boolean {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y) && a.length === b.length;
}

// ---------------------------------------------------------------- GET: the handshake
export function verifyHandshake(params: URLSearchParams): { status: number; body: string } {
  const cfg = whatsappConfig();
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token') ?? '';
  const challenge = params.get('hub.challenge') ?? '';
  if (!cfg.verifyToken || mode !== 'subscribe' || !safeEqual(token, cfg.verifyToken)) return { status: 403, body: 'Forbidden' };
  // Meta's challenge is a number; echo nothing else.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(challenge)) return { status: 400, body: 'Bad challenge' };
  return { status: 200, body: challenge };
}

// ---------------------------------------------------------------- POST: the signature
export function verifySignature(raw: Uint8Array, header: string | null, secret: string): boolean {
  if (!secret || !header) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!m) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  const given = Buffer.from(m[1], 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// ---------------------------------------------------------------- the payload, as much as we read
interface WaMessage {
  from?: string; id?: string; timestamp?: string; type?: string;
  text?: { body?: string };
  interactive?: { type?: string; button_reply?: { id?: string; title?: string }; list_reply?: { id?: string } };
  button?: { payload?: string; text?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; caption?: string; filename?: string };
}
interface WaStatus { id?: string; status?: string; errors?: { code?: number; title?: string; message?: string }[] }
interface WaPayload {
  object?: string;
  entry?: { changes?: { field?: string; value?: { metadata?: { phone_number_id?: string }; messages?: WaMessage[]; statuses?: WaStatus[] } }[] }[];
}

interface Claimed { userId: string; msg: WaMessage; key: string }

export interface WebhookAccepted {
  status: number;
  body: string;
  /** What the messages ask for. Run it after answering (route.ts uses next/server after()). */
  work?: () => Promise<void>;
  counts?: { statuses: number; messages: number; duplicates: number; unknown: number };
}

/**
 * Check, record and claim one webhook delivery. Synchronous and quick: it is what stands between
 * Meta and its 200. The returned `work` does the rest.
 */
export function acceptWebhook(raw: Uint8Array, signature: string | null): WebhookAccepted {
  const cfg = whatsappConfig();
  if (!cfg.appSecret) return { status: 503, body: 'WhatsApp webhook is not configured' };
  if (raw.length > MAX_WEBHOOK_BYTES) return { status: 413, body: 'Too large' };
  if (!verifySignature(raw, signature, cfg.appSecret)) return { status: 401, body: 'Bad signature' };

  let payload: WaPayload;
  try { payload = JSON.parse(Buffer.from(raw).toString('utf8')) as WaPayload; } catch { return { status: 400, body: 'Bad JSON' }; }
  const counts = { statuses: 0, messages: 0, duplicates: 0, unknown: 0 };
  if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) return { status: 200, body: 'OK', counts };

  const claimed: Claimed[] = [];
  for (const entry of payload.entry) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== 'messages' || !change.value) continue;
      const v = change.value;
      // Events for another number on the same Meta app are not ours.
      if (cfg.phoneNumberId && v.metadata?.phone_number_id && v.metadata.phone_number_id !== cfg.phoneNumberId) continue;

      for (const st of v.statuses ?? []) {
        if (!st?.id || !st.status) continue;
        const e = st.errors?.[0];
        const reason = st.status === 'failed' && e ? `${e.code ?? ''}${e.code ? ': ' : ''}${e.title ?? e.message ?? 'failed'}` : null;
        // Replies such as the menu have no outbox row, so a late failure would otherwise leave no trace.
        if (st.status === 'failed') console.warn(`[whatsapp] Meta reported a delivery failure: ${reason ? scrub(reason) : 'no reason given'}`);
        counts.statuses += applyStatus(st.id, st.status, reason ? scrub(reason) : null) > 0 ? 1 : 0;
      }

      for (const msg of v.messages ?? []) {
        if (!msg?.id || !msg.from) continue;
        const key = providerKey(msg.id);
        const email = emailForSender(cfg, msg.from);
        const persona = email ? personaByEmail(email) : null;
        const fresh = run(
          `insert into whatsapp_inbound (id, user_id, kind, received_at, outcome) values (?,?,?,?,?) on conflict(id) do nothing`,
          key, persona?.id ?? null, String(msg.type ?? 'unknown').slice(0, 20), new Date().toISOString(), persona ? 'claimed' : 'unknown_sender',
        ) > 0;
        if (!fresh) { counts.duplicates++; continue; }
        if (!persona) { counts.unknown++; continue; }
        counts.messages++;
        claimed.push({ userId: persona.id, msg, key });
      }
    }
  }

  if (counts.unknown > 0) {
    appendAudit({
      actorUserId: null, actorRole: 'system', actorLabel: 'whatsapp:webhook', action: 'whatsapp.unknown_sender_ignored',
      entityType: 'whatsapp', entityId: 'webhook', after: { messages: counts.unknown }, source: 'whatsapp',
      reason: 'sender is not a mapped test recipient',
    });
  }

  const work = claimed.length === 0 ? undefined : () => enqueue(async () => {
    for (const c of claimed) {
      try { await handleMessage(c); } catch (e) {
        run(`update whatsapp_inbound set outcome = 'error' where id = ?`, c.key);
        console.error(`[whatsapp] handling a message failed: ${scrub(String((e as Error)?.message ?? e)).slice(0, 200)}`);
      }
    }
  });
  return { status: 200, body: 'OK', work, counts };
}

const scrub = (s: string) => s.replace(/\+?\d[\d\s-]{6,}\d/g, '[number]').slice(0, 160);
const TASK_ID = /\bTSK-\d{3,7}\b/i;

// ---------------------------------------------------------------- one message, as the persona
async function handleMessage(c: Claimed): Promise<void> {
  const persona = personaById(c.userId);
  const session = persona && (!persona.status || persona.status === 'active') ? loadSession(persona.id) : null;
  const outcome = (o: string) => run('update whatsapp_inbound set outcome = ? where id = ?', o, c.key);
  if (!persona || !session) {
    appendAudit({
      actorUserId: c.userId, actorRole: 'unknown', action: 'whatsapp.message_refused', entityType: 'whatsapp_message', entityId: c.key,
      reason: 'account is not active', result: 'failure', source: 'whatsapp',
    });
    outcome('inactive');
    return;
  }
  const lang = persona.language;
  const type = c.msg.type ?? 'unknown';

  // Writing to the test number opens the 24-hour window; what was waiting goes first.
  updateContact(persona.id, { last_inbound_at: new Date().toISOString() });
  appendAudit({
    actorUserId: persona.id, actorRole: actingRole(session), action: 'whatsapp.message_received',
    entityType: 'whatsapp_message', entityId: c.key, after: { type }, source: 'whatsapp',
  });
  await flushWaiting(persona.id);

  if (type === 'interactive' || type === 'button') {
    const id = c.msg.interactive?.button_reply?.id ?? c.msg.interactive?.list_reply?.id ?? c.msg.button?.payload ?? '';
    const m = /^(ack|start|proof):(TSK-\d{3,7})$/.exec(id);
    if (m) { outcome(await act(persona, session, m[1] as ButtonAction, m[2])); return; }
    // A tap on something else (hello_world has no buttons): treat its text like typed text.
    outcome(await onText(persona, session, c.msg.button?.text ?? c.msg.interactive?.button_reply?.title ?? ''));
    return;
  }
  if (type === 'text') { outcome(await onText(persona, session, c.msg.text?.body ?? '')); return; }
  if (type === 'image' || (type === 'document' && String(c.msg.document?.mime_type ?? '').startsWith('image/'))) {
    const media = type === 'image' ? c.msg.image : c.msg.document;
    outcome(await onPhoto(persona, session, c, media?.id ?? '', media?.caption ?? ''));
    return;
  }
  await sendReply(persona.id, W.unsupported(lang));
  outcome('unsupported');
}

function openTasks(userId: string): (MenuTask & { status: string })[] {
  return all<MenuTask & { status: string }>(
    `select id, title_en, title_hi, due_date, status from tasks
      where owner_user_id = ? and status in ('assigned', 'acknowledged', 'in_progress', 'sent_back')
      order by due_date, id limit 5`, userId,
  );
}

async function sendMenu(persona: Persona): Promise<void> {
  const tasks = openTasks(persona.id);
  updateContact(persona.id, { context: 'menu', menu_task_ids: JSON.stringify(tasks.map((t) => t.id)) });
  await sendReply(persona.id, menuText(persona.language, persona.full_name, tasks), { purpose: 'menu' });
}

async function sendTaskCard(persona: Persona, taskId: string): Promise<string> {
  const t = one<MenuTask & { status: string; owner_user_id: string }>(
    'select id, title_en, title_hi, due_date, status, owner_user_id from tasks where id = ?', taskId,
  );
  if (!t || t.owner_user_id !== persona.id) {
    await sendReply(persona.id, W.refused(persona.language, t ? 'not_owner' : 'not_found'));
    return t ? 'refused:not_owner' : 'refused:not_found';
  }
  updateContact(persona.id, { context: 'task', last_task_id: t.id });
  await sendReply(persona.id, taskCard(persona.language, t), { buttons: taskButtons(persona.language, t.id), taskId: t.id });
  return 'task_card';
}

async function onText(persona: Persona, session: Session, raw: string): Promise<string> {
  const text = raw.trim().slice(0, 500);
  const contact = contactOf(persona.id);
  const idInText = TASK_ID.exec(text)?.[0]?.toUpperCase();
  if (idInText && text.replace(TASK_ID, '').trim() === '') return sendTaskCard(persona, idInText);

  const n = /^\d{1,2}$/.test(text) ? Number(text) : null;
  if (n !== null && contact?.context === 'menu') {
    const ids = safeJson<string[]>(contact.menu_task_ids, []);
    const id = ids[n - 1];
    if (id) return sendTaskCard(persona, id);
  }
  if (n !== null && n >= 1 && n <= 3 && contact?.context === 'task' && contact.last_task_id) {
    return act(persona, session, ACTIONS[n - 1], contact.last_task_id);
  }
  // "hi", "menu", or anything else: the numbered list of their open tasks.
  await sendMenu(persona);
  return 'menu';
}

const safeJson = <T>(v: string | null, fallback: T): T => { try { return v ? JSON.parse(v) as T : fallback; } catch { return fallback; } };

const titleOf = (lang: Lang, taskId: string): string => {
  const t = one<{ title_en: string; title_hi: string | null }>('select title_en, title_hi from tasks where id = ?', taskId);
  return t ? (lang === 'hi' && t.title_hi ? t.title_hi : t.title_en) : taskId;
};

function refusalAudit(session: Session, verb: string, taskId: string, code: string): void {
  appendAudit({
    actorUserId: session.user_id, actorRole: actingRole(session), action: `whatsapp.${verb}_refused`,
    entityType: 'task', entityId: taskId, reason: code, result: 'failure', source: 'whatsapp',
  });
}

/** A button tap or a reply of 1, 2 or 3 about one task. */
async function act(persona: Persona, session: Session, action: ButtonAction, taskId: string): Promise<string> {
  const lang = persona.language;
  if (action === 'proof') {
    const t = one<{ owner_user_id: string }>('select owner_user_id from tasks where id = ?', taskId);
    if (!t || t.owner_user_id !== persona.id) {
      const code = t ? 'not_owner' : 'not_found';
      refusalAudit(session, 'proof', taskId, code);
      await sendReply(persona.id, W.refused(lang, code));
      return `refused:${code}`;
    }
    updateContact(persona.id, { context: 'task', last_task_id: taskId });
    await sendReply(persona.id, W.proofPrompt(lang, titleOf(lang, taskId)));
    return 'proof_prompt';
  }
  try {
    withAuditSource('whatsapp', () => (action === 'ack' ? acknowledgeTask(session, taskId) : startTask(session, taskId)));
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    refusalAudit(session, action === 'ack' ? 'acknowledge' : 'start', taskId, e.code);
    await sendReply(persona.id, W.refused(lang, e.code));
    return `refused:${e.code}`;
  }
  updateContact(persona.id, { context: 'task', last_task_id: taskId });
  const title = titleOf(lang, taskId);
  await sendReply(persona.id, action === 'ack' ? W.acknowledged(lang, title) : W.started(lang, title));
  return action === 'ack' ? 'acknowledged' : 'started';
}

/** A photo: proof for the task named in the caption, or else the task last talked about. */
async function onPhoto(persona: Persona, session: Session, c: Claimed, mediaId: string, caption: string): Promise<string> {
  const lang = persona.language;
  const taskId = TASK_ID.exec(caption)?.[0]?.toUpperCase() ?? contactOf(persona.id)?.last_task_id ?? null;
  if (!taskId) { await sendReply(persona.id, W.whichTask(lang)); return 'no_task'; }

  const cfg: WhatsAppConfig = whatsappConfig();
  const media = await fetchMedia(cfg, mediaId, PHOTO_MAX_BYTES);
  if (!media.ok) {
    refusalAudit(session, 'proof', taskId, media.code);
    await sendReply(persona.id, media.code === 'download_failed' ? W.downloadFailed(lang) : W.refused(lang, media.code));
    return `refused:${media.code}`;
  }
  const note = caption.replace(TASK_ID, '').trim().slice(0, 500) || W.photoNote(lang);
  try {
    const r = withAuditSource('whatsapp', () => submitEvidence(session, {
      taskId, note,
      // WhatsApp's message id is the idempotency key (as a digest: the raw id embeds the number).
      clientId: `wa-${sha(c.msg.id ?? c.key).slice(0, 40)}`,
      location: null, locationError: 'whatsapp',
      photo: { bytes: media.bytes, name: `whatsapp-${taskId}.${media.mime.split('/')[1]?.replace(/[^a-z]/g, '') || 'jpg'}` },
      channel: 'whatsapp',
    }));
    updateContact(persona.id, { context: 'task', last_task_id: taskId });
    const title = titleOf(lang, taskId);
    await sendReply(persona.id, r.duplicate ? W.proofAlready(lang, title, r.evidenceId) : W.proofReceived(lang, title, r.evidenceId));
    return r.duplicate ? 'proof_duplicate' : 'proof_saved';
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    refusalAudit(session, 'proof', taskId, e.code);
    await sendReply(persona.id, W.refused(lang, e.code));
    return `refused:${e.code}`;
  }
}
