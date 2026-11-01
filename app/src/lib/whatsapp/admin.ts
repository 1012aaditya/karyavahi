import 'server-only';
import { one, run, nextIdFor } from '../db';
import { nowIso } from '../clock';
import { Refused, actingRole, may } from '../guard';
import { hasRole } from '../scope';
import type { Session } from '../session';
import { appendAudit } from '../write';
import { whatsappConfig, maskPhone } from './config';
import { initialDeliveryStatus, personaByEmail, scheduleOutboxSend, windowClosesAt } from './outbound';
import { linkBusinessAccount } from './send';
import { W } from './texts';

/** What the outbox page shows about the WhatsApp connection. Numbers only ever masked. */
export interface WhatsAppStatus {
  sending: boolean;
  webhookReady: boolean;
  invalidRecipients: number;
  recipients: { email: string; userId: string | null; name: string | null; masked: string; windowClosesAt: string | null }[];
}

export function whatsappStatus(): WhatsAppStatus {
  const cfg = whatsappConfig();
  return {
    sending: cfg.sending,
    webhookReady: !!cfg.appSecret && !!cfg.verifyToken,
    invalidRecipients: cfg.invalidRecipients,
    recipients: [...cfg.recipients].map(([email, phone]) => {
      const p = personaByEmail(email);
      return { email, userId: p?.id ?? null, name: p?.full_name ?? null, masked: maskPhone(phone), windowClosesAt: p ? windowClosesAt(p.id) : null };
    }),
  };
}

/**
 * "Send a test message to my WhatsApp": demo admin only. It goes the normal way — an outbox row
 * on the persona's WhatsApp channel, sent after the write — so it also shows the 24-hour rule at
 * work: outside the window the phone gets hello_world and the test message waits for a reply.
 */
export function queueTestMessage(s: Session, userId: string): string {
  if (!(hasRole(s, 'demo_admin') && may(s, 'demo.reset'))) {
    appendAudit({
      actorUserId: s.user_id, actorRole: actingRole(s), action: 'whatsapp.test_message_refused',
      entityType: 'user', entityId: /^USR-\d+$/.test(userId) ? userId : 'unknown', reason: 'demo admin only', result: 'failure',
    });
    throw new Refused('Only the demo admin can send a WhatsApp test message.', 'role');
  }
  const cfg = whatsappConfig();
  if (!cfg.sending) throw new Refused('WhatsApp is not configured on this server, so nothing can be sent.', 'not_configured');
  const u = one<{ id: string; preferred_language: string | null }>('select id, preferred_language from users where id = ?', userId);
  if (!u) throw new Refused('No such person.', 'not_found');
  if (initialDeliveryStatus(u.id, 'whatsapp') !== 'queued') {
    throw new Refused('This person is not one of the WhatsApp test recipients.', 'not_mapped');
  }
  const lang = u.preferred_language === 'hi' ? 'hi' : 'en';
  const id = nextIdFor('outbox', 'outbox_messages', 'OBX-', 6);
  run(
    `insert into outbox_messages (id, user_id, channel, ts, template, language, body, entity_type, entity_id, delivery_status)
     values (?,?,'whatsapp',?,'whatsapp_test',?,?,'user',?,'queued')`,
    id, u.id, nowIso(), lang, W.testMessage(lang), u.id,
  );
  appendAudit({
    actorUserId: s.user_id, actorRole: actingRole(s), action: 'whatsapp.test_message_queued',
    entityType: 'outbox_message', entityId: id, after: { to_user: u.id, channel: 'whatsapp' },
  });
  scheduleOutboxSend(id);
  return id;
}

/**
 * "Connect the webhook to this WhatsApp account": demo admin only. Subscribes this app to the
 * WhatsApp Business Account (the "Messaging account ID" on Meta's API Setup page) so Meta forwards
 * real incoming messages, not only its dashboard test events. Uses the server's token; nothing
 * secret passes through the browser. Audited either way.
 */
export async function connectBusinessAccount(s: Session, wabaId: string): Promise<string[]> {
  if (!(hasRole(s, 'demo_admin') && may(s, 'demo.reset'))) {
    appendAudit({
      actorUserId: s.user_id, actorRole: actingRole(s), action: 'whatsapp.link_refused',
      entityType: 'system', entityId: 'whatsapp', reason: 'demo admin only', result: 'failure',
    });
    throw new Refused('Only the demo admin can connect the WhatsApp account.', 'role');
  }
  const id = wabaId.trim();
  if (!/^\d{6,20}$/.test(id)) throw new Refused('That does not look like a WhatsApp Business Account ID (digits only).', 'bad_input');
  const cfg = whatsappConfig();
  if (!cfg.sending) throw new Refused('WhatsApp is not configured on this server.', 'not_configured');
  const r = await linkBusinessAccount(cfg, id);
  appendAudit({
    actorUserId: s.user_id, actorRole: actingRole(s), action: r.ok ? 'whatsapp.account_linked' : 'whatsapp.link_failed',
    entityType: 'system', entityId: 'whatsapp', reason: r.ok ? null : r.reason, result: r.ok ? 'success' : 'failure',
  });
  if (!r.ok) throw new Refused(`Meta refused: ${r.reason}${r.code ? ` (code ${r.code})` : ''}`, 'provider');
  return r.apps;
}
