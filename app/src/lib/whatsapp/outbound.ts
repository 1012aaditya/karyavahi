import 'server-only';
import { createHash } from 'node:crypto';
import { all, one, run, nextIdFor } from '../db';
import { whatsappConfig, type WhatsAppConfig } from './config';
import { postMessage, textPayload, buttonsPayload, templatePayload, type MessagePayload, type ReplyButton, type SendResult } from './send';
import { taskButtons, taskFooter, type Lang } from './texts';

/**
 * Sending on the real WhatsApp channel, and the 24-hour rule.
 *
 * When the outbox gets a WhatsApp row for a persona listed in WHATSAPP_TEST_RECIPIENTS (and the
 * Cloud API is configured), the row is written as 'queued' and handed to dispatchOutbox() after
 * the write's transaction has committed. Sending never happens inside a transaction and never
 * holds one up; its outcome comes back onto the same row:
 *
 *   queued          about to be sent
 *   sent            WhatsApp accepted it (provider_message_id is set)
 *   delivered/read  WhatsApp's status callbacks, through the webhook
 *   failed          refused; the short reason is on the whatsapp_sends row
 *   awaiting_reply  outside the 24-hour window: hello_world went out instead, and this message
 *                   waits until the tester writes to the test number once
 *
 * WhatsApp's rule: a business may send free-form text (and reply buttons) only within 24 hours
 * of the person's last message to it. Outside that window only an approved template can go,
 * and Meta's test number has exactly one, hello_world. So: inside the window the full Hindi or
 * English message goes with its reply buttons; outside it, hello_world goes (at most once a day
 * per persona) and the message waits. The moment the tester writes anything, the window is open,
 * and the waiting messages (the latest three) are sent before the reply to what they wrote.
 *
 * Personas not in the mapping, and every row when the API is not configured, stay
 * 'simulated_not_sent' exactly as before. All WhatsApp work in this process runs one item at a
 * time through a single queue, so two messages to the same person cannot both decide to send the
 * opener, and a status callback is never applied half-way through a send.
 */

export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const OPENER_TEMPLATE = { name: 'hello_world', language: 'en_US' } as const;

/** WhatsApp message ids embed the phone number, so only this digest of one is ever stored. */
export const providerKey = (wamid: string): string => `wa_${createHash('sha256').update(wamid).digest('hex').slice(0, 40)}`;

const wallNow = () => new Date().toISOString();

// ---------------------------------------------------------------- the one queue
type Chain = { p: Promise<void> };
const chain: Chain = ((globalThis as unknown as { __kv_wa?: Chain }).__kv_wa ??= { p: Promise.resolve() });

const safeMessage = (e: unknown) => String((e as Error)?.message ?? e).replace(/\+?\d[\d\s-]{6,}\d/g, '[number]').slice(0, 200);

/** Run WhatsApp work after everything queued before it. Never rejects. */
export function enqueue(fn: () => Promise<void> | void): Promise<void> {
  const next = chain.p.then(fn).catch((e) => { console.error(`[whatsapp] ${safeMessage(e)}`); });
  chain.p = next;
  return next;
}

/** Resolves once the queue is empty, including work queued by work. For tests and scripts. */
export async function whatsappIdle(): Promise<void> {
  for (;;) {
    const p = chain.p;
    await p;
    await new Promise((r) => setImmediate(r));
    if (p === chain.p) return;
  }
}

// ---------------------------------------------------------------- who, and is the window open
export interface Persona { id: string; full_name: string; email: string; language: Lang; status: string | null }

export function personaById(userId: string): Persona | null {
  const u = one<{ id: string; full_name: string; email: string; preferred_language: string | null; status: string | null }>(
    'select id, full_name, email, preferred_language, status from users where id = ?', userId,
  );
  return u ? { id: u.id, full_name: u.full_name, email: u.email, language: u.preferred_language === 'hi' ? 'hi' : 'en', status: u.status } : null;
}

