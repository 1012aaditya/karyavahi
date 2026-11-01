import type { DatabaseSync } from 'node:sqlite';

/**
 * Extension tables for the real WhatsApp channel (Meta Cloud API test number; see
 * src/lib/whatsapp/ and the README section "WhatsApp (Meta Cloud API test number)").
 *
 *   whatsapp_contacts — one row per mapped persona: when they last wrote to us (the 24-hour
 *                       customer-service window is measured from it), when the last hello_world
 *                       opener went out, and what they were last talking about (a task, or the
 *                       numbered menu) so a reply of "1" or a photo lands on the right task.
 *   whatsapp_sends    — every call to the Cloud API: what kind (text, reply buttons, template),
 *                       why (an outbox row, a reply, the menu), the outcome and its short reason.
 *   whatsapp_inbound  — every inbound message id already handled, so Meta's retries of a webhook
 *                       never act twice.
 *
 * And one column on the seed's outbox: outbox_messages.provider_message_id.
 *
 * No phone number is stored anywhere. WhatsApp's own message ids ("wamid.HBgM…") carry the
 * phone number in base64, so they are not stored either: provider_message_id and the inbound
 * ids are a SHA-256 of WhatsApp's id ('wa_' + 40 hex), which is enough to match a status
 * update to the message it is about.
 *
 * Same rules as the other extension modules: created next to the seed's tables idempotently
 * whenever a connection opens, with a version marker in ext_meta; a demo reset (which restores
 * the pristine seed file) brings them back empty.
 */

export const WHATSAPP_VERSION = 'whatsapp-v1';

const WHATSAPP_DDL = `
create table if not exists whatsapp_contacts (
  user_id text primary key,
  last_inbound_at text,
  template_sent_at text,
  context text check (context is null or context in ('task', 'menu')),
  last_task_id text,
  menu_task_ids text,
  updated_at text not null
);
create table if not exists whatsapp_sends (
  id text primary key,
  user_id text not null,
  outbox_id text,
  kind text not null check (kind in ('text', 'interactive', 'template')),
  purpose text not null check (purpose in ('outbox', 'opener', 'reply', 'menu')),
  task_id text,
  provider_message_id text,
  status text not null check (status in ('sent', 'delivered', 'read', 'failed')),
  error text,
  created_at text not null,
  updated_at text not null
);
create index if not exists whatsapp_sends_provider on whatsapp_sends(provider_message_id);
create index if not exists whatsapp_sends_outbox on whatsapp_sends(outbox_id);
create index if not exists whatsapp_sends_user on whatsapp_sends(user_id, created_at);
create table if not exists whatsapp_inbound (
  id text primary key,
  user_id text,
  kind text not null,
  received_at text not null,
  outcome text
);
`;

export function ensureWhatsAppTables(c: DatabaseSync): void {
  const r = c.prepare(`select value from ext_meta where key = 'whatsapp_version'`).get() as { value: string } | undefined;
  if (r?.value === WHATSAPP_VERSION) return;
  c.exec('begin immediate');
  try {
    c.exec(WHATSAPP_DDL);
    const has = c.prepare(`select 1 from pragma_table_info('outbox_messages') where name = 'provider_message_id'`).get();
    if (!has) c.exec('alter table outbox_messages add column provider_message_id text');
    c.exec('create index if not exists outbox_provider_msg on outbox_messages(provider_message_id)');
    c.prepare(
      `insert into ext_meta (key, value) values ('whatsapp_version', ?) on conflict(key) do update set value = excluded.value`,
    ).run(WHATSAPP_VERSION);
    c.exec('commit');
  } catch (e) {
    try { c.exec('rollback'); } catch { /* already rolled back */ }
    throw e;
  }
}
