import 'server-only';
import { one, run, nextIdFor } from '../db';
import { nowIso } from '../clock';
import { Refused, actingRole, may } from '../guard';
import { hasRole } from '../scope';
import type { Session } from '../session';
import { appendAudit } from '../write';
import { whatsappConfig, maskPhone } from './config';
import { initialDeliveryStatus, personaByEmail, scheduleOutboxSend, windowClosesAt } from './outbound';
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