export function personaByEmail(email: string): Persona | null {
  const u = one<{ id: string }>('select id from users where lower(email) = ?', email.toLowerCase());
  return u ? personaById(u.id) : null;
}

/** The persona's number, from the environment only. Never stored, never returned to a page. */
export function recipientFor(cfg: WhatsAppConfig, userId: string): string | null {
  const p = personaById(userId);
  if (!p || (p.status && p.status !== 'active')) return null;
  return cfg.recipients.get(p.email.toLowerCase()) ?? null;
}

/** The outbox status a new row starts with: 'queued' when it will really be sent. */
export function initialDeliveryStatus(userId: string, channel: string): 'queued' | 'simulated_not_sent' {
  if (channel !== 'whatsapp') return 'simulated_not_sent';
  const cfg = whatsappConfig();
  if (!cfg.sending || cfg.recipients.size === 0) return 'simulated_not_sent';
  return recipientFor(cfg, userId) ? 'queued' : 'simulated_not_sent';
}

interface Contact {
  user_id: string; last_inbound_at: string | null; template_sent_at: string | null;
  context: 'task' | 'menu' | null; last_task_id: string | null; menu_task_ids: string | null;
}

export function contactOf(userId: string): Contact | null {
  return one<Contact>('select user_id, last_inbound_at, template_sent_at, context, last_task_id, menu_task_ids from whatsapp_contacts where user_id = ?', userId);
}

export function updateContact(userId: string, patch: Partial<Omit<Contact, 'user_id'>>): void {
  run(`insert into whatsapp_contacts (user_id, updated_at) values (?, ?) on conflict(user_id) do nothing`, userId, wallNow());
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length === 0) return;
  run(
    `update whatsapp_contacts set ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? where user_id = ?`,
    ...keys.map((k) => (patch[k] ?? null) as string | null), wallNow(), userId,
  );
}

/** Open when the persona wrote to the test number less than 24 hours ago (wall clock, not the demo clock). */
export function windowOpen(userId: string, now = Date.now()): boolean {
  const at = contactOf(userId)?.last_inbound_at;
  return !!at && now - Date.parse(at) < WINDOW_MS;
}

export function windowClosesAt(userId: string): string | null {
  const at = contactOf(userId)?.last_inbound_at;
  if (!at) return null;
  const end = Date.parse(at) + WINDOW_MS;
  return end > Date.now() ? new Date(end).toISOString() : null;
}

// ---------------------------------------------------------------- one call, recorded
type Purpose = 'outbox' | 'opener' | 'reply' | 'menu';

function recordSend(o: {
  userId: string; outboxId?: string | null; payload: MessagePayload; purpose: Purpose; taskId?: string | null; result: SendResult;
}): string {
  const id = nextIdFor('whatsapp_send', 'whatsapp_sends', 'WAS-', 6);
  run(
    `insert into whatsapp_sends (id, user_id, outbox_id, kind, purpose, task_id, provider_message_id, status, error, created_at, updated_at)
     values (?,?,?,?,?,?,?,?,?,?,?)`,
    id, o.userId, o.outboxId ?? null, o.payload.type, o.purpose, o.taskId ?? null,
    o.result.ok ? providerKey(o.result.messageId) : null,
    o.result.ok ? 'sent' : 'failed',
    o.result.ok ? null : `${o.result.code ? `${o.result.code}: ` : ''}${o.result.reason}`.slice(0, 200),
    wallNow(), wallNow(),
  );
  return id;
}

async function send(cfg: WhatsAppConfig, o: { userId: string; to: string; payload: MessagePayload; purpose: Purpose; outboxId?: string | null; taskId?: string | null }): Promise<SendResult> {
  const result = await postMessage(cfg, o.payload);
  recordSend({ ...o, result });
  if (!result.ok) console.warn(`[whatsapp] ${o.purpose} ${o.payload.type} to ${o.userId} failed: HTTP ${result.httpStatus}${result.code ? ` code ${result.code}` : ''}`);
  return result;
}

/** WhatsApp's "more than 24 hours since the customer last replied" refusal. */
const OUTSIDE_WINDOW_CODE = 131047;

// ---------------------------------------------------------------- outbox rows
interface OutboxRow { id: string; user_id: string; channel: string; body: string; entity_type: string; entity_id: string; delivery_status: string; language: string }

const taskOpen = (taskId: string) =>
  !!one('select 1 from tasks where id = ? and status in (\'assigned\', \'acknowledged\', \'in_progress\', \'sent_back\')', taskId);

/** Queue a freshly written outbox row for sending. Call it inside or outside a transaction. */
export function scheduleOutboxSend(outboxId: string): void {
  void enqueue(async () => {
    // Let the transaction that wrote the row commit (or roll back) first.
    await new Promise((r) => setImmediate(r));
    await dispatchOutbox(outboxId);
  });
}

/** Send one queued outbox row now: the full message inside the window, the opener outside it. */
export async function dispatchOutbox(outboxId: string): Promise<void> {
  const cfg = whatsappConfig();
  const row = one<OutboxRow>('select id, user_id, channel, body, entity_type, entity_id, delivery_status, language from outbox_messages where id = ?', outboxId);
  if (!row || row.channel !== 'whatsapp' || row.delivery_status !== 'queued') return;
  const to = cfg.sending ? recipientFor(cfg, row.user_id) : null;
  if (!to) { run(`update outbox_messages set delivery_status = 'simulated_not_sent' where id = ?`, row.id); return; }
  if (windowOpen(row.user_id)) await sendFull(cfg, row, to);
  else await sendOpener(cfg, row, to);
}

async function sendFull(cfg: WhatsAppConfig, row: OutboxRow, to: string): Promise<void> {
  const lang: Lang = row.language === 'hi' ? 'hi' : 'en';
  const isTask = row.entity_type === 'task' && taskOpen(row.entity_id);
  const payload = isTask
    ? buttonsPayload(to, `${row.body}\n\n${taskFooter(lang, row.entity_id)}`, taskButtons(lang, row.entity_id))
    : textPayload(to, row.body);
  const r = await send(cfg, { userId: row.user_id, to, payload, purpose: 'outbox', outboxId: row.id, taskId: isTask ? row.entity_id : null });
  if (r.ok) {
    run(`update outbox_messages set delivery_status = 'sent', provider_message_id = ? where id = ?`, providerKey(r.messageId), row.id);
    if (isTask) updateContact(row.user_id, { context: 'task', last_task_id: row.entity_id });
  } else if (r.code === OUTSIDE_WINDOW_CODE) {
    // WhatsApp says the window is closed after all (it is the judge): fall back to the opener.
    updateContact(row.user_id, { last_inbound_at: null, template_sent_at: null });
    await sendOpener(cfg, row, to);
  } else {
    run(`update outbox_messages set delivery_status = 'failed' where id = ?`, row.id);
  }
}

async function sendOpener(cfg: WhatsAppConfig, row: OutboxRow, to: string): Promise<void> {
  const c = contactOf(row.user_id);
  const openerAt = c?.template_sent_at ? Date.parse(c.template_sent_at) : 0;
  const repliedSince = !!c?.last_inbound_at && Date.parse(c.last_inbound_at) > openerAt;
  // One hello_world a day per persona is enough to make the phone buzz; later messages just wait.
  if (openerAt && Date.now() - openerAt < WINDOW_MS && !repliedSince) {
    run(`update outbox_messages set delivery_status = 'awaiting_reply' where id = ?`, row.id);
    return;
  }
  const r = await send(cfg, {
    userId: row.user_id, to, payload: templatePayload(to, OPENER_TEMPLATE.name, OPENER_TEMPLATE.language), purpose: 'opener', outboxId: row.id,
  });
  if (r.ok) {
    updateContact(row.user_id, { template_sent_at: wallNow() });
    run(`update outbox_messages set delivery_status = 'awaiting_reply' where id = ?`, row.id);
  } else {
    run(`update outbox_messages set delivery_status = 'failed' where id = ?`, row.id);
  }
}

/** The window has just opened: send what was waiting (the latest three, oldest of them first). */
export async function flushWaiting(userId: string): Promise<number> {
  const cfg = whatsappConfig();
  const to = cfg.sending ? recipientFor(cfg, userId) : null;
  if (!to) return 0;
  const rows = all<OutboxRow>(
    `select id, user_id, channel, body, entity_type, entity_id, delivery_status, language from outbox_messages
      where user_id = ? and channel = 'whatsapp' and delivery_status = 'awaiting_reply' order by ts desc, id desc limit 3`, userId,
  ).reverse();
  for (const row of rows) await sendFull(cfg, row, to);
  return rows.length;
}

// ---------------------------------------------------------------- replies (inside the window)
/** Answer someone who just wrote. Not an outbox row: recorded in whatsapp_sends only. */
export async function sendReply(userId: string, body: string, o: { buttons?: ReplyButton[]; purpose?: 'reply' | 'menu'; taskId?: string | null } = {}): Promise<SendResult | null> {
  const cfg = whatsappConfig();
  const to = cfg.sending ? recipientFor(cfg, userId) : null;
  if (!to) return null;
  const payload = o.buttons?.length ? buttonsPayload(to, body, o.buttons) : textPayload(to, body);
  return send(cfg, { userId, to, payload, purpose: o.purpose ?? 'reply', taskId: o.taskId ?? null });
}

// ---------------------------------------------------------------- status callbacks
const RANK: Record<string, number> = { queued: 0, awaiting_reply: 0, sent: 1, delivered: 2, read: 3 };

/**
 * A status callback from the webhook: sent → delivered → read, or failed. Statuses can arrive
 * out of order, so a row never moves backwards (read stays read when a late "delivered" comes).
 * Returns how many rows changed.
 */
export function applyStatus(wamid: string, status: string, reason: string | null): number {
  if (!['sent', 'delivered', 'read', 'failed'].includes(status)) return 0;
  const key = providerKey(wamid);
  let changed = 0;
  const moves = (current: string) => status === 'failed'
    ? current !== 'read' && current !== 'delivered' && current !== 'failed'
    : (RANK[current] ?? 99) < RANK[status];
  for (const s of all<{ id: string; status: string }>('select id, status from whatsapp_sends where provider_message_id = ?', key)) {
    if (!moves(s.status)) continue;
    changed += run('update whatsapp_sends set status = ?, error = coalesce(?, error), updated_at = ? where id = ?', status, reason, wallNow(), s.id);
  }
  for (const o of all<{ id: string; delivery_status: string }>('select id, delivery_status from outbox_messages where provider_message_id = ?', key)) {
    if (!moves(o.delivery_status)) continue;
    changed += run('update outbox_messages set delivery_status = ? where id = ?', status, o.id);
  }
  return changed;
}

/** The short reason a WhatsApp outbox row failed or is waiting, for the admin page. */
export function deliveryNotes(outboxIds: string[]): Map<string, { error: string | null; opener: boolean }> {
  const out = new Map<string, { error: string | null; opener: boolean }>();
  if (outboxIds.length === 0) return out;
  const rows = all<{ outbox_id: string; purpose: string; status: string; error: string | null }>(
    `select outbox_id, purpose, status, error from whatsapp_sends where outbox_id in (${outboxIds.map(() => '?').join(',')}) order by id`, ...outboxIds,
  );
  for (const r of rows) {
    const prev = out.get(r.outbox_id) ?? { error: null, opener: false };
    // The latest call decides the reason: a failed opener followed by a delivered message is not a failure.
    out.set(r.outbox_id, { error: r.status === 'failed' ? r.error : null, opener: prev.opener || r.purpose === 'opener' });
  }
  return out;
}
